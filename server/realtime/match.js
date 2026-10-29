// One online match, run by the server. It uses the very same engine files as the
// browser (client/src/game/world.js and bots.js), ticks the world 30 times a second
// and sends every player a snapshot after each tick.
//
// Players only send their controls (keys held, where they aim). Movement, hits,
// kills and the final scores are all worked out here, so a modified browser cannot
// give itself kills or a better score: the server is the authority.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');
const { createWorld, updateWorld, revive, rewardBananaCrate, closeBananaCrate, endMatchNow, emptyControls, powerChoices } = require('../../client/src/game/world.js');
const { BANANA_CRATE } = require('../../client/src/game/config.js');
const { updateBots } = require('../../client/src/game/bots.js');
const { BOT_NAMES } = require('../../client/src/game/config.js');
const { randomMapId } = require('../../client/src/game/map.js');

const TICK_HZ = 30;
const SNAPSHOT_EVERY = 1;                  // a snapshot after every 30 Hz tick, for smooth movement
const ACTIONS = ['reload', 'swap', 'grenade', 'melee', 'pickup'];
const round = (n) => Math.round(n * 10) / 10;
const gun = (g) => g && { key: g.key, ammo: g.ammo, spare: g.spare === Infinity ? -1 : g.spare };   // JSON has no Infinity

// Copies only the fields the browser needs to draw a soldier and the HUD.
function soldierState(s) {
  return {
    id: s.id, x: round(s.x), y: round(s.y), aim: round(s.aim), facing: s.facing, walkPhase: round(s.walkPhase),
    onGround: s.onGround, jetting: s.jetting, alive: s.alive, health: Math.ceil(s.health), fuel: Math.round(s.fuel),
    hurtFlash: round(s.hurtFlash), shieldTimer: round(s.shieldTimer), armor: Math.round(s.armor), fuelBoost: round(s.fuelBoost), power: s.power ? { id: s.power.id, timer: round(s.power.timer) } : null, fireCooldown: round(s.fireCooldown), reloadTimer: round(s.reloadTimer),
    respawnTimer: s.alive ? 0 : round(Math.min(99, s.respawnTimer)), grenades: s.grenades, kills: s.kills, deaths: s.deaths, streak: s.streak,
    current: s.current, primary: gun(s.primary), sidearm: gun(s.sidearm), lastAttacker: s.lastAttacker?.id ?? null, busy: !!s.busy,
  };
}

/**
 * @param {object} o
 * @param {Array<{userId:string, username:string, parts:object, team:string}>} o.players
 * @param {boolean} o.teamMode
 * @param {'easy'|'medium'|'hard'} [o.difficulty]  how good the bots are (checked by rooms.js)
 * @param {(event:string, payload:object, userId?:string) => void} o.send  to everyone, or to one player
 * @param {(result:object) => void} o.onEnd
 * @param {(killer:string|null, victim:string, weapon:string, headshot:boolean) => void} [o.onKill]  for the live event feed
 */
function createMatch({ players, teamMode, difficulty = 'medium', send, onEnd, onPower, onKill, timeLimit }) {
  const matchId = crypto.randomUUID();
  const outbox = [];                          // events for this tick, sent with the snapshot
  const near = new Set();                     // players standing at a banana crate this tick
  const crates = new Map();                   // userId -> the banana crate they are opening
  const offers = new Map();                   // userId -> { choices, timer } while choosing a Banana Power
  const puzzles = new Map();                  // userId -> { solved, attempted }
  const pending = new Map();                  // userId -> latest controls (one-shot actions are OR-ed)
  const startedAt = Date.now();
  let tick = 0;
  let ended = false;

  const sid = (userId) => `u${userId}`;
  const emit = (event, p) => {
    switch (event) {
      case 'soldier:killed':
        outbox.push(['killed', { victim: p.victim.id, killer: p.killer?.id ?? null, weapon: p.weapon, headshot: !!p.headshot }]);
        // Only kills that involve a real player go to the event feed (bot-on-bot is noise).
        if (p.victim.id.startsWith('u') || p.killer?.id.startsWith('u')) onKill?.(p.killer?.name ?? null, p.victim.name, p.weapon, !!p.headshot);
        break;
      case 'soldier:damaged': outbox.push(['damaged', { victim: p.victim.id, attacker: p.attacker?.id ?? null, amount: round(p.amount), headshot: !!p.headshot }]); break;
      case 'soldier:respawned': outbox.push(['respawned', { soldier: p.soldier.id }]); break;
      case 'power:start': case 'power:warning': case 'power:end':
        outbox.push(['fx', { name: event, soldier: p.soldier.id, power: p.power, seconds: p.seconds, random: p.random }]);
        break;
      case 'pickup:taken': outbox.push(['pickup', { soldier: p.soldier.id, kind: p.kind, weapon: p.weapon }]); break;
      case 'weapon:fired': outbox.push(['fired', { soldier: p.soldier.id, weapon: p.weapon, x: round(p.x), y: round(p.y) }]); break;
      case 'weapon:reloading': case 'weapon:reloaded': case 'weapon:empty':
        outbox.push([event.slice(7), { soldier: p.soldier.id, weapon: p.weapon }]); break;
      case 'explosion': outbox.push(['explosion', { x: round(p.x), y: round(p.y), radius: p.radius }]); break;
      // Small effects (landing dust, ricochets, grenade and melee sounds, shield breaks)
      // are passed on by name, with the soldier's id instead of the object.
      case 'soldier:landed': case 'bullet:wall': case 'grenade:thrown': case 'grenade:bounce':
      case 'melee:swing': case 'jetpack:sputter': case 'shield:broken':
        outbox.push(['fx', { name: event, soldier: p.soldier?.id ?? null, x: p.x == null ? undefined : round(p.x), y: p.y == null ? undefined : round(p.y), speed: p.speed }]);
        break;
      case 'pickup:available': if (p.banana) near.add(p.soldier.id); break;
      case 'banana:crate': offerCrate(p.soldier, p.pickup); break;
      case 'match:ended': finish(p); break;
      default: break;
    }
  };

  // The server picks the battlefield; its id goes out in match:start so every
  // browser builds the same tile grid from maps.js.
  const mapId = randomMapId();
  const world = createWorld({
    mode: 'online', teamMode, difficulty, emit, map: mapId,
    humans: players.map((p) => ({ id: sid(p.userId), name: p.username, avatar: { parts: p.parts }, team: p.team })),
    botAvatars: Array.from({ length: 8 }, (_, i) => ({ bot: i })),
    botNames: [...BOT_NAMES].sort(() => Math.random() - 0.5),
  });
  if (timeLimit) world.timeLeft = timeLimit;
  const byUser = (userId) => world.soldiers.find((s) => s.id === sid(userId));

  // The static part of the match, sent once: names, looks and teams.
  const roster = () => world.soldiers.map((s) => ({ id: s.id, name: s.name, team: s.team, human: s.isPlayer, avatar: s.avatar }));

  function offerCrate(soldier, pickup) {
    if (soldier.busy || !pickup.active) return;
    const userId = soldier.id.slice(1);
    soldier.busy = true;                    // frozen and protected while solving
    soldier.shieldTimer = 999;
    crates.set(userId, pickup);
    send('puzzle:offer', { purpose: 'crate' }, userId);
  }

  function setControls(userId, c) {
    const prev = pending.get(userId) ?? emptyControls();
    const next = {
      left: !!c.left, right: !!c.right, jet: !!c.jet, fire: !!c.fire,
      aimX: Number.isFinite(c.aimX) ? c.aimX : prev.aimX, aimY: Number.isFinite(c.aimY) ? c.aimY : prev.aimY,
    };
    for (const a of ACTIONS) next[a] = prev[a] || !!c[a];
    pending.set(userId, next);
  }

  function step() {
    tick += 1;
    for (const [userId, c] of pending) {
      const s = byUser(userId);
      if (!s || !s.isPlayer) continue;
      if (s.busy) Object.assign(s.controls, emptyControls(), { aimX: c.aimX, aimY: c.aimY });
      else Object.assign(s.controls, c);
      for (const a of ACTIONS) c[a] = false;
    }
    near.clear();
    updateBots(world, 1 / TICK_HZ);
    updateWorld(world, 1 / TICK_HZ);
    if (tick % SNAPSHOT_EVERY === 0) sendSnapshot();
  }

  function sendSnapshot() {
    send('match:snapshot', {
      t: Date.now(), time: round(world.time), timeLeft: round(world.timeLeft), teamKills: world.teamKills,
      soldiers: world.soldiers.map(soldierState),
      bullets: world.bullets.map((b) => ({ x: round(b.x), y: round(b.y), px: round(b.px ?? b.x), py: round(b.py ?? b.y), color: b.color })),
      rockets: world.rockets.map((r) => ({ x: round(r.x), y: round(r.y), vx: round(r.vx), vy: round(r.vy) })),
      flames: world.flames.map((f) => ({ x: round(f.x), y: round(f.y), age: round(f.age), life: f.life })),
      grenades: world.grenades.map((g) => ({ x: round(g.x), y: round(g.y), w: g.w, h: g.h, fuse: round(g.fuse) })),
      pickups: world.pickups.map((p) => ({ kind: p.kind, x: p.x, y: p.y, active: p.active, weapon: p.weapon, dropped: p.dropped, timer: p.active ? 0 : round(p.timer ?? 0) })),
      near: [...near],
      events: outbox.splice(0),
    });
  }

  const timer = setInterval(() => {
    try { step(); } catch (err) { console.error('Match tick failed:', err); }
  }, 1000 / TICK_HZ);

  function finish({ ranking, teamKills, reason }) {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    const winners = teamMode
      ? (teamKills.blue === teamKills.red ? null : teamKills.blue > teamKills.red ? 'blue' : 'red')
      : ranking[0]?.id;
    const humans = ranking.filter((s) => s.id.startsWith('u') && players.some((p) => sid(p.userId) === s.id));
    const results = humans.map((s) => {
      const userId = s.id.slice(1);
      const p = puzzles.get(userId) ?? { solved: 0, attempted: 0 };
      return {
        userId, kills: s.kills, deaths: s.deaths, won: teamMode ? s.team === winners : s.id === winners,
        puzzlesSolved: p.solved, puzzlesAttempted: p.attempted,
      };
    });
    const summary = {
      matchId, reason, teamMode, teamKills: { ...teamKills }, durationS: Math.round((Date.now() - startedAt) / 1000),
      ranking: ranking.map((s) => ({ id: s.id, name: s.name, team: s.team, kills: s.kills, deaths: s.deaths, human: s.id.startsWith('u') })),
    };
    // The world is still inside its update here, so finish on the next turn of the event loop.
    setImmediate(() => {
      sendSnapshot();                         // one last snapshot so everyone sees the final kill
      send('match:end', summary);
      onEnd({ ...summary, results });
    });
  }

  const api = {
    matchId,
    mapId,
    roster,
    botLevel: world.difficulty.name,          // what the engine actually uses, e.g. 'Hard'
    setControls,
    countPuzzle(userId, correct) {
      const p = puzzles.get(userId) ?? { solved: 0, attempted: 0 };
      p.attempted += 1;
      if (correct) p.solved += 1;
      puzzles.set(userId, p);
    },
    // Which Banana puzzles this player may ask for right now.
    canAsk(userId, purpose) {
      const s = byUser(userId);
      if (!s || ended) return false;
      if (purpose === 'respawn') return !s.alive;
      if (purpose === 'crate') return crates.has(userId);
      return false;
    },
    // A Banana puzzle was answered (checked by the server's puzzle store).
    applyPuzzle(userId, purpose, correct) {
      const s = byUser(userId);
      if (!s || ended) return;
      if (purpose === 'respawn' && correct) revive(world, s);
      if (purpose === 'crate') {
        const pickup = crates.get(userId);
        crates.delete(userId);
        const offer = correct && pickup?.active;
        if (pickup) closeBananaCrate(pickup);
        if (!offer) { s.busy = false; s.shieldTimer = 0.5; return; }
        // Solved: the player stays frozen and protected while choosing a Banana Power.
        // If no choice arrives in time, the server picks a random one.
        const choices = powerChoices();
        const timer = setTimeout(() => api.choosePower(userId, 'random'), (BANANA_CRATE.pickSeconds + 1) * 1000);
        offers.set(userId, { choices, timer });
        send('power:offer', { choices, seconds: BANANA_CRATE.pickSeconds }, userId);
      }
    },
    // The player's power choice; anything not offered counts as 'random'. Returns the power given.
    choosePower(userId, choice) {
      const offer = offers.get(userId);
      const s = byUser(userId);
      if (!offer || !s) return null;
      clearTimeout(offer.timer);
      offers.delete(userId);
      s.busy = false;
      s.shieldTimer = 0.5;
      if (ended) return null;
      const power = rewardBananaCrate(world, s, offer.choices.includes(choice) ? choice : 'random');
      onPower?.(userId, power);
      return power;
    },
    cancelCrate(userId) {
      const s = byUser(userId);
      crates.delete(userId);
      // A player who leaves while choosing a power gets nothing (no power for the bot).
      const offer = offers.get(userId);
      if (offer) { clearTimeout(offer.timer); offers.delete(userId); }
      if (s) { s.busy = false; s.shieldTimer = 0.5; }
    },
    // A player left: a bot takes over their soldier so the match stays fair for the others.
    leave(userId) {
      const s = byUser(userId);
      if (!s) return;
      this.cancelCrate(userId);
      s.isPlayer = false;
      s.name = `${s.name} (bot)`;
      pending.delete(userId);
      outbox.push(['left', { soldier: s.id }]);
    },
    rejoin(userId) {
      const s = byUser(userId);
      if (!s || ended) return false;
      s.isPlayer = true;
      s.name = s.name.replace(/ \(bot\)$/, '');
      return true;
    },
    end(reason = 'host') { endMatchNow(world, reason); },
    stop() { ended = true; clearInterval(timer); for (const o of offers.values()) clearTimeout(o.timer); offers.clear(); },
    get over() { return ended; },
  };
  return api;
}

module.exports = { createMatch, TICK_HZ };
