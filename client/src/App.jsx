// The React side of Banana Brigade: the controllers (controllers/) hold the state and
// logic, and App only picks the view (views/) for the current screen.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useNavigation, useStartRoute } from './controllers/useNavigation.js';
import { useSettings } from './controllers/useSettings.js';
import { useAccount } from './controllers/useAccount.js';
import { useBattle } from './controllers/useBattle.js';
import Login from './views/Login/Login.jsx';
import Menu from './views/Menu.jsx';
import Avatar from './views/Avatar.jsx';
import Profile from './views/Profile.jsx';
import Scores from './views/Scores.jsx';
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

  return (
    <>
      {screen === 'home' && <Home onPlay={() => nav.setScreen('login')} onGuest={player.playAsGuest} onOpen={nav.setScreen} />}
      {screen === 'save' && account?.guest && <SaveAccount account={account} onSaved={player.onSaved} onBack={back} />}
      {screen === 'privacy' && <Privacy onBack={leavePublic} />}
      {screen === 'terms' && <Terms onBack={leavePublic} />}
      {screen === 'notfound' && <NotFound onHome={nav.reload} />}
      {screen === 'offline' && <Offline onBack={start} />}
      {screen === 'login' && <Login key={nav.loginKey} onGuest={player.playAsGuest} onHome={nav.toHome} onLogin={player.onLogin} />}
      {screen === 'menu' && <Menu account={account} isNew={player.isNew} parts={parts} onDeploy={(m) => battle.deployFrom(null, m)} onOpen={nav.open} />}
      {screen === 'avatar' && <Avatar name={account.username} parts={parts} setParts={player.setParts} onBack={back} />}
      {screen === 'profile' && <Profile account={account} parts={parts} onCustomise={() => openFrom('profile', 'avatar')} onBack={back} />}
      {screen === 'scores' && <Scores me={account.username} onBack={back} />}
      {screen === 'settings' && <Settings settings={settings} account={account} onToggle={prefs.toggle} onSet={prefs.setSetting} onControls={() => openFrom('settings', 'controls')} onLogout={player.logout}
        onSignedOut={player.signedOut} onAdmin={() => openFrom('settings', 'admin')} onSave={() => openFrom('settings', 'save')} onPrivacy={() => openFrom('settings', 'privacy')} onBack={back} />}
      {/* Only offered to admins; the server still checks the role on every admin request. */}
      {screen === 'admin' && account?.role === 'admin' && <Admin account={account} onBack={back} />}
      {screen === 'controls' && <Controls onBack={back} />}
      {screen === 'modes' && <Modes onDeploy={(m) => battle.deployFrom('modes', m)} onBack={back} />}
      {screen === 'campaign' && <Campaign onPlay={battle.playMission} onBack={back} />}
      {screen === 'difficulty' && <Difficulty mode={battle.pendingMode} current={settings.difficulty} onPick={(d) => battle.deployWith(battle.pendingMode, d)} onBack={back} />}
      {screen === 'daily' && <Daily me={account.username} onBack={back} />}
      {screen === 'lobby' && <Lobby account={account} parts={parts} onBack={battle.toMenu} />}
      {screen === 'pause' && <Pause sound={!settings.muted} online={battle.online} onResume={battle.resume}
        onToggleSound={() => prefs.toggle('muted')} onEnd={battle.endNow} onQuit={battle.toMenu} />}
      {screen === 'results' && battle.over && <Results game={battle.over} me={account.username} onMenu={battle.toMenu} onMission={battle.playMission} onMap={battle.toMap}
        onAgain={battle.playAgain} />}
      <PuzzleModal />
      <PowerPicker />
      <Toasts />
    </>
  );
}
