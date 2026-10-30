// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { askPuzzle } from '../services/puzzleBridge.js';
import { askPower } from '../services/powerBridge.js';
import { MODES } from '../game/config.js';
import { chapterOf, missionById } from '../game/campaign.js';
import { powerChoices } from '../game/world.js';
import { game } from './gameEngine.js';

const PUBLIC = ['privacy', 'terms'];

export function useNavigation() {
  const [screen, setScreen] = useState('loading');
  const [parent, setParent] = useState(null);
  const [loginKey, setLoginKey] = useState(0);

  const openFrom = (from, next) => { setParent(from); setScreen(next); };
  const open = (next) => openFrom(null, next);
  const back = () => { setScreen(parent ?? 'menu'); setParent(null); };

  useEffect(() => {
    document.getElementById('screen-battle').hidden = !(screen === 'battle' || screen === 'pause');
  }, [screen]);

  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1);
      if (PUBLIC.includes(h)) setScreen(h);
      else if (h.startsWith('reset=')) { setLoginKey((k) => k + 1); setScreen('login'); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const clearHash = () => { if (location.hash) history.replaceState(null, '', location.pathname); };
  const leavePublic = (signedIn) => { clearHash(); setScreen(signedIn ? parent ?? 'menu' : 'home'); setParent(null); };
  const toHome = () => { clearHash(); setScreen('home'); };
  const reload = () => { location.replace('/'); };

  return { screen, setScreen, parent, setParent, loginKey, openFrom, open, back, clearHash, leavePublic, toHome, reload };
}

export function useStartRoute({ setScreen }, { restore }, { settings }, { startBattle, startBootCamp, deploy }) {
  const start = useCallback(() => {
    if (location.pathname !== '/') { setScreen('notfound'); return; }
    api.me().then(({ user }) => {
      const hash = location.hash.slice(1);
      if (!user || hash.startsWith('reset=')) {
        setScreen(hash.startsWith('reset=') || hash === 'login' ? 'login' : PUBLIC.includes(hash) ? hash : 'home');
        return;
      }
      restore(user);
      setScreen('menu');
      openPreview(hash);
    }).catch((err) => setScreen(err.offline ? 'offline' : 'home'));
  }, []);
  useEffect(start, [start]);

  function openPreview(hash) {
    const [name, arg] = hash.split('-');
    if (name === 'battle') { game().prepare(MODES[arg] ? arg : 'quick', settings.difficulty, null, settings.matchLength); startBattle(MODES[arg] ? arg : 'quick'); }
    else if (name === 'difficulty') deploy('quick');
    else if (name === 'bootcamp') startBootCamp();
    else if (name === 'mission' && missionById(Number(arg))) {
      const m = missionById(Number(arg));
      game().prepare('campaign', chapterOf(m).difficulty, m);
      startBattle('campaign');
    }
    else if (name === 'power') askPower(powerChoices());
    else if (name === 'puzzle') askPuzzle(['deploy', 'respawn', 'crate'].includes(arg) ? arg : 'deploy', { modeLabel: 'Quick Play', title: 'Banana puzzle', subtitle: 'Preview of the puzzle screen.' });
    else if (name === 'online') deploy('online');
    else if (['privacy', 'terms', 'profile', 'scores', 'settings', 'avatar', 'controls', 'modes', 'daily', 'campaign', 'admin'].includes(name)) setScreen(name);
  }

  return start;
}
