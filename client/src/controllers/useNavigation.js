// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { askPuzzle } from '../services/puzzleBridge.js';
import { askPower } from '../services/powerBridge.js';
import { MODES } from '../game/config.js';
import { chapterOf, missionById } from '../game/campaign.js';
import { powerChoices } from '../game/world.js';
import { game } from './gameEngine.js';

// Pages anyone can open by hash, logged in or not.
const PUBLIC = ['privacy', 'terms'];

// Which screen is showing, and where Back goes from it.
export function useNavigation() {
  const [screen, setScreen] = useState('loading');
  // Where Back goes from a sub-screen (e.g. Avatar opened from Profile goes back to Profile).
  const [parent, setParent] = useState(null);
  // A new key remounts Login (e.g. for a reset link).
  const [loginKey, setLoginKey] = useState(0);

  const openFrom = (from, next) => { setParent(from); setScreen(next); };
  const open = (next) => openFrom(null, next);
  const back = () => { setScreen(parent ?? 'menu'); setParent(null); };

  // The battle canvas is plain HTML outside React: show it during battles.
  useEffect(() => {
    document.getElementById('screen-battle').hidden = !(screen === 'battle' || screen === 'pause');
  }, [screen]);

  // Links such as #privacy also work on a page that is already open.
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1);
      if (PUBLIC.includes(h)) setScreen(h);
      // A reset link opened in a tab where the game is already open: show its form.
      else if (h.startsWith('reset=')) { setLoginKey((k) => k + 1); setScreen('login'); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Privacy and Terms go back to wherever the player came from: the menu or the home page.
  // The hash is cleared too, so a reload or the same link later behaves as expected.
  const clearHash = () => { if (location.hash) history.replaceState(null, '', location.pathname); };
  const leavePublic = (signedIn) => { clearHash(); setScreen(signedIn ? parent ?? 'menu' : 'home'); setParent(null); };
  const toHome = () => { clearHash(); setScreen('home'); };
  const reload = () => { location.replace('/'); };

  return { screen, setScreen, parent, setParent, loginKey, openFrom, open, back, clearHash, leavePublic, toHome, reload };
}

// Who is this? Already logged in (the session cookie is still valid): the menu.
// Otherwise the public home page, or a public page asked for by its hash
// (#login, #privacy, #terms; a reset link #reset=... opens the login screen's
// reset form). Any other path than / is a 404, and no answer at all means the
// server is down. Returns start, so the offline screen can try again.
export function useStartRoute({ setScreen }, { restore }, { settings }, { startBattle, deploy }) {
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

  // Preview links such as #battle-team or #puzzle-crate open a screen directly
  // (no deploy puzzle), so every screen can be reviewed and screenshotted.
  function openPreview(hash) {
    const [name, arg] = hash.split('-');
    if (name === 'battle') { game().prepare(MODES[arg] ? arg : 'quick', settings.difficulty); startBattle(MODES[arg] ? arg : 'quick'); }
    else if (name === 'difficulty') deploy('quick');
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
