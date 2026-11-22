// GameSession runs an offline match in the browser: the game loop (fixed timestep),
// pause/resume, Banana API puzzles during play (respawn, crate, continue) and the end screen.
// It is the main event hub for offline play: it listens to and emits event bus events.
import { on, emit } from '../services/eventBus.js';
import { MODES, WEAPONS, BOT_NAMES, ZOOM_LEVELS, DIFFICULTY, BANANA_METER, matchRules } from './config.js';
import { BOT_AVATARS, makeAvatar } from './characters.js';
import { createWorld, updateWorld, center, activeGun, revive, rewardBananaCrate, closeBananaCrate, endMatchNow, continueMission, powerChoices, bananaAnswered, fillBananaMeter, callSupplyDrop, openSupplyCrate } from './world.js';
import { crateChoiceCount } from './meter.js';
import { createBattleLog } from './battleLog.js';
import { askPower, closePower } from '../services/powerBridge.js';
import { playCutscene } from '../services/cutsceneBridge.js';
import { updateBots } from './bots.js';
import { getStage } from './stage.js';
import { setEffectsVolume, setListener, setMuted, unlockAudio, updateSound } from './sound.js';
import { setMusicMuted, setMusicVolume } from './music.js';
import { askPuzzle, isPuzzleOpen } from '../services/puzzleBridge.js';

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

// Puzzle and match statistics for one session (shown on the end screen and saved with the result).
const newStats = () => ({
  solved: 0, attempts: 0, streak: 0, best: 0, started: performance.now(),
  byPurpose: { deploy: { solved: 0, attempts: 0 }, respawn: { solved: 0, attempts: 0 }, crate: { solved: 0, attempts: 0 } },
  powers: new Set(),
  grades: { gold: 0, silver: 0, bronze: 0 }, solveMs: 0, timed: 0,
  sources: { live: 0, reserve: 0 }, drops: 0, deployGrade: null, deployStreak: 0,
});

/**
 * Works out the end-of-match result text for the player.
 * @param {object} result the 'match:ended' payload (ranking, player, reason, mode, wave, teamKills, mission)
 * @returns {{won:boolean, title:string, line:string}} e.g. { won: true, title: 'Victory!', line: 'Kill limit reached.' }
 */
export function outcome({ ranking, player, reason, mode, wave, teamKills, mission }) {
  if (mode === 'campaign') {
    const won = reason === 'target';
    const why = reason === 'time' ? 'Time ran out.' : reason === 'out' ? 'Out of lives.' : reason === 'quit' ? 'You left the mission.' : `${mission.target} kills reached.`;
    return { won, title: won ? 'Mission complete!' : 'Mission failed', line: `${mission.name}: ${player.kills} / ${mission.target} kills. ${why}` };
  }
  if (mode === 'survival') {
    const end = reason === 'quit' ? 'You ended the run' : 'You held out';
    return { won: false, title: `Wave ${wave}`, line: `${end} at wave ${wave} with ${player.kills} kill${player.kills === 1 ? '' : 's'}.` };
  }
  if (mode === 'training') return { won: false, title: 'Training over', line: `${player.kills} dummies down. Training is not ranked.` };
  const why = reason === 'time' ? 'Time is up.' : reason === 'quit' ? 'You ended the battle.' : 'Kill limit reached.';
  if (mode === 'team') {
    const won = reason !== 'quit' && teamKills.blue > teamKills.red;
    if (reason === 'quit') return { won, title: 'Battle ended', line: `Blue ${teamKills.blue} – ${teamKills.red} Red · ${why}` };
    return { won, title: won ? 'Blue team wins!' : teamKills.blue === teamKills.red ? 'Draw' : 'Red team wins', line: `Blue ${teamKills.blue} – ${teamKills.red} Red · ${why}` };
  }
  const won = reason !== 'quit' && ranking[0] === player && player.kills > (ranking[1]?.kills ?? -1);
  if (reason === 'quit') return { won, title: 'Battle ended', line: `${why} You had ${player.kills} kill${player.kills === 1 ? '' : 's'}.` };
  const tied = !won && player.kills === ranking[0].kills;
  return { won, title: won ? 'Victory!' : tied ? 'Draw' : `${ranking[0].name} wins`, line: tied ? `${why} Tied on ${player.kills} kill${player.kills === 1 ? '' : 's'}.` : why };
}

/**
 * Creates the offline game session (one per page) and starts the requestAnimationFrame loop.
 * Listens to: banana:answered, banana:drop, input:supply, input:banana, player:down, player:out,
 * banana:crate, input:pause, match:ended.
 * Emits: game:state (idle / playing / puzzle / paused / ending / over), input:supply, game:over.
 * @returns {object} session API: prepare, start, pause, resume, endNow, quit, applySettings
 */
export function createGameSession() {
  const { renderer, input, hud, meter } = getStage();

  let world = null;
  let state = 'idle';
  let stats = null;
  let mode = 'quick';
  let level = DIFFICULTY.medium;
  let levelKey = 'medium';
  let mission = null;
  let rules = null;
  let mapChoice = null;
  let battleLog = null;

  // Every state change is broadcast as 'game:state' so screens, music and other parts can react.
  const setState = (next) => { state = next; emit('game:state', { state }); };

  let lastAnswer = { correct: false, grade: null };

  // A Banana API puzzle was answered: log it, update the stats and (in a match) fill the Banana Meter.
  // A deploy puzzle (before the match) is remembered and applied to the meter when the match starts.
  on('banana:answered', ({ correct, purpose, grade = null, ms, source }) => {
    lastAnswer = { correct, grade };
    if (battleLog && world && purpose !== 'deploy') battleLog.puzzle(world.player.name, correct, purpose);
    if (!stats) return;
    const p = stats.byPurpose[purpose];
    if (!p) return;
    p.attempts += 1;
    stats.attempts += 1;
    if (source === 'live' || source === 'reserve') stats.sources[source] += 1;
    if (correct) {
      p.solved += 1; stats.solved += 1; stats.streak += 1; stats.best = Math.max(stats.best, stats.streak);
      if (stats.grades[grade] !== undefined) stats.grades[grade] += 1;
      if (Number.isFinite(ms)) { stats.solveMs += ms; stats.timed += 1; }
    } else stats.streak = 0;
    if (purpose === 'deploy') {
      if (correct) stats.deployGrade = grade ?? 'bronze';
      stats.deployStreak = correct ? stats.deployStreak + 1 : Math.floor(stats.deployStreak / 2);
    } else if (world && !world.over && world.player) bananaAnswered(world, world.player, { correct, grade });
  });

  on('banana:drop', ({ soldier }) => { if (stats && soldier === world?.player) stats.drops += 1; });

  // X key or the supply button: call a supply drop if the meter is full and nothing else is open.
  function supplyDrop() {
    if (!world || world.over || state !== 'playing' || isPuzzleOpen()) return;
    callSupplyDrop(world, world.player);
  }
  on('input:supply', supplyDrop);
  window.addEventListener('keydown', (e) => {
    if (e.code !== BANANA_METER.key || e.repeat || e.target?.tagName === 'INPUT') return;
    if (state === 'playing') emit('input:supply');
  });

  /**
   * Pauses play and opens a Banana API puzzle (with a cutscene first for respawns).
   * Sets state 'puzzle' while it is open and goes back to 'playing' after.
   * @param {string} purpose 'respawn' | 'crate'
   * @returns {Promise<string|null>} 'solved', 'cancelled', another result, or null if the match is gone
   */
  async function inGamePuzzle(purpose, options) {
    if (!world || isPuzzleOpen() || state !== 'playing') return null;
    setState('puzzle');
    input.setEnabled(false);
    if (purpose === 'respawn') await playCutscene('respawn');
    if (!world || world.over) return null;
    const result = await askPuzzle(purpose, { modeLabel: `${MODES[mode].name} · ${level.name}`, seconds: level.puzzle[purpose], ...options });
    if (world && !world.over && state === 'puzzle') { setState('playing'); input.setEnabled(true); }
    return result;
  }

  // B key / click on the death message: solve a puzzle to respawn now (one chance per death).
  // In survival this is the only way back: a miss ends the run.
  async function bananaRespawn() {
    if (!world || world.player.alive || world.over) return;
    if (world.mode === 'campaign' && world.player.lives <= 0) return;
    if (world.player.bananaUsed) return;
    const survival = world.mode === 'survival';
    const result = await inGamePuzzle('respawn', {
      title: survival ? 'Banana revive' : 'Banana respawn',
      subtitle: survival ? 'Solve it to get back in the fight. Miss and the run is over.' : 'Solve it to respawn right now instead of waiting.',
      cancelText: survival ? 'Give up' : 'Wait instead',
    });
    if (!world || result === null) return;
    if (result !== 'solved' && !survival) world.player.bananaUsed = true;
    if (result === 'solved') revive(world, world.player, lastAnswer.grade);
    else if (survival) endMatchNow(world, 'down');
  }
  on('input:banana', bananaRespawn);
  document.getElementById('center-msg').addEventListener('click', bananaRespawn);
  on('player:down', () => setTimeout(bananaRespawn, 1200));

  // Campaign out of lives: offer a puzzle to continue with one more life.
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

  // Shows the crate cutscene, lets the player choose a Banana Power, then gives it and resumes play.
  async function pickPower(count) {
    setState('puzzle');
    input.setEnabled(false);
    await playCutscene('crate');
    if (!world || world.over) return;
    const choice = await askPower(powerChoices(count));
    if (!world || world.over) return;
    const power = rewardBananaCrate(world, world.player, choice);
    stats?.powers.add(power);
    setState('playing');
    input.setEnabled(true);
  }

  // The player pressed E at a banana crate. Supply crates give a power straight away;
  // normal crates need a solved Banana API puzzle first. The number of choices depends on the grade.
  on('banana:crate', async ({ pickup }) => {
    if (!pickup.active) return;
    if (pickup.supply) {
      if (!world || world.over || state !== 'playing' || isPuzzleOpen()) return;
      openSupplyCrate(pickup);
      await pickPower(BANANA_METER.supplyChoices);
      return;
    }
    const result = await inGamePuzzle('crate', {
      title: 'Banana crate',
      subtitle: 'Solve it to choose a Banana Power for a few seconds.',
      cancelText: 'Leave it',
    });
    if (!world || result === null || result === 'cancelled') return;
    closeBananaCrate(pickup);
    if (result !== 'solved' || world.over) return;
    await pickPower(crateChoiceCount(lastAnswer.grade));
  });

  on('input:pause', () => {
    if (isPuzzleOpen() || world?.over) return;
    if (state === 'playing') session.pause();
    else if (state === 'paused') session.resume();
  });

  // 1.5 s after the match ends, hide the HUD and emit 'game:over' with the result, stats and battle log.
  on('match:ended', (result) => setTimeout(() => {
    if (!world?.over || result.player !== world.player) return;
    setState('over');
    input.setEnabled(false);
    hud.hide();
    const s = stats ?? newStats();
    const ending = outcome(result);
    const draw = /^Draw$/.test(ending.title);
    const log = battleLog && { map: world.map.id, roster: battleLog.roster(), log: battleLog.entries() };
    emit('game:over', { result, outcome: ending, draw, battleLog: log, session: s, difficulty: levelKey, mission, durationS: Math.round(world?.endedAt ?? world?.time ?? (performance.now() - s.started) / 1000) });
  }, 1500));

  const session = {
    get state() { return state; },
    get mode() { return mode; },

    // Chooses mode, difficulty, mission, length and map before the deploy puzzle. Also unlocks audio (needs a user click).
    prepare(nextMode, difficulty = 'medium', nextMission = null, length = undefined, map = undefined) {
      mode = nextMode;
      mapChoice = nextMission ? null : map;
      mission = nextMission;
      rules = nextMission ? null : matchRules(nextMode, length);
      levelKey = DIFFICULTY[difficulty] ? difficulty : 'medium';
      level = DIFFICULTY[levelKey];
      stats = newStats();
      unlockAudio();
    },
    get difficulty() { return levelKey; },
    get rules() { return rules; },

    // Creates the world and battle log, applies the deploy puzzle bonus to the Banana Meter and starts play.
    start({ playerName, parts }) {
      stats ??= newStats();
      stats.started = performance.now();
      world = createWorld({
        mode, playerName, playerAvatar: makeAvatar(parts), botAvatars: shuffle(BOT_AVATARS), botNames: shuffle(BOT_NAMES), difficulty: levelKey, mission,
        timeLimit: rules?.timeLimit, killLimit: rules?.killLimit, map: mapChoice,
      });
      battleLog = createBattleLog(world);
      const deploy = stats.byPurpose.deploy;
      battleLog.opening(world.player.name, deploy);
      if (stats.deployGrade === 'gold') {
        world.player.bananaStreak = stats.deployStreak;
        fillBananaMeter(world, world.player);
      } else if (stats.deployGrade) {
        world.player.bananaStreak = Math.max(0, stats.deployStreak - 1);
        bananaAnswered(world, world.player, { correct: true, grade: stats.deployGrade });
      }
      hud.attach(world);
      input.resetZoom();
      input.setEnabled(true);
      setState('playing');
    },
    pause() { if (state !== 'playing') return; input.setEnabled(false); setState('paused'); },
    resume() { if (state !== 'paused') return; input.setEnabled(true); setState('playing'); },
    endNow() { if (!world) return; input.setEnabled(false); setState('ending'); endMatchNow(world, 'quit'); },
    quit() {
      closePower();
      world = null;
      battleLog = null;
      stats = null;
      input.setEnabled(false);
      hud.hide();
      setState('idle');
    },
    // Applies the player's settings to sound, music, input, renderer and HUD.
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

  // Game loop with a fixed timestep: the world always moves in steps of 1/60 s, whatever the screen's
  // frame rate. This keeps physics the same on every computer (the server uses the same idea at 30 steps a second).
  // MAX_STEPS stops a "spiral of death" when the tab was in the background.
  const STEP = 1 / 60;
  const MAX_STEPS = 5;
  let last = performance.now();
  let acc = 0;
  // Called by requestAnimationFrame every screen frame.
  function frame(now) {
    // Real time since the last frame (capped at 0.25 s), added to an accumulator below.
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    meter.tick(now);
    if (world) {
      const running = state === 'playing';
      if (running) {
        acc += dt;
        let steps = 0;
        // Run as many fixed steps as the time allows: input -> bots -> world physics.
        while (acc >= STEP && steps < MAX_STEPS) {
          if (state === 'playing' && world.player.alive) input.apply(world.player, world);
          updateBots(world, STEP);
          updateWorld(world, STEP);
          acc -= STEP;
          steps += 1;
        }
        if (steps === MAX_STEPS) acc = 0;
        const c = center(world.player);
        setListener(c.x, c.y);
      } else acc = 0;
      updateSound(running ? world.soldiers : [], world.player);
      // Only guns with a zoom value (the sniper) can use the deepest zoom level.
      const maxZoom = (WEAPONS[activeGun(world.player).key].zoom ?? 2) - 1;
      renderer.render(world, input.mouse, running ? dt : 0, ZOOM_LEVELS[Math.min(input.zoom, maxZoom)]);
      hud.update();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return session;
}
