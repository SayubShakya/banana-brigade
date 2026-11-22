// App.jsx: the root React component of the Banana Brigade UI.
// It wires the controller hooks (navigation, settings, account, battle) to the views
// and shows exactly one screen at a time, plus the always-mounted overlays.
import { useNavigation, useStartRoute } from './controllers/useNavigation.js';
import { useSettings } from './controllers/useSettings.js';
import { useAccount } from './controllers/useAccount.js';
import { useBattle } from './controllers/useBattle.js';
import Login from './views/Login/Login.jsx';
import AdminLogin from './views/Login/AdminLogin.jsx';
import Menu from './views/Menu.jsx';
import Avatar from './views/Avatar.jsx';
import Profile from './views/Profile.jsx';
import Scores from './views/Scores.jsx';
import History from './views/History.jsx';
import Settings from './views/Settings.jsx';
import Admin from './views/Admin/Admin.jsx';
import Controls from './views/Controls.jsx';
import Pause from './views/Pause.jsx';
import Results from './views/Results.jsx';
import Lobby from './views/Lobby.jsx';
import Modes from './views/Modes.jsx';
import Daily from './views/Daily.jsx';
import Difficulty from './views/Difficulty.jsx';
import Campaign from './views/Campaign.jsx';
import Home from './views/Home.jsx';
import SaveAccount from './views/SaveAccount.jsx';
import Offline from './views/Offline.jsx';
import { NotFound, Privacy, Terms } from './views/Legal.jsx';
import PuzzleModal from './components/PuzzleModal.jsx';
import PowerPicker from './components/PowerPicker.jsx';
import Toasts from './components/Toasts.jsx';
import Cutscene from './components/Cutscene.jsx';
import BootCampCoach from './components/BootCampCoach.jsx';

/**
 * App: the top-level component (the "controller glue" in our MVC layout).
 * - useNavigation keeps the current screen name; useAccount keeps the logged-in user;
 *   useBattle starts and ends matches; useStartRoute decides the first screen on page load.
 * Renders: the view whose name matches `screen`, then the overlays (puzzle, power picker,
 * cutscene, toasts, boot camp coach) which open themselves through the event bus / bridges.
 */
export default function App() {
  const nav = useNavigation();
  const prefs = useSettings();
  const player = useAccount(nav);
  const battle = useBattle(nav, player, prefs);
  const start = useStartRoute(nav, player, prefs, battle);

  const { screen, back, openFrom } = nav;
  const { account, parts } = player;
  const { settings } = prefs;
  const leavePublic = () => nav.leavePublic(!!account);

  // Simple screen switch: each line renders a view only when `screen` matches its name.
  // The admin screen also checks account.role === 'admin', but that is only a UI check;
  // the server checks the role again on every /api/v1/admin request (the real guard).
  return (
    <>
      {screen === 'home' && <Home onPlay={() => nav.setScreen('login')} onGuest={player.playAsGuest} onOpen={nav.setScreen} />}
      {screen === 'save' && account?.guest && <SaveAccount account={account} onSaved={player.onSaved} onBack={back} />}
      {screen === 'privacy' && <Privacy onBack={leavePublic} />}
      {screen === 'terms' && <Terms onBack={leavePublic} />}
      {screen === 'notfound' && <NotFound onHome={nav.reload} />}
      {screen === 'offline' && <Offline onBack={start} />}
      {screen === 'login' && <Login key={nav.loginKey} onGuest={player.playAsGuest} onHome={nav.toHome} onLogin={player.onLogin} />}
      {screen === 'adminLogin' && <AdminLogin onLogin={player.onAdminLogin} onPlayer={() => { nav.clearHash(); nav.setScreen('login'); }} onHome={nav.toHome} />}
      {screen === 'menu' && <Menu account={account} isNew={player.isNew} parts={parts} onDeploy={(m) => battle.deployFrom(null, m)} onOpen={nav.open} />}
      {screen === 'avatar' && <Avatar name={account.username} parts={parts} setParts={player.setParts} onBack={back} />}
      {screen === 'profile' && <Profile account={account} parts={parts} onCustomise={() => openFrom('profile', 'avatar')} onHistory={() => openFrom('profile', 'history')} onBack={back} />}
      {screen === 'scores' && <Scores me={account.username} onBack={back} />}
      {screen === 'history' && <History account={account} onBack={back} />}
      {screen === 'settings' && <Settings settings={settings} account={account} onToggle={prefs.toggle} onSet={prefs.setSetting} onControls={() => openFrom('settings', 'controls')} onLogout={player.logout}
        onSignedOut={player.signedOut} onAdmin={() => openFrom('settings', 'admin')} onSave={() => openFrom('settings', 'save')} onPrivacy={() => openFrom('settings', 'privacy')} onBack={back} />}
      {screen === 'admin' && account?.role === 'admin' && <Admin account={account} onBack={back} />}
      {screen === 'controls' && <Controls onBack={back} />}
      {screen === 'modes' && <Modes onDeploy={(m) => battle.deployFrom('modes', m)} onBack={back} />}
      {screen === 'campaign' && <Campaign onPlay={battle.playMission} onBack={back} />}
      {screen === 'difficulty' && <Difficulty mode={battle.pendingMode} current={settings.difficulty} onPick={(d, len, map) => battle.deployWith(battle.pendingMode, d, len, map)} onBack={back} />}
      {screen === 'daily' && <Daily me={account.username} onBack={back} />}
      {screen === 'lobby' && <Lobby account={account} parts={parts} onBack={battle.toMenu} />}
      {screen === 'pause' && <Pause sound={!settings.muted} online={battle.online} canEnd={battle.canEnd()} onResume={battle.resume}
        onToggleSound={() => prefs.toggle('muted')} onEnd={battle.endNow} onQuit={battle.toMenu} />}
      {screen === 'results' && battle.over && <Results game={battle.over} me={account.username} onMenu={battle.toMenu} onMission={battle.playMission} onMap={battle.toMap}
        onAgain={battle.playAgain} />}
      <BootCampCoach />
      <PuzzleModal />
      <PowerPicker />
      <Cutscene />
      <Toasts />
    </>
  );
}
