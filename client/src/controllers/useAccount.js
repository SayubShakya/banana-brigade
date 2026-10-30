// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { emit } from '../services/eventBus.js';
import { readJson, store } from '../services/storage.js';
import { useBus } from '../hooks/useBus.js';
import { DEFAULT_AVATAR } from '../game/characters.js';
import { closeSocket } from '../net/socket.js';
import { game, netIfStarted } from './gameEngine.js';

// Who is playing: the logged-in account, whether it is new, and the avatar parts.
export function useAccount({ screen, setScreen, clearHash }) {
  const [account, setAccount] = useState(null);
  const accountRef = useRef(null);
  accountRef.current = account;
  const [isNew, setIsNew] = useState(false);
  const [parts, setPartsState] = useState(() => readJson('avatar', DEFAULT_AVATAR));

  const setParts = (next) => { setPartsState(next); store.set('avatar', JSON.stringify(next)); };

  // A player who reaches #admin is sent back to the menu (the API would refuse them anyway).
  useEffect(() => { if (screen === 'admin' && account && account.role !== 'admin') setScreen('menu'); }, [screen, account]);

  // Already logged in when the page opened (the session cookie is still valid).
  const restore = (user) => {
    setAccount(user);
    accountRef.current = user;   // so a preview battle already uses the player's name
  };
  const signIn = (user, created) => { setAccount(user); setIsNew(created); setScreen('menu'); };
  // From the login screen: the hash (e.g. a reset link) is cleared too.
  const onLogin = (user, created) => { clearHash(); signIn(user, created); };
  // A guest who saved the account keeps playing with the new one.
  const onSaved = (user) => signIn(user, true);

  // Back to the home page once the server has ended the session (logout,
  // log out everywhere or a deleted account).
  const signedOut = () => { game().quit(); netIfStarted()?.leave(); closeSocket(); setAccount(null); setScreen('home'); };

  // The server ended this session (see api.js and net/socket.js): back to the home
  // page with the reason, rather than screens that fail one by one.
  useBus('session:ended', ({ text }) => {
    if (!accountRef.current) return;
    signedOut();
    emit('toast:error', { text });
  });

  // "Play as guest": a temporary account straight away (the server makes it).
  const playAsGuest = async () => {
    try {
      const { user } = await api.guest();
      signIn(user, true);
    } catch (err) { if (!err.offline && !(err.status >= 500)) emit('toast:error', { text: err.message }); }   // api.js already shows the others
  };
  const logout = async () => {
    try { await api.logout(); } finally { signedOut(); }
  };

  return { account, accountRef, isNew, parts, setParts, restore, onLogin, onSaved, signedOut, playAsGuest, logout };
}
