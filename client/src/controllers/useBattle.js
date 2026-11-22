// useBattle.js: controller hook that starts, pauses and ends battles.
// It reacts to game engine events on the event bus and asks for Banana puzzles before deploying.
import { useCallback, useRef, useState } from 'react';
import { useBus } from '../hooks/useBus.js';
import { askPuzzle } from '../services/puzzleBridge.js';
import { playCutscene } from '../services/cutsceneBridge.js';
import { MODES, DIFFICULTY } from '../game/config.js';
import { chapterOf } from '../game/campaign.js';
import { mapName } from '../game/maps.js';
import { getSocket } from '../net/socket.js';
import { emit } from '../services/eventBus.js';
import { BOOT_CAMP, startBootCamp, stopBootCamp } from '../game/tutorial.js';
import { game, net, netIfStarted } from './gameEngine.js';

// Training mode skips the deploy puzzle. TIPS are one-time hints shown on first events.
const NO_DEPLOY_PUZZLE = ['training'];
const TIPS = {
  weapon: 'Weapon crate! Stand on it and press E to swap guns.',
  banana: 'Banana crate! Press E and solve the puzzle to pick a super power.',
  death: 'You went down. Press B to solve a Banana puzzle and respawn at once.',
};

/**
 * useBattle: everything about running a match from the UI side.
 * @param {object} nav      setScreen / setParent from useNavigation.
 * @param {object} player   account, accountRef and parts from useAccount.
 * @param {object} prefs    settings and setSetting from useSettings.
 * @returns {object} state (over, online, pendingMode) and actions: deploy, deployWith,
 *   playMission, toMenu, resume, endNow, playAgain, ...
 * Listens to: 'pickup:available', 'soldier:killed', 'game:state', 'game:over',
 *   'tutorial:done', 'tutorial:skip'. Emits 'tip:show' and toasts.
 */
export function useBattle({ setScreen, setParent }, { account, accountRef, parts }, { settings, setSetting }) {
  const [over, setOver] = useState(null);
  const [online, setOnline] = useState(false);
  const lastMode = useRef('quick');
  const [pendingMode, setPendingMode] = useState('quick');
  const bootCamp = useRef(false);
  const lengthRef = useRef(settings.matchLength);
  lengthRef.current = settings.matchLength;
  const tipsShown = useRef(new Set());

  // Show a hint once per player; remembered in settings.tipsSeen.
  const tip = (key) => {
    if (bootCamp.current || tipsShown.current.has(key) || settings.tipsSeen?.[key]) return;
    tipsShown.current.add(key);
    setSetting('tipsSeen', (seen) => ({ ...seen, [key]: true }));
    emit('tip:show', { id: key, text: TIPS[key] });
  };
  // Event handlers: the game engine emits these and the UI reacts (show tips, switch screens).
  useBus('pickup:available', ({ weapon, banana, soldier }) => {
    if (soldier && !soldier.isPlayer) return;
    if (banana) tip('banana');
    else if (weapon) tip('weapon');
  });
  useBus('soldier:killed', ({ victim }) => { if (victim?.isPlayer && victim.id === 'p0') tip('death'); });

  // The engine says when it is paused or playing, and the UI shows the matching screen.
  useBus('game:state', ({ state, online: isOnline = false }) => {
    setOnline(isOnline);
    if (state === 'paused') setScreen('pause');
    else if (state === 'playing' || state === 'ending') setScreen('battle');
  });
  // End of match: play the victory/defeat clip for ranked games, then show the Results screen.
  useBus('game:over', async (payload) => {
    if (payload.mission?.bootCamp) { finishBootCamp(false); return; }
    const ranked = !payload.online && payload.result?.mode !== 'training';
    if (ranked && payload.result?.reason !== 'quit') await playCutscene(payload.outcome?.won ? 'victory' : 'defeat', { once: false });
    setOver(payload);
    setScreen('results');
  });
  useBus('tutorial:done', () => finishBootCamp(true));
  useBus('tutorial:skip', () => finishBootCamp(false));

  /** startBattle: start the prepared game session and switch to the battle screen. */
  const startBattle = useCallback((mode) => {
    game().start({ playerName: accountRef.current?.username ?? 'You', parts });
    lastMode.current = mode;
    setScreen('battle');
  }, [account, parts]);

  const startBootCampBattle = useCallback(async () => {
    await playCutscene('intro');
    game().quit();
    setOver(null);
    game().prepare('training', 'easy', BOOT_CAMP);
    bootCamp.current = true;
    startBootCamp();
    startBattle('training');
  }, [startBattle]);

  /** deploy: first step after picking a mode: online goes to the lobby, others pick a difficulty. */
  const deploy = useCallback((mode) => {
    if (mode === 'online') { net(); setScreen('lobby'); return; }
    if (mode === 'tutorial') { startBootCampBattle(); return; }
    setPendingMode(mode);
    setScreen('difficulty');
  }, []);
  const deployFrom = (from, mode) => { setParent(from); deploy(mode); };

  /**
   * deployWith: prepare the match, then ask a Banana puzzle; only a solved puzzle starts the battle.
   * The await on askPuzzle waits until the PuzzleModal has checked the answer with the server.
   */
  const deployWith = useCallback(async (mode, difficulty, length = lengthRef.current, map = undefined) => {
    setSetting('difficulty', difficulty);
    if (length !== undefined && length !== lengthRef.current) setSetting('matchLength', length);
    game().prepare(mode, difficulty, null, length, map);
    if (NO_DEPLOY_PUZZLE.includes(mode)) { startBattle(mode); return; }
    setScreen('menu');
    await playCutscene('intro');
    const result = await askPuzzle('deploy', {
      modeLabel: `${MODES[mode].name} · ${DIFFICULTY[difficulty].name}${game().rules ? ` · ${game().rules.label}` : ''}`, seconds: DIFFICULTY[difficulty].puzzle.deploy,
      title: 'Deploy', subtitle: 'Solve the Banana puzzle to drop into battle.',
    });
    if (result !== 'solved') return;
    await playCutscene('deploy');
    startBattle(mode);
  }, [startBattle]);

  /** playMission: start a campaign mission (chapter clip, then deploy puzzle, then battle). */
  const playMission = useCallback(async (mission) => {
    const difficulty = chapterOf(mission).difficulty;
    game().quit();
    setOver(null);
    game().prepare('campaign', difficulty, mission);
    setScreen('campaign');
    await playCutscene(`chapter-${mission.chapter}`);
    const result = await askPuzzle('deploy', {
      modeLabel: `Mission ${mission.id} · ${DIFFICULTY[difficulty].name}`, seconds: DIFFICULTY[difficulty].puzzle.deploy,
      title: mission.name, subtitle: `${mapName(mission.map)}: ${mission.target} kills in ${Math.floor(mission.timeLimit / 60)} minutes. Solve the Banana puzzle to deploy.`,
    });
    if (result === 'solved') startBattle('campaign');
  }, [startBattle]);

  /** toMenu: stop everything (boot camp, local game, online room) and return to the menu. */
  const toMenu = () => {
    bootCamp.current = false;
    stopBootCamp();
    game().quit();
    if (netIfStarted()) { net().leave(); getSocket().emit('room:leave'); }
    setOver(null);
    setOnline(false);
    setScreen('menu');
  };

  function finishBootCamp(completed) {
    if (!bootCamp.current) return;
    if (completed) {
      setSetting('bootCampDone', true);
      setSetting('bootCampOffered', true);
      emit('toast:info', { text: 'Boot Camp complete! You are ready for battle.' });
    }
    toMenu();
  }

  // Online games are resumed / ended through the server; only the host may end for everyone.
  const resume = () => (online ? net().resume() : game().resume());
  const endNow = () => (online ? net().endForAll().then(resume).catch((err) => emit('toast:error', { text: err.message })) : game().endNow());
  const canEnd = () => !online || net().isHost;

  const toMap = () => { game().quit(); setOver(null); setScreen('campaign'); };
  const playAgain = () => {
    if (over.online) { setOver(null); setScreen('lobby'); return; }
    const m = lastMode.current;
    toMenu();
    deployWith(m, settings.difficulty);
  };

  return { over, online, pendingMode, startBattle, startBootCamp: startBootCampBattle, deploy, deployFrom, deployWith, playMission, toMenu, resume, endNow, canEnd, toMap, playAgain };
}
