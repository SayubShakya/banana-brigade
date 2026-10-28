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
import Daily from './screens/Daily.jsx';
import Difficulty from './screens/Difficulty.jsx';
import Campaign from './screens/Campaign.jsx';
import { chapterOf, missionById } from './game/campaign.js';
import { DIFFICULTY } from './game/config.js';
import Toasts from './screens/Toasts.jsx';

// One game session for the whole page; it owns the battle canvas and HUD.
let gameSession = null;
const game = () => (gameSession ??= createGameSession());
// Online matches are run by the server; NetGame shows them (created on first use).
let netGame = null;
const net = () => (netGame ??= createNetGame());

// Saved settings. Older saves had one on/off "sound" switch: it becomes the mute.
const DEFAULT_SETTINGS = {
  musicVolume: 60, sfxVolume: 80, muted: false, laser: true, banners: true, fps: false, difficulty: 'medium',
  contrast: false, largeText: false, calm: false,
};
function loadSettings() {
  const { sound, ...saved } = readJson('settings', DEFAULT_SETTINGS);
  return sound === false ? { ...saved, muted: true } : saved;
}

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [account, setAccount] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [parts, setPartsState] = useState(() => readJson('avatar', DEFAULT_AVATAR));
  const [settings, setSettings] = useState(loadSettings);
  const [over, setOver] = useState(null);
  const [online, setOnline] = useState(false);
  const lastMode = useRef('quick');
  const [pendingMode, setPendingMode] = useState('quick');

  const setParts = (next) => { setPartsState(next); store.set('avatar', JSON.stringify(next)); };

  // The battle canvas is plain HTML outside React: show it during battles.
  useEffect(() => {
    document.getElementById('screen-battle').hidden = !(screen === 'battle' || screen === 'pause');
  }, [screen]);

  useEffect(() => { game().applySettings(settings); }, [settings]);

  // Accessibility settings are classes on <body>; the CSS does the rest.
  useEffect(() => {
    document.body.classList.toggle('a11y-contrast', !!settings.contrast);
    document.body.classList.toggle('a11y-large', !!settings.largeText);
    document.body.classList.toggle('a11y-calm', !!settings.calm);
  }, [settings.contrast, settings.largeText, settings.calm]);

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

  // Choosing a mode opens the difficulty picker (online matches use the room's rules).
  const deploy = useCallback((mode) => {
    if (mode === 'online') { net(); setScreen('lobby'); return; }
    setPendingMode(mode);
    setScreen('difficulty');
  }, []);

  const deployWith = useCallback(async (mode, difficulty) => {
    setSettings((s) => { const next = { ...s, difficulty }; store.set('settings', JSON.stringify(next)); return next; });
    game().prepare(mode, difficulty);
    setScreen('menu');
    const result = await askPuzzle('deploy', {
      modeLabel: `${MODES[mode].name} · ${DIFFICULTY[difficulty].name}`, seconds: DIFFICULTY[difficulty].puzzle.deploy,
      title: 'Deploy', subtitle: 'Solve the Banana puzzle to drop into battle.',
    });
    if (result === 'solved') startBattle(mode);
  }, [startBattle]);

  // A campaign mission: the chapter decides the difficulty; the deploy puzzle comes first.
  const playMission = useCallback(async (mission) => {
    const difficulty = chapterOf(mission).difficulty;
    game().quit();
    setOver(null);
    game().prepare('campaign', difficulty, mission);
    setScreen('campaign');
    const result = await askPuzzle('deploy', {
      modeLabel: `Mission ${mission.id} · ${DIFFICULTY[difficulty].name}`, seconds: DIFFICULTY[difficulty].puzzle.deploy,
      title: mission.name, subtitle: `${mission.target} kills in ${Math.floor(mission.timeLimit / 60)} minutes. Solve the Banana puzzle to deploy.`,
    });
    if (result === 'solved') startBattle('campaign');
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
  const setSetting = (key, value) => setSettings((s) => {
    const next = { ...s, [key]: typeof value === 'function' ? value(s[key]) : value };
    store.set('settings', JSON.stringify(next));
    return next;
  });
  const toggle = (key) => setSetting(key, (v) => !v);

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
    else if (name === 'puzzle') askPuzzle(['deploy', 'respawn', 'crate'].includes(arg) ? arg : 'deploy', { modeLabel: 'Quick Play', title: 'Banana puzzle', subtitle: 'Preview of the puzzle screen.' });
    else if (name === 'online') deploy('online');
    else if (['profile', 'scores', 'settings', 'avatar', 'controls', 'modes', 'daily', 'campaign'].includes(name)) setScreen(name);
  }

  const back = () => setScreen('menu');
  return (
    <>
      {screen === 'login' && <Login onLogin={(user, created) => { setAccount(user); setIsNew(created); setScreen('menu'); }} />}
      {screen === 'menu' && <Menu account={account} isNew={isNew} parts={parts} onDeploy={deploy} onOpen={setScreen} />}
      {screen === 'avatar' && <Avatar name={account.username} parts={parts} setParts={setParts} onBack={back} />}
      {screen === 'profile' && <Profile account={account} parts={parts} onCustomise={() => setScreen('avatar')} onBack={back} />}
      {screen === 'scores' && <Scores me={account.username} onBack={back} />}
      {screen === 'settings' && <Settings settings={settings} onToggle={toggle} onSet={setSetting} onControls={() => setScreen('controls')} onLogout={logout} onBack={back} />}
      {screen === 'controls' && <Controls onBack={back} />}
      {screen === 'modes' && <Modes onDeploy={deploy} onBack={back} />}
      {screen === 'campaign' && <Campaign onPlay={playMission} onBack={back} />}
      {screen === 'difficulty' && <Difficulty mode={pendingMode} current={settings.difficulty} onPick={(d) => deployWith(pendingMode, d)} onBack={back} />}
      {screen === 'daily' && <Daily me={account.username} onBack={back} />}
      {screen === 'lobby' && <Lobby account={account} parts={parts} onBack={toMenu} />}
      {screen === 'pause' && <Pause sound={!settings.muted} online={online} onResume={() => (online ? net().resume() : game().resume())}
        onToggleSound={() => toggle('muted')} onEnd={() => game().endNow()} onQuit={toMenu} />}
      {screen === 'results' && over && <Results game={over} me={account.username} onMenu={toMenu} onMission={playMission} onMap={() => { game().quit(); setOver(null); setScreen('campaign'); }}
        onAgain={over.online ? () => { setOver(null); setScreen('lobby'); } : () => { const m = lastMode.current; toMenu(); deployWith(m, settings.difficulty); }} />}
      <PuzzleModal />
      <Toasts />
    </>
  );
}
