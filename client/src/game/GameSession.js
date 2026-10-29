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
import { MODES, WEAPONS, BOT_NAMES, ZOOM_LEVELS, DIFFICULTY } from './config.js';
import { BOT_AVATARS, makeAvatar } from './characters.js';
import { createWorld, updateWorld, center, activeGun, revive, rewardBananaCrate, closeBananaCrate, endMatchNow, continueMission, powerChoices } from './world.js';
import { askPower, closePower } from '../powerBridge.js';
import { updateBots } from './bots.js';
import { getStage } from './stage.js';
import { setEffectsVolume, setListener, setMuted, unlockAudio, updateSound } from './sound.js';
import { setMusicMuted, setMusicVolume } from './music.js';
import { askPuzzle, isPuzzleOpen } from '../puzzleBridge.js';

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

const newStats = () => ({
  solved: 0, attempts: 0, streak: 0, best: 0, started: performance.now(),
  byPurpose: { deploy: { solved: 0, attempts: 0 }, respawn: { solved: 0, attempts: 0 }, crate: { solved: 0, attempts: 0 } },
  powers: new Set(),   // Banana Powers used in this battle
});

// Title and one line for the results screen; `won` is saved with the score.
export function outcome({ ranking, player, reason, mode, wave, teamKills, mission }) {
  if (mode === 'campaign') {
    const won = reason === 'target';
    const why = reason === 'time' ? 'Time ran out.' : reason === 'out' ? 'Out of lives.' : reason === 'quit' ? 'You left the mission.' : `${mission.target} kills reached.`;
    return { won, title: won ? 'Mission complete!' : 'Mission failed', line: `${mission.name}: ${player.kills} / ${mission.target} kills. ${why}` };
  }
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
  const { renderer, input, hud, meter } = getStage();

  let world = null;
  let state = 'idle';
  let stats = null;     // puzzle stats for this deployment (deploy puzzle included)
  let mode = 'quick';
  let level = DIFFICULTY.medium;
  let levelKey = 'medium';
  let mission = null;

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
    const result = await askPuzzle(purpose, { modeLabel: `${MODES[mode].name} · ${level.name}`, seconds: level.puzzle[purpose], ...options });
    if (world && !world.over && state === 'puzzle') { setState('playing'); input.setEnabled(true); }
    return result;
  }

  async function bananaRespawn() {
    if (!world || world.player.alive || world.over) return;
    if (world.mode === 'campaign' && world.player.lives <= 0) return;   // the continue puzzle handles this
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

  // Campaign: out of lives. Solve a Banana puzzle (new puzzle after a miss) to continue, or give up.
  on('player:out', () => setTimeout(async () => {
    if (!world || world.over) return;
    const result = await inGamePuzzle('respawn', {
      title: 'Out of lives!', subtitle: 'Solve a Banana puzzle to continue with one more life. Continuing costs the 2nd and 3rd stars.',
      cancelText: 'Give up', retry: true,
    });
    if (!world || world.over || result === null) return;
    if (result === 'solved') continueMission(world);
    else endMatchNow(world, 'out');
  }, 900));

  on('banana:crate', async ({ pickup }) => {
    if (!pickup.active) return;
    const result = await inGamePuzzle('crate', {
      title: 'Banana crate',
      subtitle: 'Solve it to choose a Banana Power for a few seconds.',
      cancelText: 'Leave it',
    });
    if (!world || result === null || result === 'cancelled') return;
    closeBananaCrate(pickup);
    if (result !== 'solved' || world.over) return;
    // The battle stays frozen while the player picks a power.
    setState('puzzle');
    input.setEnabled(false);
    const choice = await askPower(powerChoices());
    if (!world || world.over) return;
    const power = rewardBananaCrate(world, world.player, choice);
    stats?.powers.add(power);
    setState('playing');
    input.setEnabled(true);
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
    emit('game:over', { result, outcome: outcome(result), session: s, difficulty: levelKey, mission, durationS: Math.round((performance.now() - s.started) / 1000) });
  }, 1500));

  const session = {
    get state() { return state; },
    get mode() { return mode; },

    // Call before the deploy puzzle, so it counts in this deployment's stats.
    prepare(nextMode, difficulty = 'medium', nextMission = null) {
      mode = nextMode;
      mission = nextMission;
      levelKey = DIFFICULTY[difficulty] ? difficulty : 'medium';
      level = DIFFICULTY[levelKey];
      stats = newStats();
      unlockAudio();
    },
    get difficulty() { return levelKey; },

    start({ playerName, parts }) {
      stats ??= newStats();
      stats.started = performance.now();
      world = createWorld({
        mode, playerName, playerAvatar: makeAvatar(parts), botAvatars: shuffle(BOT_AVATARS), botNames: shuffle(BOT_NAMES), difficulty: levelKey, mission,
      });
      hud.attach(world);
      input.resetZoom();
      input.setEnabled(true);
      setState('playing');
    },
    pause() { if (state !== 'playing') return; input.setEnabled(false); setState('paused'); },
    resume() { if (state !== 'paused') return; input.setEnabled(true); setState('playing'); },
    endNow() { if (!world) return; session.resume(); endMatchNow(world, 'quit'); },
    quit() {
      closePower();
      world = null;
      stats = null;
      input.setEnabled(false);
      hud.hide();
      setState('idle');
    },
    // Volumes are 0-100 from the Settings sliders; mute silences music and effects.
    applySettings({ musicVolume = 60, sfxVolume = 80, muted = false, laser, banners, fps, autoFire = true }) {
      meter.setVisible(!!fps);
      input.setAutoFire(autoFire);
      setMuted(muted);
      setEffectsVolume(sfxVolume / 100);
      setMusicMuted(muted);
      setMusicVolume(musicVolume / 100);
      renderer.setLaser(laser);
      renderer.setBanners(banners);
      hud.setBanners(banners);
    },
  };

  // ---------- Game loop ----------
  // The world moves in fixed 1/60 s steps, however fast the screen refreshes. A slow
  // frame runs a few steps to catch up, so the game never turns into slow motion and
  // behaves the same on a 60 Hz laptop and a 120 Hz screen.
  const STEP = 1 / 60;
  const MAX_STEPS = 5;
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    meter.tick(now);
    if (world) {
      // The world keeps moving for the short pause after the match ends, then freezes
      // behind the results screen (no shots, sounds or bots in the background).
      const running = state === 'playing';
      if (running) {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < MAX_STEPS) {
          if (state === 'playing' && world.player.alive) input.apply(world.player, world);
          updateBots(world, STEP);
          updateWorld(world, STEP);
          acc -= STEP;
          steps += 1;
        }
        if (steps === MAX_STEPS) acc = 0;   // far behind (tab was hidden): skip ahead instead of racing
        const c = center(world.player);
        setListener(c.x, c.y);
      } else acc = 0;
      updateSound(running ? world.soldiers : [], world.player);
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
