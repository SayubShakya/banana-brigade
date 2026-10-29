// The React side of Banana Brigade: which screen is showing, who is logged in, and
// the hand-over to the game session for battles. Screens are plain components; the
// battle itself is drawn by the game engine (GameSession) outside React, and the
// two talk through the event bus (game:state, game:over) and a few method calls.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { useBus } from './hooks/useBus.js';
import { emit } from './lib/eventBus.js';
import { askPuzzle } from './lib/puzzleBridge.js';
import { readJson, store } from './lib/storage.js';
import { MODES } from './game/config.js';
import { DEFAULT_AVATAR } from './game/characters.js';
import { createGameSession } from './game/GameSession.js';
import { createNetGame } from './net/NetGame.js';
import { closeSocket, getSocket } from './net/socket.js';
import Login from './screens/Login/Login.jsx';
import Menu from './screens/Menu.jsx';
import Avatar from './screens/Avatar.jsx';
import Profile from './screens/Profile.jsx';
import Scores from './screens/Scores.jsx';
import Settings from './screens/Settings.jsx';
import Admin from './screens/Admin/Admin.jsx';
import Controls from './screens/Controls.jsx';
import Pause from './screens/Pause.jsx';
import Results from './screens/Results.jsx';
import PuzzleModal from './components/PuzzleModal.jsx';
import PowerPicker from './components/PowerPicker.jsx';
import { askPower } from './lib/powerBridge.js';
import { powerChoices } from './game/world.js';
import Lobby from './screens/Lobby.jsx';
import Modes from './screens/Modes.jsx';
import Daily from './screens/Daily.jsx';
import Difficulty from './screens/Difficulty.jsx';
import Campaign from './screens/Campaign.jsx';
import { chapterOf, missionById } from './game/campaign.js';
import { mapName } from './game/maps.js';
import { DIFFICULTY } from './game/config.js';
import Toasts from './components/Toasts.jsx';
import Home from './screens/Home.jsx';
import SaveAccount from './screens/SaveAccount.jsx';
import Offline from './screens/Offline.jsx';
import { NotFound, Privacy, Terms } from './screens/Legal.jsx';

// One game session for the whole page; it owns the battle canvas and HUD.
let gameSession = null;
const game = () => (gameSession ??= createGameSession());
// Online matches are run by the server; NetGame shows them (created on first use).
let netGame = null;
const net = () => (netGame ??= createNetGame());

// Saved settings. Older saves had one on/off "sound" switch: it becomes the mute.
const DEFAULT_SETTINGS = {
  musicVolume: 60, sfxVolume: 80, muted: false, laser: true, banners: true, fps: false, autoFire: true, difficulty: 'medium',
  contrast: false, largeText: false, calm: false,
};
function loadSettings() {
  const { sound, ...saved } = readJson('settings', DEFAULT_SETTINGS);
  const withDefaults = { ...DEFAULT_SETTINGS, ...saved };   // new options (e.g. autoFire) get their default
  return sound === false ? { ...withDefaults, muted: true } : withDefaults;
}

// Pages anyone can open by hash, logged in or not.
const PUBLIC = ['privacy', 'terms'];

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [account, setAccount] = useState(null);
  const accountRef = useRef(null);
  const [loginKey, setLoginKey] = useState(0);
  // Where Back goes from a sub-screen (e.g. Avatar opened from Profile goes back to Profile).
  const [parent, setParent] = useState(null);
  const openFrom = (from, next) => { setParent(from); setScreen(next); };   // a new key remounts Login (e.g. for a reset link)
  accountRef.current = account;
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
  // A player who reaches #admin is sent back to the menu (the API would refuse them anyway).
  useEffect(() => { if (screen === 'admin' && account && account.role !== 'admin') setScreen('menu'); }, [screen, account]);

  // Accessibility settings are classes on <body>; the CSS does the rest.
  useEffect(() => {
    document.body.classList.toggle('a11y-contrast', !!settings.contrast);
    document.body.classList.toggle('a11y-large', !!settings.largeText);
    document.body.classList.toggle('a11y-calm', !!settings.calm);
  }, [settings.contrast, settings.largeText, settings.calm]);

  // Who is this? Already logged in (the session cookie is still valid): the menu.
  // Otherwise the public home page, or a public page asked for by its hash
  // (#login, #privacy, #terms; a reset link #reset=... opens the login screen's
  // reset form). Any other path than / is a 404, and no answer at all means the
  // server is down.
  const start = useCallback(() => {
    if (location.pathname !== '/') { setScreen('notfound'); return; }
    api.me().then(({ user }) => {
      const hash = location.hash.slice(1);
      if (!user || hash.startsWith('reset=')) {
        setScreen(hash.startsWith('reset=') || hash === 'login' ? 'login' : PUBLIC.includes(hash) ? hash : 'home');
        return;
      }
      setAccount(user);
      accountRef.current = user;   // so a preview battle already uses the player's name
      setScreen('menu');
      openPreview(hash);
    }).catch((err) => setScreen(err.offline ? 'offline' : 'home'));
  }, []);
  useEffect(start, [start]);
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

  // Engine → React: battle state changes and the end of a match.
  useBus('game:state', ({ state, online: isOnline = false }) => {
    setOnline(isOnline);
    if (state === 'paused') setScreen('pause');
    else if (state === 'playing' || state === 'ending') setScreen('battle');   // ending: the last moment before results
  });
  useBus('game:over', (payload) => { setOver(payload); setScreen('results'); });
  // The server ended this session (see api.js and net/socket.js): back to the home
  // page with the reason, rather than screens that fail one by one.
  useBus('session:ended', ({ text }) => {
    if (!accountRef.current) return;
    signedOut();
    emit('toast:error', { text });
  });

  const startBattle = useCallback((mode) => {
    game().start({ playerName: accountRef.current?.username ?? 'You', parts });
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
      title: mission.name, subtitle: `${mapName(mission.map)}: ${mission.target} kills in ${Math.floor(mission.timeLimit / 60)} minutes. Solve the Banana puzzle to deploy.`,
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
  // Back to the login screen once the server has ended the session (logout,
  // log out everywhere or a deleted account).
  const signedOut = () => { game().quit(); netGame?.leave(); closeSocket(); setAccount(null); setScreen('home'); };
  // "Play as guest": a temporary account straight away (the server makes it).
  const playAsGuest = async () => {
    try {
      const { user } = await api.guest();
      setAccount(user); setIsNew(true); setScreen('menu');
    } catch (err) { if (!err.offline && !(err.status >= 500)) emit('toast:error', { text: err.message }); }   // api.js already shows the others
  };
  // Privacy and Terms go back to wherever the player came from: the menu or the home page.
  // The hash is cleared too, so a reload or the same link later behaves as expected.
  const clearHash = () => { if (location.hash) history.replaceState(null, '', location.pathname); };
  const leavePublic = () => { clearHash(); setScreen(account ? parent ?? 'menu' : 'home'); setParent(null); };
  const logout = async () => {
    try { await api.logout(); } finally { signedOut(); }
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
    else if (name === 'power') askPower(powerChoices());
    else if (name === 'puzzle') askPuzzle(['deploy', 'respawn', 'crate'].includes(arg) ? arg : 'deploy', { modeLabel: 'Quick Play', title: 'Banana puzzle', subtitle: 'Preview of the puzzle screen.' });
    else if (name === 'online') deploy('online');
    else if (['privacy', 'terms', 'profile', 'scores', 'settings', 'avatar', 'controls', 'modes', 'daily', 'campaign', 'admin'].includes(name)) setScreen(name);
  }

  const back = () => { setScreen(parent ?? 'menu'); setParent(null); };
  return (
    <>
      {screen === 'home' && <Home onPlay={() => setScreen('login')} onGuest={playAsGuest} onOpen={setScreen} />}
      {screen === 'save' && account?.guest && <SaveAccount account={account} onSaved={(user) => { setAccount(user); setIsNew(true); setScreen('menu'); }} onBack={back} />}
      {screen === 'privacy' && <Privacy onBack={leavePublic} />}
      {screen === 'terms' && <Terms onBack={leavePublic} />}
      {screen === 'notfound' && <NotFound onHome={() => { location.replace('/'); }} />}
      {screen === 'offline' && <Offline onBack={start} />}
      {screen === 'login' && <Login key={loginKey} onGuest={playAsGuest} onHome={() => { clearHash(); setScreen('home'); }} onLogin={(user, created) => { clearHash(); setAccount(user); setIsNew(created); setScreen('menu'); }} />}
      {screen === 'menu' && <Menu account={account} isNew={isNew} parts={parts} onDeploy={(m) => { setParent(null); deploy(m); }} onOpen={(next) => { setParent(null); setScreen(next); }} />}
      {screen === 'avatar' && <Avatar name={account.username} parts={parts} setParts={setParts} onBack={back} />}
      {screen === 'profile' && <Profile account={account} parts={parts} onCustomise={() => openFrom('profile', 'avatar')} onBack={back} />}
      {screen === 'scores' && <Scores me={account.username} onBack={back} />}
      {screen === 'settings' && <Settings settings={settings} account={account} onToggle={toggle} onSet={setSetting} onControls={() => openFrom('settings', 'controls')} onLogout={logout}
        onSignedOut={signedOut} onAdmin={() => openFrom('settings', 'admin')} onSave={() => openFrom('settings', 'save')} onPrivacy={() => openFrom('settings', 'privacy')} onBack={back} />}
      {/* Only offered to admins; the server still checks the role on every admin request. */}
      {screen === 'admin' && account?.role === 'admin' && <Admin account={account} onBack={back} />}
      {screen === 'controls' && <Controls onBack={back} />}
      {screen === 'modes' && <Modes onDeploy={(m) => { setParent('modes'); deploy(m); }} onBack={back} />}
      {screen === 'campaign' && <Campaign onPlay={playMission} onBack={back} />}
      {screen === 'difficulty' && <Difficulty mode={pendingMode} current={settings.difficulty} onPick={(d) => deployWith(pendingMode, d)} onBack={back} />}
      {screen === 'daily' && <Daily me={account.username} onBack={back} />}
      {screen === 'lobby' && <Lobby account={account} parts={parts} onBack={toMenu} />}
      {screen === 'pause' && <Pause sound={!settings.muted} online={online} onResume={() => (online ? net().resume() : game().resume())}
        onToggleSound={() => toggle('muted')} onEnd={() => game().endNow()} onQuit={toMenu} />}
      {screen === 'results' && over && <Results game={over} me={account.username} onMenu={toMenu} onMission={playMission} onMap={() => { game().quit(); setOver(null); setScreen('campaign'); }}
        onAgain={over.online ? () => { setOver(null); setScreen('lobby'); } : () => { const m = lastMode.current; toMenu(); deployWith(m, settings.difficulty); }} />}
      <PuzzleModal />
      <PowerPicker />
      <Toasts />
    </>
  );
}
