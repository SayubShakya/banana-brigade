// The React side of Banana Brigade: which screen is showing, who is logged in, and
// the hand-over to the game session for battles. Screens are plain components; the
// battle itself is drawn by the game engine (GameSession) outside React, and the
// two talk through the event bus (game:state, game:over) and a few method calls.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useBus } from './hooks.js';
import { askPuzzle } from './puzzleBridge.js';
import { readJson, store } from './storage.js';
import { MODES } from './game/config.js';
import { DEFAULT_AVATAR } from './game/characters.js';
import { createGameSession } from './game/GameSession.js';
import { createNetGame } from './net/NetGame.js';
import { closeSocket, getSocket } from './net/socket.js';
import Login from './screens/Login.jsx';
import Menu from './screens/Menu.jsx';
import Avatar from './screens/Avatar.jsx';
import Profile from './screens/Profile.jsx';
import Scores from './screens/Scores.jsx';
import Settings from './screens/Settings.jsx';
import Controls from './screens/Controls.jsx';
import Pause from './screens/Pause.jsx';
import Results from './screens/Results.jsx';
import PuzzleModal from './screens/PuzzleModal.jsx';
import Lobby from './screens/Lobby.jsx';
import Modes from './screens/Modes.jsx';

// One game session for the whole page; it owns the battle canvas and HUD.
let gameSession = null;
const game = () => (gameSession ??= createGameSession());
// Online matches are run by the server; NetGame shows them (created on first use).
let netGame = null;
const net = () => (netGame ??= createNetGame());

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [account, setAccount] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [parts, setPartsState] = useState(() => readJson('avatar', DEFAULT_AVATAR));
  const [settings, setSettings] = useState(() => readJson('settings', { sound: true, laser: true, banners: true, fps: false }));
  const [over, setOver] = useState(null);
  const [online, setOnline] = useState(false);
  const lastMode = useRef('quick');

  const setParts = (next) => { setPartsState(next); store.set('avatar', JSON.stringify(next)); };

  // The battle canvas is plain HTML outside React: show it during battles.
  useEffect(() => {
    document.getElementById('screen-battle').hidden = !(screen === 'battle' || screen === 'pause');
  }, [screen]);

  useEffect(() => { game().applySettings(settings); }, [settings]);

  // Already logged in (the session cookie is still valid)? Skip the login screen.
  useEffect(() => {
    api.me().then(({ user }) => {
      if (!user) { setScreen('login'); return; }
      setAccount(user);
      setScreen('menu');
      openPreview(location.hash.slice(1));
    }).catch(() => setScreen('login'));
  }, []);

  // Engine → React: battle state changes and the end of a match.
  useBus('game:state', ({ state, online: isOnline = false }) => {
    setOnline(isOnline);
    if (state === 'paused') setScreen('pause');
    else if (state === 'playing') setScreen('battle');
  });
  useBus('game:over', (payload) => { setOver(payload); setScreen('results'); });

  const startBattle = useCallback((mode) => {
    game().start({ playerName: account?.username ?? 'You', parts });
    lastMode.current = mode;
    setScreen('battle');
  }, [account, parts]);

  const deploy = useCallback(async (mode) => {
    if (mode === 'online') { net(); setScreen('lobby'); return; }
    game().prepare(mode);
    const result = await askPuzzle('deploy', { modeLabel: MODES[mode].name, title: 'Deploy', subtitle: 'Solve the Banana puzzle to drop into battle.' });
    if (result === 'solved') startBattle(mode);
  }, [startBattle]);

  const toMenu = () => {
    game().quit();
    if (netGame) { net().leave(); getSocket().emit('room:leave'); }
    setOver(null);
    setOnline(false);
    setScreen('menu');
  };
  const logout = async () => {
    try { await api.logout(); } finally { game().quit(); netGame?.leave(); closeSocket(); setAccount(null); setScreen('login'); }
  };
  const toggle = (key) => setSettings((s) => { const next = { ...s, [key]: !s[key] }; store.set('settings', JSON.stringify(next)); return next; });

  // Preview links such as #battle-team or #puzzle-crate open a screen directly
  // (no deploy puzzle), so every screen can be reviewed and screenshotted.
  function openPreview(hash) {
    const [name, arg] = hash.split('-');
    if (name === 'battle') { game().prepare(MODES[arg] ? arg : 'quick'); startBattle(MODES[arg] ? arg : 'quick'); }
    else if (name === 'puzzle') askPuzzle(['deploy', 'respawn', 'crate'].includes(arg) ? arg : 'deploy', { modeLabel: 'Quick Play', title: 'Banana puzzle', subtitle: 'Preview of the puzzle screen.' });
    else if (name === 'online') deploy('online');
    else if (['profile', 'scores', 'settings', 'avatar', 'controls', 'modes'].includes(name)) setScreen(name);
  }

  const back = () => setScreen('menu');
  return (
    <>
      {screen === 'login' && <Login onLogin={(user, created) => { setAccount(user); setIsNew(created); setScreen('menu'); }} />}
      {screen === 'menu' && <Menu account={account} isNew={isNew} parts={parts} onDeploy={deploy} onOpen={setScreen} onLogout={logout} />}
      {screen === 'avatar' && <Avatar name={account.username} parts={parts} setParts={setParts} onBack={back} />}
      {screen === 'profile' && <Profile account={account} parts={parts} onCustomise={() => setScreen('avatar')} onBack={back} />}
      {screen === 'scores' && <Scores me={account.username} onBack={back} />}
      {screen === 'settings' && <Settings settings={settings} onToggle={toggle} onControls={() => setScreen('controls')} onLogout={logout} onBack={back} />}
      {screen === 'controls' && <Controls onBack={back} />}
      {screen === 'modes' && <Modes onDeploy={deploy} onBack={back} />}
      {screen === 'lobby' && <Lobby account={account} parts={parts} onBack={toMenu} />}
      {screen === 'pause' && <Pause sound={settings.sound} online={online} onResume={() => (online ? net().resume() : game().resume())}
        onToggleSound={() => toggle('sound')} onEnd={() => game().endNow()} onQuit={toMenu} />}
      {screen === 'results' && over && <Results game={over} me={account.username} onMenu={toMenu}
        onAgain={over.online ? () => { setOver(null); setScreen('lobby'); } : () => { const m = lastMode.current; toMenu(); deploy(m); }} />}
      <PuzzleModal />
    </>
  );
}
