// useNavigation.js: controller hooks for moving between screens.
// The app is a single page: a "screen" is just a string in React state, and the URL hash
// (#privacy, #admin-login, #reset=...) is used for links that open a screen directly.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { emit } from '../services/eventBus.js';
import { askPuzzle } from '../services/puzzleBridge.js';
import { askPower } from '../services/powerBridge.js';
import { MODES } from '../game/config.js';
import { chapterOf, missionById } from '../game/campaign.js';
import { powerChoices } from '../game/world.js';
import { game } from './gameEngine.js';

// Screens anyone can open, even when not logged in.
const PUBLIC = ['privacy', 'terms'];

/**
 * useNavigation: the current screen and simple back-navigation.
 * @returns {object} screen, setScreen, parent (the screen to go back to), loginKey and helpers:
 *   openFrom, open, back, clearHash, leavePublic, toHome, reload.
 */
export function useNavigation() {
  const [screen, setScreen] = useState('loading');
  const [parent, setParent] = useState(null);
  const [loginKey, setLoginKey] = useState(0);

  const openFrom = (from, next) => { setParent(from); setScreen(next); };
  const open = (next) => openFrom(null, next);
  const back = () => { setScreen(parent ?? 'menu'); setParent(null); };

  // The canvas lives outside React (#screen-battle); show it only during battle or pause.
  useEffect(() => {
    document.getElementById('screen-battle').hidden = !(screen === 'battle' || screen === 'pause');
  }, [screen]);

  // Hash routing: listen for 'hashchange' (a browser event) and map the hash to a screen.
  // #admin-login only switches from the home/login screens; #reset=<token> reopens Login
  // (a new loginKey remounts it so it reads the reset token).
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1);
      if (PUBLIC.includes(h)) setScreen(h);
      else if (h === 'admin-login') setScreen((s) => (['home', 'login'].includes(s) ? 'adminLogin' : s));
      else if (h.startsWith('reset=')) { setLoginKey((k) => k + 1); setScreen('login'); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Remove the hash from the address bar without adding a history entry.
  const clearHash = () => { if (location.hash) history.replaceState(null, '', location.pathname); };
  const leavePublic = (signedIn) => { clearHash(); setScreen(signedIn ? parent ?? 'menu' : 'home'); setParent(null); };
  const toHome = () => { clearHash(); setScreen('home'); };
  const reload = () => { location.replace('/'); };

  return { screen, setScreen, parent, setParent, loginKey, openFrom, open, back, clearHash, leavePublic, toHome, reload };
}

/**
 * useStartRoute: decides the first screen when the page loads.
 * Calls GET /api/v1/auth/me: if the session cookie is still valid the server returns the user,
 * so we go straight to the menu; otherwise we show home / login / admin login based on the hash.
 * @returns {Function} start, which can be called again (e.g. from the Offline screen).
 */
export function useStartRoute({ setScreen }, { restore }, { settings }, { startBattle, startBootCamp, deploy }) {
  const start = useCallback(() => {
    if (location.pathname !== '/') { setScreen('notfound'); return; }
    api.me().then(({ user }) => {
      const hash = location.hash.slice(1);
      if (!user || hash.startsWith('reset=')) {
        setScreen(hash === 'admin-login' ? 'adminLogin' : hash.startsWith('reset=') || hash === 'login' ? 'login' : PUBLIC.includes(hash) ? hash : 'home');
        return;
      }
      restore(user);
      setScreen('menu');
      openPreview(hash, user.role);
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    // No connection at all -> Offline screen; any other error -> Home.
    }).catch((err) => setScreen(err.offline ? 'offline' : 'home'));
  }, []);
  useEffect(start, [start]);

  // openPreview: deep links for demos, e.g. #battle-quick, #puzzle-respawn, #mission-3.
  // The admin link checks the role in the UI; the server still guards all admin data.
  function openPreview(hash, role) {
    const [name, arg] = hash.split('-');
    if (name === 'battle') { game().prepare(MODES[arg] ? arg : 'quick', settings.difficulty, null, settings.matchLength, settings.mapChoice); startBattle(MODES[arg] ? arg : 'quick'); }
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
    else if (hash === 'admin-login') { if (role === 'admin') setScreen('admin'); else emit('toast:error', { text: 'That page is for admins only.' }); }
    else if (['privacy', 'terms', 'profile', 'history', 'scores', 'settings', 'avatar', 'controls', 'modes', 'daily', 'campaign', 'admin'].includes(name)) setScreen(name);
  }

  return start;
}
