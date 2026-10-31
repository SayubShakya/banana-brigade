// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { closeSocket } from '../net/socket.js';
import { emit } from '../services/eventBus.js';
import { resetSeenCutscenes, playCutscene } from '../services/cutsceneBridge.js';
import { Panel, Skeleton } from '../components/common.jsx';
import { toggleFullscreen, useFullscreen } from '../services/fullscreen.js';

const OPTIONS = [['autoFire', 'Auto-fire when aimed at an enemy'], ['laser', 'Sight laser'], ['banners', 'Kill-streak banners'], ['fps', 'Show FPS (smoothness check)']];
const ACCESSIBILITY = [['contrast', 'High contrast'], ['largeText', 'Large text'], ['calm', 'Reduced motion']];
const VOLUMES = [['musicVolume', 'Music volume'], ['sfxVolume', 'Effects volume']];

function useApiStatus() {
  const [s, setS] = useState(null);
  useEffect(() => { api.status().then(setS).catch(() => setS({ online: false, ready: 0, reserve: 0 })); }, []);
  if (!s) return { line: 'Checking…' };
  const line = s.circuit?.state === 'open'
    ? `Paused after repeated failures · trying again in ${Math.ceil(s.circuit.retryInMs / 1000)} s · ${s.reserve} reserve puzzles in use`
    : s.online === false ? `Offline · ${s.reserve} reserve puzzles keep the game going`
      : `Online · ${s.ready} puzzles ready`;
  return { line, health: describeHealth(s) };
}

function describeHealth(s) {
  if (!s.calls) return 'No calls to the Banana API yet.';
  const worked = Math.round((s.successRate / 100) * s.calls);
  const parts = [];
  if (s.p50LatencyMs != null) parts.push(`Usually answers in ${s.p50LatencyMs} ms (last call ${s.lastLatencyMs} ms)`);
  parts.push(`${worked} of the last ${s.calls} calls worked`);
  if (s.retriesUsed) parts.push(`${s.retriesUsed} ${s.retriesUsed === 1 ? 'retry' : 'retries'} needed`);
  if (s.lastError) parts.push(`last problem: ${s.lastError}`);
  return parts.join(' · ');
}

const ago = (iso) => {
  if (!iso) return 'unknown';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};
function Devices() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.sessions().then((s) => setList(s.list)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  async function end(handle) {
    try { await api.endSession(handle); load(); } catch (e) { setError(e.message); }
  }
  return (
    <div className="devices">
      <h4>Where you're signed in</h4>
      {!list && !error && <Skeleton rows={2} />}
      <ul>
        {list?.map((d) => (
          <li key={d.handle}>
            <span><b>{d.device}</b>{d.current && <span className="role-badge" data-role="guest">this device</span>}<small>Signed in {ago(d.createdAt)} · last used {ago(d.lastSeen)}</small></span>
            {!d.current && <button className="toggle" onClick={() => end(d.handle)}>Sign out</button>}
          </li>
        ))}
      </ul>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}

function Account({ account, onLogout, onSignedOut, onAdmin, onSave, onPrivacy }) {
  const [open, setOpen] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [devicesKey, setDevicesKey] = useState(0);

  const show = (name) => { setOpen(open === name ? '' : name); setMsg({ text: '', ok: false }); setCurrent(''); setNext(''); setConfirmPw(''); };
  const fail = (err) => setMsg({ text: err.message, ok: false });
  const note = msg.text ? <p className={msg.ok ? 'account-ok' : 'auth-error'} role="alert">{msg.text}</p> : null;

  async function changePassword(e) {
    e.preventDefault();
    try {
      const { ended } = await api.changePassword(current, next);
      show('');
      setDevicesKey((k) => k + 1);
      setMsg({ text: `Password changed. ${ended} other session${ended === 1 ? '' : 's'} logged out.`, ok: true });
    } catch (err) { fail(err); }
  }
  async function logoutAll() {
    try { closeSocket(); await api.logoutAll(); onSignedOut(); } catch (err) { fail(err); }
  }
  async function deleteAccount(e) {
    e.preventDefault();
    try { closeSocket(); await api.deleteAccount(confirmPw); onSignedOut(); emit('toast:info', { text: 'Your account and all its data were deleted.' }); } catch (err) { fail(err); }
  }

  return (
    <>
      <h3 className="sub-head">Account · <span className="name-case">{account.username}</span></h3>
      {account.guest && <div className="setting"><span>Guest account (deleted after 7 days)</span><button className="toggle" onClick={onSave}>Save it</button></div>}
      {!account.guest && <div className="setting"><span>Password</span><button className="toggle" aria-pressed={open === 'password'} onClick={() => show('password')}>Change</button></div>}
      {open === 'password' && (
        <form className="account-form" onSubmit={changePassword}>
          <label className="field">Current password<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          <label className="field">New password (8–72 characters)<input type="password" autoComplete="new-password" minLength={8} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} /></label>
          <button className="mbtn primary" type="submit">Save new password</button>
          {note}
        </form>
      )}
      {!open && note}
      <Devices key={devicesKey} />
      <div className="setting"><span>All devices</span><button className="toggle action" aria-pressed={open === 'all'} onClick={() => show('all')}>Log out everywhere</button></div>
      {open === 'all' && (
        <div className="account-form">
          <p className="setting-note">This signs you out on every device, this one too.</p>
          <button className="mbtn danger" onClick={logoutAll}>Yes, log out everywhere</button>
          {note}
        </div>
      )}
      <div className="setting"><span>Your data (JSON file)</span><a className="toggle action" href="/api/v1/auth/export" download>Download my data</a></div>
      <div className="setting"><span>What we store and why</span><button className="toggle action" onClick={onPrivacy}>Privacy</button></div>
      <div className="setting"><span>Delete account</span><button className="toggle danger" aria-pressed={open === 'delete'} onClick={() => show('delete')}>Delete</button></div>
      {open === 'delete' && (
        <form className="account-form" onSubmit={deleteAccount}>
          <p className="setting-note">This removes your account, scores, campaign stars and daily results for good.</p>
          {!account.guest && <label className="field">Type your password to confirm<input type="password" autoComplete="current-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></label>}
          <button className="mbtn danger" type="submit" disabled={!confirmPw && !account.guest}>Delete my account</button>
          {note}
        </form>
      )}
      {account.role === 'admin' && <div className="setting"><span>Admin tools</span><button className="toggle" onClick={onAdmin}>Open</button></div>}
      <button className="mbtn ghost" onClick={onLogout}>Log out</button>
    </>
  );
}

function Toggle({ label, value, onClick }) {
  return (
    <div className="setting">
      <span>{label}</span>
      <button className="toggle" aria-pressed={!!value} aria-label={label} onClick={onClick}>{value ? 'On' : 'Off'}</button>
    </div>
  );
}

const TABS = [['game', 'Game'], ['sound', 'Sound'], ['access', 'Accessibility'], ['account', 'Account']];

export default function Settings({ settings, account, onToggle, onSet, onControls, onLogout, onSignedOut, onAdmin, onSave, onPrivacy, onBack }) {
  const apiStatus = useApiStatus();
  const [isFullscreen, canFullscreen] = useFullscreen();
  const [tab, setTab] = useState('game');
  return (
    <Panel wide title="Settings" subtitle="Game options are saved in this browser; your account lives on the server."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      <div className="settings-list">
        {tab === 'game' && <>
          {OPTIONS.map(([key, label]) => <Toggle key={key} label={label} value={settings[key]} onClick={() => onToggle(key)} />)}
          <Toggle label="Story clips" value={settings.storyClips !== false} onClick={() => onSet('storyClips', settings.storyClips === false)} />
          <div className="setting"><span>Replay story clips</span><button className="toggle" onClick={() => { resetSeenCutscenes(); emit('toast:info', { text: 'Story clips will play again.' }); playCutscene('intro'); }}>Replay</button></div>
          {canFullscreen && <Toggle label="Fullscreen" value={isFullscreen} onClick={toggleFullscreen} />}
          <div className="setting"><span>Controls</span><button className="toggle" onClick={onControls}>View</button></div>
          <div className="setting"><span>Banana API</span><span className="setting-note">{apiStatus.line}</span></div>
          {apiStatus.health && <div className="setting"><span>API health</span><span className="setting-note">{apiStatus.health}</span></div>}
        </>}
        {tab === 'sound' && <>
          {VOLUMES.map(([key, label]) => (
            <div className="setting" key={key}>
              <label htmlFor={`set-${key}`}>{label}</label>
              <span className="slider">
                <input id={`set-${key}`} type="range" min="0" max="100" step="5" value={settings[key]} disabled={settings.muted}
                  onChange={(e) => onSet(key, Number(e.target.value))} />
                <output htmlFor={`set-${key}`}>{settings[key]}</output>
              </span>
            </div>
          ))}
          <Toggle label="Mute all sound" value={settings.muted} onClick={() => onToggle('muted')} />
        </>}
        {tab === 'access' && ACCESSIBILITY.map(([key, label]) => <Toggle key={key} label={label} value={settings[key]} onClick={() => onToggle(key)} />)}
        {tab === 'account' && <Account account={account} onLogout={onLogout} onSignedOut={onSignedOut} onAdmin={onAdmin} onSave={onSave} onPrivacy={onPrivacy} />}
      </div>
    </Panel>
  );
}
