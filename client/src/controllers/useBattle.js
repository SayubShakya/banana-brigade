// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

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

const NO_DEPLOY_PUZZLE = ['training'];
const TIPS = {
  weapon: 'Weapon crate! Stand on it and press E to swap guns.',
  banana: 'Banana crate! Press E and solve the puzzle to pick a super power.',
  death: 'You went down. Press B to solve a Banana puzzle and respawn at once.',
};

export function useBattle({ setScreen, setParent }, { account, accountRef, parts }, { settings, setSetting }) {
  const [over, setOver] = useState(null);
  const [online, setOnline] = useState(false);
  const lastMode = useRef('quick');
  const [pendingMode, setPendingMode] = useState('quick');
  const bootCamp = useRef(false);
  const lengthRef = useRef(settings.matchLength);
  lengthRef.current = settings.matchLength;
  const tipsShown = useRef(new Set());

  const tip = (key) => {
    if (bootCamp.current || tipsShown.current.has(key) || settings.tipsSeen?.[key]) return;
    tipsShown.current.add(key);
    setSetting('tipsSeen', (seen) => ({ ...seen, [key]: true }));
    emit('tip:show', { id: key, text: TIPS[key] });
  };
  useBus('pickup:available', ({ weapon, banana, soldier }) => {
    if (soldier && !soldier.isPlayer) return;
    if (banana) tip('banana');
    else if (weapon) tip('weapon');
  });
  useBus('soldier:killed', ({ victim }) => { if (victim?.isPlayer && victim.id === 'p0') tip('death'); });

  useBus('game:state', ({ state, online: isOnline = false }) => {
    setOnline(isOnline);
    if (state === 'paused') setScreen('pause');
    else if (state === 'playing' || state === 'ending') setScreen('battle');
  });
  useBus('game:over', async (payload) => {
    if (payload.mission?.bootCamp) { finishBootCamp(false); return; }
    if (payload.outcome?.won && !payload.online && payload.result?.mode !== 'training') await playCutscene('victory');
    setOver(payload);
    setScreen('results');
  });
  useBus('tutorial:done', () => finishBootCamp(true));
  useBus('tutorial:skip', () => finishBootCamp(false));

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

  const deploy = useCallback((mode) => {
    if (mode === 'online') { net(); setScreen('lobby'); return; }
    if (mode === 'tutorial') { startBootCampBattle(); return; }
    setPendingMode(mode);
    setScreen('difficulty');
  }, []);
  const deployFrom = (from, mode) => { setParent(from); deploy(mode); };

  const deployWith = useCallback(async (mode, difficulty, length = lengthRef.current) => {
    setSetting('difficulty', difficulty);
    if (length !== undefined && length !== lengthRef.current) setSetting('matchLength', length);
    game().prepare(mode, difficulty, null, length);
    if (NO_DEPLOY_PUZZLE.includes(mode)) { startBattle(mode); return; }
    setScreen('menu');
    await playCutscene('intro');
    const result = await askPuzzle('deploy', {
      modeLabel: `${MODES[mode].name} · ${DIFFICULTY[difficulty].name}${game().rules ? ` · ${game().rules.label}` : ''}`, seconds: DIFFICULTY[difficulty].puzzle.deploy,
      title: 'Deploy', subtitle: 'Solve the Banana puzzle to drop into battle.',
    });
    if (result === 'solved') startBattle(mode);
  }, [startBattle]);

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

  const resume = () => (online ? net().resume() : game().resume());
  const endNow = () => game().endNow();

  const toMap = () => { game().quit(); setOver(null); setScreen('campaign'); };
  const playAgain = () => {
    if (over.online) { setOver(null); setScreen('lobby'); return; }
    const m = lastMode.current;
    toMenu();
    deployWith(m, settings.difficulty);
  };

  return { over, online, pendingMode, startBattle, startBootCamp: startBootCampBattle, deploy, deployFrom, deployWith, playMission, toMenu, resume, endNow, toMap, playAgain };
}
