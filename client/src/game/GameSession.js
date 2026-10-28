// Runs one battle: creates the world, drives the game loop (input → bots → world →
// renderer → HUD) and opens the in-battle Banana puzzles. It has no menu code:
// React screens call start/pause/resume/quit, and listen for these events:
//
//   game:state   { state }              'playing' | 'puzzle' | 'paused' | 'over' | 'idle'
//   game:over    { result, outcome, session, durationS }   1.5 s after the match ends
//
// Banana API puzzles in battle:
//   - down: press B (or click the message) to solve one and respawn now;
//     in Survival it is the only way back, and a miss ends the run;
//   - banana crate: press E next to it; solving gives a power weapon.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { on, emit } from '../eventBus.js';
import { MODES, WEAPONS, BOT_NAMES, ZOOM_LEVELS } from './config.js';
import { BOT_AVATARS, makeAvatar } from './characters.js';
import { createWorld, updateWorld, center, activeGun, revive, rewardBananaCrate, closeBananaCrate, endMatchNow } from './world.js';
import { updateBots } from './bots.js';
import { getStage } from './stage.js';
import { setListener, setMuted, unlockAudio } from './sound.js';
import { askPuzzle, isPuzzleOpen } from '../puzzleBridge.js';

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

const newStats = () => ({
  solved: 0, attempts: 0, streak: 0, best: 0, started: performance.now(),
  byPurpose: { deploy: { solved: 0, attempts: 0 }, respawn: { solved: 0, attempts: 0 }, crate: { solved: 0, attempts: 0 } },
});

// Title and one line for the results screen; `won` is saved with the score.
export function outcome({ ranking, player, reason, mode, wave, teamKills }) {
  if (mode === 'survival') return { won: false, title: `Wave ${wave}`, line: `You held out until wave ${wave} with ${player.kills} kills.` };
  if (mode === 'training') return { won: false, title: 'Training over', line: `${player.kills} dummies down. Training is not ranked.` };
  const why = reason === 'time' ? 'Time is up.' : reason === 'quit' ? 'You ended the battle.' : 'Kill limit reached.';
  if (mode === 'team') {
    const won = teamKills.blue > teamKills.red;
    return { won, title: won ? 'Blue team wins!' : teamKills.blue === teamKills.red ? 'Draw' : 'Red team wins', line: `Blue ${teamKills.blue} – ${teamKills.red} Red · ${why}` };
  }
  const won = ranking[0] === player;
  return { won, title: won ? 'Victory!' : `${ranking[0].name} wins`, line: why };
}

export function createGameSession() {
  const { renderer, input, hud } = getStage();

  let world = null;
  let state = 'idle';
  let stats = null;     // puzzle stats for this deployment (deploy puzzle included)
  let mode = 'quick';

  const setState = (next) => { state = next; emit('game:state', { state }); };

  // Puzzle answers during a deployment count towards its results screen.
  on('banana:answered', ({ correct, purpose }) => {
    if (!stats) return;
    const p = stats.byPurpose[purpose];
    p.attempts += 1;
    stats.attempts += 1;
    if (correct) { p.solved += 1; stats.solved += 1; stats.streak += 1; stats.best = Math.max(stats.best, stats.streak); } else stats.streak = 0;
  });

  // Freezes this player's battle while an in-battle puzzle is open.
  async function inGamePuzzle(purpose, options) {
    if (!world || isPuzzleOpen() || state !== 'playing') return null;
    setState('puzzle');
    input.setEnabled(false);
    const result = await askPuzzle(purpose, { modeLabel: MODES[mode].name, ...options });
    if (world && !world.over && state === 'puzzle') { setState('playing'); input.setEnabled(true); }
    return result;
  }

  async function bananaRespawn() {
    if (!world || world.player.alive || world.over) return;
    const survival = world.mode === 'survival';
    const result = await inGamePuzzle('respawn', {
      title: survival ? 'Banana revive' : 'Banana respawn',
      subtitle: survival ? 'Solve it to get back in the fight. Miss and the run is over.' : 'Solve it to respawn right now instead of waiting.',
      cancelText: survival ? 'Give up' : 'Wait instead',
    });
    if (!world || result === null) return;
    if (result === 'solved') revive(world, world.player);
    else if (survival) endMatchNow(world, 'down');
  }
  on('input:banana', bananaRespawn);
  document.getElementById('center-msg').addEventListener('click', bananaRespawn);
  on('player:down', () => setTimeout(bananaRespawn, 1200));

  on('banana:crate', async ({ pickup }) => {
    if (!pickup.active) return;
    const result = await inGamePuzzle('crate', {
      title: 'Banana crate',
      subtitle: 'Solve it for a power weapon, full health and +2 grenades.',
      cancelText: 'Leave it',
    });
    if (!world || result === null || result === 'cancelled') return;
    if (result === 'solved') rewardBananaCrate(world, world.player);
    closeBananaCrate(pickup);
  });

  on('input:pause', () => {
    if (isPuzzleOpen()) return;
    if (state === 'playing') session.pause();
    else if (state === 'paused') session.resume();
  });

  on('match:ended', (result) => setTimeout(() => {
    if (!world?.over || result.player !== world.player) return;
    setState('over');
    input.setEnabled(false);
    hud.hide();
    const s = stats ?? newStats();
    emit('game:over', { result, outcome: outcome(result), session: s, durationS: Math.round((performance.now() - s.started) / 1000) });
  }, 1500));

  const session = {
    get state() { return state; },
    get mode() { return mode; },

    // Call before the deploy puzzle, so it counts in this deployment's stats.
    prepare(nextMode) { mode = nextMode; stats = newStats(); unlockAudio(); },

    start({ playerName, parts }) {
      stats ??= newStats();
      stats.started = performance.now();
      world = createWorld({
        mode, playerName, playerAvatar: makeAvatar(parts), botAvatars: shuffle(BOT_AVATARS), botNames: shuffle(BOT_NAMES),
      });
      hud.attach(world);
      input.setEnabled(true);
      setState('playing');
    },
    pause() { if (state !== 'playing') return; input.setEnabled(false); setState('paused'); },
    resume() { if (state !== 'paused') return; input.setEnabled(true); setState('playing'); },
    endNow() { if (!world) return; session.resume(); endMatchNow(world, 'quit'); },
    quit() {
      world = null;
      stats = null;
      input.setEnabled(false);
      hud.hide();
      setState('idle');
    },
    applySettings({ sound, laser, banners }) {
      setMuted(!sound);
      renderer.setLaser(laser);
      hud.setBanners(banners);
    },
  };

  // ---------- Game loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (world) {
      const running = state === 'playing' || state === 'over';
      if (running) {
        if (state === 'playing' && world.player.alive) input.apply(world.player);
        updateBots(world, dt);
        updateWorld(world, dt);
        const c = center(world.player);
        setListener(c.x, c.y);
      }
      // 3x zoom only with a scoped weapon (the sniper); everything else stops at 2x.
      const maxZoom = (WEAPONS[activeGun(world.player).key].zoom ?? 2) - 1;
      renderer.render(world, input.mouse, running ? dt : 0, ZOOM_LEVELS[Math.min(input.zoom, maxZoom)]);
      hud.update();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return session;
}
