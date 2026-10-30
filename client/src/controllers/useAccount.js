// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { emit } from '../services/eventBus.js';
import { readJson, store } from '../services/storage.js';
import { useBus } from '../hooks/useBus.js';
import { DEFAULT_AVATAR } from '../game/characters.js';
import { closeSocket } from '../net/socket.js';
import { game, netIfStarted } from './gameEngine.js';

export function useAccount({ screen, setScreen, clearHash }) {
  const [account, setAccount] = useState(null);
  const accountRef = useRef(null);
  accountRef.current = account;
  const [isNew, setIsNew] = useState(false);
  const [parts, setPartsState] = useState(() => readJson('avatar', DEFAULT_AVATAR));

  const setParts = (next) => { setPartsState(next); store.set('avatar', JSON.stringify(next)); };

  useEffect(() => { if (screen === 'admin' && account && account.role !== 'admin') setScreen('menu'); }, [screen, account]);

  const restore = (user) => {
    setAccount(user);
    accountRef.current = user;
  };
  const signIn = (user, created) => { setAccount(user); setIsNew(created); setScreen('menu'); };
  const onLogin = (user, created) => { clearHash(); signIn(user, created); };
  const onSaved = (user) => signIn(user, true);

  const signedOut = () => { game().quit(); netIfStarted()?.leave(); closeSocket(); setAccount(null); setScreen('home'); };

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
  const logout = async () => {
    try { await api.logout(); } finally { signedOut(); }
  };

  return { account, accountRef, isNew, parts, setParts, restore, onLogin, onSaved, signedOut, playAsGuest, logout };
}
