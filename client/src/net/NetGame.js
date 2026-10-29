// Plays an online match in the browser. The server runs the world; this file only:
//   - sends the player's controls as soon as they change (and at least 20 times a second),
//   - turns server snapshots into a world the normal renderer and HUD can draw,
//     showing everyone 60 ms in the past and blending between the two snapshots
//     around that moment, so movement is smooth at any screen refresh rate,
//   - turns server events back into the usual event-bus events (kill feed, sounds),
//   - opens Banana puzzles that are fetched and checked over the WebSocket.
//
// It emits the same game:state / game:over events as a local game, so the React
// screens treat both the same way.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { on, emit } from '../lib/eventBus.js';
import { MODES, SOLDIER, WEAPONS, ZOOM_LEVELS, PHYSICS, DIFFICULTY } from '../game/config.js';
import { BOT_AVATARS, makeAvatar } from '../game/characters.js';
import { createMap, isSolid } from '../game/map.js';
import { emptyControls, activeGun } from '../game/world.js';
import { getStage } from '../game/stage.js';
import { setListener, updateSound } from '../game/sound.js';
import { askPuzzle, closePuzzle, isPuzzleOpen } from '../lib/puzzleBridge.js';
import { askPower, isPowerOpen, closePower } from '../lib/powerBridge.js';
import { getSocket, request } from './socket.js';

const DELAY_MS = 60;             // how far in the past soldiers are shown (about two snapshots)
const RESEND_MS = 50;            // send controls at least this often, even if nothing changed
const ACTIONS = ['reload', 'swap', 'grenade', 'melee', 'pickup'];
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const fromGun = (g) => g && { key: g.key, ammo: g.ammo, spare: g.spare === -1 ? Infinity : g.spare };

// Puzzles in an online match go over the WebSocket, so the server knows which
// player solved which puzzle and can apply the reward itself.
const socketPuzzles = {
  get: (purpose) => request('puzzle:get', { purpose }),
  answer: (puzzleId, answer) => request('puzzle:answer', { puzzleId, answer }),
};

export function createNetGame() {
  const socket = getSocket();
  const { renderer, input, hud, meter } = getStage();
  let view = null;              // the world as drawn in this browser
  let me = null;                // this player's soldier in `view`
  let snaps = [];               // recent snapshots with their arrival time
  let active = false;
  let paused = false;
  let lastSend = 0;
  let lastSent = '';
  let stats = null;
  let started = 0;
  let near = false;
  let level = DIFFICULTY.medium;  // the room's difficulty: puzzle times
  let crateOpen = false;        // the open puzzle window is a crate puzzle

  const soldierById = (id) => view?.soldiers.find((s) => s.id === id) ?? null;

  socket.on('match:start', ({ me: myId, teamMode, map, difficulty, roster }) => {
    level = DIFFICULTY[difficulty] ?? DIFFICULTY.medium;
    view = {
      map: createMap(map), mode: teamMode ? 'team' : 'quick', cfg: MODES.online, teamMode, over: false, wave: 0,
      time: 0, timeLeft: MODES.online.timeLimit, teamKills: { blue: 0, red: 0 },
      bullets: [], rockets: [], flames: [], grenades: [], particles: [], pickups: [],
      soldiers: roster.map((r) => ({
        ...r, isPlayer: r.id === myId, isDummy: false, w: SOLDIER.width, h: SOLDIER.height,
        avatar: r.avatar?.parts ? makeAvatar(r.avatar.parts) : BOT_AVATARS[(r.avatar?.bot ?? 0) % BOT_AVATARS.length],
        x: 0, y: 0, alive: false, health: SOLDIER.maxHealth, kills: 0, deaths: 0, streak: 0, controls: emptyControls(),
        sidearm: { key: 'magnum', ammo: 8, spare: Infinity }, primary: null, current: 'sidearm',
      })),
    };
    me = soldierById(myId);
    view.player = me;
    snaps = [];
    stats = { solved: 0, attempts: 0, streak: 0, best: 0, byPurpose: { deploy: { solved: 0, attempts: 0 }, respawn: { solved: 0, attempts: 0 }, crate: { solved: 0, attempts: 0 } } };
    started = performance.now();
    active = true;
    paused = false;
    hud.attach(view);
    input.resetZoom();
    input.setEnabled(true);
    emit('game:state', { state: 'playing', online: true });
  });

  socket.on('match:snapshot', (snap) => {
    if (!view) return;
    snap.at = performance.now();
    snaps.push(snap);
    if (snaps.length > 8) snaps.shift();
    near = snap.near.includes(me.id);
    for (const [type, e] of snap.events) relay(type, e);
  });

  socket.on('match:end', (summary) => {
    if (!view) return;
    closePower();
    active = false;
    input.setEnabled(false);
    const myTeam = me.team;
    const ranking = summary.ranking.map((r) => ({ ...r, isPlayer: r.id === me.id }));
    const winner = summary.teamMode
      ? (summary.teamKills.blue === summary.teamKills.red ? null : summary.teamKills.blue > summary.teamKills.red ? 'blue' : 'red')
      : ranking[0];
    const why = summary.reason === 'time' ? 'Time is up.' : summary.reason === 'host' ? 'The host ended the match.' : 'Kill limit reached.';
    const outcome = summary.teamMode
      ? { won: winner === myTeam, title: winner ? `${winner === 'blue' ? 'Blue' : 'Red'} team wins!` : 'Draw', line: `Blue ${summary.teamKills.blue} – ${summary.teamKills.red} Red · ${why}` }
      : { won: winner.isPlayer, title: winner.isPlayer ? 'Victory!' : `${winner.name} wins`, line: why };
    setTimeout(() => {
      hud.hide();
      view = null;
      emit('game:state', { state: 'over', online: true });
      emit('game:over', {
        online: true, outcome, session: stats, durationS: summary.durationS,
        result: { mode: 'online', teamMode: summary.teamMode, ranking, teamKills: summary.teamKills },
      });
    }, 1500);
  });

  // The server sends the time limit (the room difficulty), the same as single player.
  socket.on('puzzle:offer', async ({ purpose, seconds }) => {
    if (!active || purpose !== 'crate' || isPuzzleOpen()) return;
    crateOpen = true;
    const result = await openPuzzle('crate', { title: 'Banana crate', subtitle: 'Solve it to choose a Banana Power. You are shielded while you solve it.', cancelText: 'Leave it', seconds: seconds ?? level.puzzle.crate });
    crateOpen = false;
    if (result === 'cancelled') socket.emit('puzzle:cancel', { purpose: 'crate' });
  });

  // The server stopped waiting for this crate puzzle (no answer in time): close the
  // window so the player is not stuck behind it (no cancel is sent; the server knows).
  socket.on('puzzle:closed', ({ purpose }) => {
    if (purpose !== 'crate' || !crateOpen) return;
    closePuzzle();
  });

  // A solved crate online: the server offers powers; the choice goes back to the server.
  socket.on('power:offer', async ({ choices, seconds }) => {
    if (!active) return;
    input.setEnabled(false);
    const power = await askPower(choices, seconds);
    socket.emit('power:choose', { power });
    if (active && !paused) input.setEnabled(true);
  });

  on('banana:answered', ({ correct, purpose }) => {
    if (!active || !stats) return;
    const p = stats.byPurpose[purpose];
    p.attempts += 1;
    stats.attempts += 1;
    if (correct) { p.solved += 1; stats.solved += 1; stats.streak += 1; stats.best = Math.max(stats.best, stats.streak); } else stats.streak = 0;
  });

  async function openPuzzle(purpose, options) {
    input.setEnabled(false);
    const result = await askPuzzle(purpose, { modeLabel: 'Online', source: socketPuzzles, ...options });
    if (active && !paused) input.setEnabled(true);
    return result;
  }

  // One Banana respawn try per death, as in single player (the server checks it too).
  async function bananaRespawn() {
    if (!active || me.alive || me.bananaUsed || isPuzzleOpen()) return;
    const result = await openPuzzle('respawn', { title: 'Banana respawn', subtitle: 'Solve it to respawn right now instead of waiting. One try.', cancelText: 'Wait instead', seconds: level.puzzle.respawn });
    if (result !== 'solved' && view && !me.alive) me.bananaUsed = true;   // the next snapshot says the same
  }
  on('input:banana', bananaRespawn);
  document.getElementById('center-msg').addEventListener('click', bananaRespawn);

  // An online match cannot be paused for everyone; the menu opens over the live game.
  on('input:pause', () => {
    if (!active || isPuzzleOpen() || isPowerOpen()) return;
    if (paused) net.resume();
    else { paused = true; input.setEnabled(false); emit('game:state', { state: 'paused', online: true }); }
  });

  // Server events → the same bus events a local game produces (kill feed, HUD, sounds).
  function relay(type, e) {
    const s = (id) => soldierById(id);
    switch (type) {
      case 'killed': {
        const victim = s(e.victim);
        if (victim) for (let i = 0; i < 18; i++) view.particles.push({ x: victim.x + victim.w / 2, y: victim.y + 20, vx: rand(-260, 260), vy: rand(-420, -60), life: rand(0.4, 0.9), color: '#b3001b', size: rand(2, 4), gravity: true });
        emit('soldier:killed', { victim, killer: s(e.killer), weapon: e.weapon, headshot: !!e.headshot });
        break;
      }
      case 'damaged': emit('soldier:damaged', { victim: s(e.victim), attacker: s(e.attacker), amount: e.amount ?? 0, headshot: !!e.headshot }); break;
      case 'respawned': emit('soldier:respawned', { soldier: s(e.soldier) }); break;
      case 'pickup': emit('pickup:taken', { soldier: s(e.soldier), kind: e.kind, weapon: e.weapon }); break;
      case 'fired': emit('weapon:fired', { soldier: s(e.soldier), weapon: e.weapon, x: e.x, y: e.y }); break;
      case 'reloading': case 'reloaded': case 'empty': emit(`weapon:${type}`, { soldier: s(e.soldier), weapon: e.weapon }); break;
      case 'fx': emit(e.name, { ...e, soldier: s(e.soldier) }); break;
      case 'explosion':
        for (let i = 0; i < 26; i++) {
          const a = rand(0, Math.PI * 2);
          const sp = rand(80, 420);
          view.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.7), color: ['#ffbe0b', '#fb5607', '#ff006e', '#ffd166'][i % 4], size: rand(3, 7), gravity: false });
        }
        emit('explosion', { x: e.x, y: e.y, radius: e.radius });
        break;
      case 'left': { const who = s(e.soldier); if (who) who.name = `${who.name} (bot)`; break; }
      default: break;
    }
  }

  // Puts the snapshots into `view`: every soldier is blended between the two snapshots around (now - 60 ms).
  function applySnapshots(now) {
    if (!snaps.length) return;
    const latest = snaps[snaps.length - 1];
    const target = now - DELAY_MS;
    let a = snaps[0];
    let b = latest;
    for (let i = 0; i < snaps.length - 1; i++) {
      if (snaps[i].at <= target && snaps[i + 1].at >= target) { a = snaps[i]; b = snaps[i + 1]; break; }
    }
    const t = b.at === a.at ? 1 : Math.max(0, Math.min(1, (target - a.at) / (b.at - a.at)));
    const before = new Map(a.soldiers.map((x) => [x.id, x]));
    for (const st of latest.soldiers) {
      const s = soldierById(st.id);
      if (!s) continue;
      const wasAlive = s.alive;
      Object.assign(s, st, { primary: fromGun(st.primary), sidearm: fromGun(st.sidearm), lastAttacker: soldierById(st.lastAttacker), respawnTimer: st.alive ? 0 : st.respawnTimer });
      const p0 = before.get(st.id);
      const p1 = b.soldiers.find((x) => x.id === st.id);
      if (p0 && p1 && p0.alive && p1.alive) { s.x = lerp(p0.x, p1.x, t); s.y = lerp(p0.y, p1.y, t); }
      else if (p1) { s.x = p1.x; s.y = p1.y; }
      if (!wasAlive && s.alive) s.walkPhase = 0;
    }
    Object.assign(view, {
      time: latest.time, timeLeft: latest.timeLeft, teamKills: latest.teamKills,
      bullets: latest.bullets, rockets: latest.rockets, flames: latest.flames, grenades: latest.grenades, pickups: latest.pickups,
    });
  }

  function updateParticles(dt) {
    view.particles = view.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += PHYSICS.gravity * 0.6 * dt;
      return p.life > 0 && !isSolid(view.map, p.x, p.y);
    });
  }

  // Sends the controls the moment they change (a key press reaches the server one
  // frame later instead of waiting for a timer), and repeats them every 50 ms.
  function sendControls(now) {
    const c = me.controls;
    if (me.alive && !paused && !isPuzzleOpen()) input.apply(me, view);
    else Object.assign(c, { left: false, right: false, jet: false, fire: false });
    const msg = { left: c.left, right: c.right, jet: c.jet, fire: c.fire, aimX: Math.round(c.aimX / 4) * 4, aimY: Math.round(c.aimY / 4) * 4, ...Object.fromEntries(ACTIONS.map((k) => [k, c[k]])) };
    const key = JSON.stringify(msg);
    if (key === lastSent && now - lastSend < RESEND_MS) return;
    socket.emit('input', msg);
    lastSent = key;
    lastSend = now;
    for (const k of ACTIONS) c[k] = false;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    meter.tick(now);
    if (view) {
      applySnapshots(now);
      if (active) sendControls(now);
      updateParticles(dt);
      if (near && me.alive && !me.busy) emit('pickup:available', { banana: true });
      setListener(me.x + me.w / 2, me.y + me.h / 2);
      updateSound(view.soldiers, me);
      const maxZoom = (WEAPONS[activeGun(me).key].zoom ?? 2) - 1;
      renderer.render(view, input.mouse, dt, ZOOM_LEVELS[Math.min(input.zoom, maxZoom)]);
      hud.update();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const net = {
    get active() { return active; },
    resume() {
      if (!paused) return;
      paused = false;
      input.setEnabled(true);
      emit('game:state', { state: 'playing', online: true });
    },
    leave() {
      socket.emit('room:leave');
      active = false;
      paused = false;
      view = null;
      input.setEnabled(false);
      hud.hide();
    },
  };
  return net;
}
