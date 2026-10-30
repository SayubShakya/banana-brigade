// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useRef, useState } from 'react';
import { useBus } from '../hooks/useBus.js';
import { askPuzzle } from '../services/puzzleBridge.js';
import { MODES, DIFFICULTY } from '../game/config.js';
import { chapterOf } from '../game/campaign.js';
import { mapName } from '../game/maps.js';
import { getSocket } from '../net/socket.js';
import { game, net, netIfStarted } from './gameEngine.js';

export function useBattle({ setScreen, setParent }, { account, accountRef, parts }, { settings, setSetting }) {
  const [over, setOver] = useState(null);
  const [online, setOnline] = useState(false);
  const lastMode = useRef('quick');
  const [pendingMode, setPendingMode] = useState('quick');

  useBus('game:state', ({ state, online: isOnline = false }) => {
    setOnline(isOnline);
    if (state === 'paused') setScreen('pause');
    else if (state === 'playing' || state === 'ending') setScreen('battle');
  });
  useBus('game:over', (payload) => { setOver(payload); setScreen('results'); });

  const startBattle = useCallback((mode) => {
    game().start({ playerName: accountRef.current?.username ?? 'You', parts });
    lastMode.current = mode;
    setScreen('battle');
  }, [account, parts]);

  const deploy = useCallback((mode) => {
    if (mode === 'online') { net(); setScreen('lobby'); return; }
    setPendingMode(mode);
    setScreen('difficulty');
  }, []);
  const deployFrom = (from, mode) => { setParent(from); deploy(mode); };

  const deployWith = useCallback(async (mode, difficulty) => {
    setSetting('difficulty', difficulty);
    game().prepare(mode, difficulty);
    setScreen('menu');
    const result = await askPuzzle('deploy', {
      modeLabel: `${MODES[mode].name} · ${DIFFICULTY[difficulty].name}`, seconds: DIFFICULTY[difficulty].puzzle.deploy,
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
    const result = await askPuzzle('deploy', {
      modeLabel: `Mission ${mission.id} · ${DIFFICULTY[difficulty].name}`, seconds: DIFFICULTY[difficulty].puzzle.deploy,
      title: mission.name, subtitle: `${mapName(mission.map)}: ${mission.target} kills in ${Math.floor(mission.timeLimit / 60)} minutes. Solve the Banana puzzle to deploy.`,
    });
    if (result === 'solved') startBattle('campaign');
  }, [startBattle]);

  const toMenu = () => {
    game().quit();
    if (netIfStarted()) { net().leave(); getSocket().emit('room:leave'); }
    setOver(null);
    setOnline(false);
    setScreen('menu');
  };

  const resume = () => (online ? net().resume() : game().resume());
  const endNow = () => game().endNow();

  const toMap = () => { game().quit(); setOver(null); setScreen('campaign'); };
  const playAgain = () => {
    if (over.online) { setOver(null); setScreen('lobby'); return; }
    const m = lastMode.current;
    toMenu();
    deployWith(m, settings.difficulty);
  };

  return { over, online, pendingMode, startBattle, deploy, deployFrom, deployWith, playMission, toMenu, resume, endNow, toMap, playAgain };
}
