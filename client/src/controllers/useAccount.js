// useAccount.js: controller hook for the signed-in player (virtual identity theme).
// Holds the account returned by the server, the avatar parts, and the login/logout actions.
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { emit } from '../services/eventBus.js';
import { readJson, store } from '../services/storage.js';
import { useBus } from '../hooks/useBus.js';
import { DEFAULT_AVATAR } from '../game/characters.js';
import { closeSocket } from '../net/socket.js';
import { game, netIfStarted } from './gameEngine.js';

/**
 * useAccount: keeps track of who is logged in.
 * @param {object} nav  from useNavigation (screen, setScreen, setParent, clearHash).
 * @returns {object} account, isNew, avatar parts and actions: onLogin, onAdminLogin,
 *   playAsGuest (POST /api/v1/auth/guest), logout (POST /api/v1/auth/logout), signedOut, ...
 * Listens to the 'session:ended' event that api.js emits when the server answers 401.
 */
export function useAccount({ screen, setScreen, setParent, clearHash }) {
  const [account, setAccount] = useState(null);
  const accountRef = useRef(null);
  accountRef.current = account;
  const [isNew, setIsNew] = useState(false);
  const [parts, setPartsState] = useState(() => readJson('avatar', DEFAULT_AVATAR));

  // Avatar choice is only cosmetic, so it is saved in localStorage, not on the server.
  const setParts = (next) => { setPartsState(next); store.set('avatar', JSON.stringify(next)); };

  // UI role check: a non-admin who reaches the admin screen is sent back to the menu.
  // This only hides the page; the server still rejects admin API calls from non-admins.
  useEffect(() => { if (screen === 'admin' && account && account.role !== 'admin') setScreen('menu'); }, [screen, account]);

  const restore = (user) => {
    setAccount(user);
    accountRef.current = user;
  };
  const signIn = (user, created) => { setAccount(user); setIsNew(created); setScreen('menu'); };
  const onLogin = (user, created) => { clearHash(); signIn(user, created); };
  const onSaved = (user) => signIn(user, true);
  const onAdminLogin = (user) => { clearHash(); setAccount(user); setIsNew(false); setParent('menu'); setScreen('admin'); };

  // Local sign-out: stop any match, leave online play, close the socket and go home.
  const signedOut = () => { game().quit(); netIfStarted()?.leave(); closeSocket(); setAccount(null); setScreen('home'); };

  // Event-driven: api.js emits 'session:ended' on a 401, and this listener logs the UI out.
  useBus('session:ended', ({ text }) => {
    if (!accountRef.current) return;
    signedOut();
    emit('toast:error', { text });
  });

  const playAsGuest = async () => {
    try {
      const { user } = await api.guest();
      signIn(user, true);
    } catch (err) { if (!err.offline && !(err.status >= 500)) emit('toast:error', { text: err.message }); }
  };
  // Ask the server to delete the session (and clear the cookie); sign out locally either way.
  const logout = async () => {
    try { await api.logout(); } finally { signedOut(); }
  };

  return { account, accountRef, isNew, parts, setParts, restore, onLogin, onAdminLogin, onSaved, signedOut, playAsGuest, logout };
}
