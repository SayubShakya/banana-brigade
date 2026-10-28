// Settings: game options saved in this browser, and the account tools, which all
// run on the server (change password, log out everywhere, delete account).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Panel } from './common.jsx';

const OPTIONS = [['sound', 'Sound effects'], ['laser', 'Sight laser'], ['banners', 'Kill-streak banners'], ['fps', 'Show FPS (smoothness check)']];

// The Banana API connection, explained in plain words (the server fetches puzzles
// in advance and keeps a reserve for when the API is down).
function useApiStatus() {
  const [s, setS] = useState(null);
  useEffect(() => { api.status().then(setS).catch(() => setS({ online: false, ready: 0, reserve: 0 })); }, []);
  if (!s) return 'Checking…';
  if (s.online === false) return `Offline · ${s.reserve} reserve puzzles keep the game going`;
  return `Online · ${s.ready} puzzles ready`;
}

// The account tools. Each one asks for the password again where it matters, so a
// session left open on someone else's computer cannot take over the account.
function Account({ account, onLogout, onSignedOut, onAdmin }) {
  const [open, setOpen] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [msg, setMsg] = useState({ text: '', ok: false });

  const show = (name) => { setOpen(open === name ? '' : name); setMsg({ text: '', ok: false }); setCurrent(''); setNext(''); setConfirmPw(''); };
  const fail = (err) => setMsg({ text: err.message, ok: false });

  async function changePassword(e) {
    e.preventDefault();
    try {
      const { ended } = await api.changePassword(current, next);
      show('');
      setMsg({ text: `Password changed. ${ended} other session${ended === 1 ? '' : 's'} logged out.`, ok: true });
    } catch (err) { fail(err); }
  }
  async function logoutAll() {
    try { await api.logoutAll(); onSignedOut(); } catch (err) { fail(err); }
  }
  async function deleteAccount(e) {
    e.preventDefault();
    try { await api.deleteAccount(confirmPw); onSignedOut(); } catch (err) { fail(err); }
  }

  return (
    <>
      <h3 className="sub-head">Account · {account.username}</h3>
      <div className="setting"><span>Password</span><button className="toggle" aria-pressed={open === 'password'} onClick={() => show('password')}>Change</button></div>
      {open === 'password' && (
        <form className="account-form" onSubmit={changePassword}>
          <label className="field">Current password<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          <label className="field">New password (8–72 characters)<input type="password" autoComplete="new-password" minLength={8} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} /></label>
          <button className="mbtn primary" type="submit">Save new password</button>
        </form>
      )}
      <div className="setting"><span>All devices</span><button className="toggle" onClick={logoutAll}>Log out everywhere</button></div>
      <div className="setting"><span>Delete account</span><button className="toggle danger" aria-pressed={open === 'delete'} onClick={() => show('delete')}>Delete</button></div>
      {open === 'delete' && (
        <form className="account-form" onSubmit={deleteAccount}>
          <p className="setting-note">This removes your account, scores, campaign stars and daily results for good.</p>
          <label className="field">Type your password to confirm<input type="password" autoComplete="current-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></label>
          <button className="mbtn danger" type="submit" disabled={!confirmPw}>Delete my account</button>
        </form>
      )}
      {account.role === 'admin' && <div className="setting"><span>Admin tools</span><button className="toggle" onClick={onAdmin}>Open</button></div>}
      <p className={msg.ok ? 'account-ok' : 'auth-error'} role="alert">{msg.text}</p>
      <button className="mbtn ghost" onClick={onLogout}>Log out</button>
    </>
  );
}

export default function Settings({ settings, account, onToggle, onControls, onLogout, onSignedOut, onAdmin, onBack }) {
  const apiStatus = useApiStatus();
  return (
    <Panel title="Settings" subtitle="Game options are saved in this browser; your account lives on the server." footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="settings-list">
        {OPTIONS.map(([key, label]) => (
          <div className="setting" key={key}>
            <span>{label}</span>
            <button className="toggle" aria-pressed={settings[key]} onClick={() => onToggle(key)}>{settings[key] ? 'On' : 'Off'}</button>
          </div>
        ))}
        <div className="setting"><span>Banana API</span><span className="setting-note">{apiStatus}</span></div>
        <div className="setting"><span>Controls</span><button className="toggle" onClick={onControls}>View</button></div>
        <Account account={account} onLogout={onLogout} onSignedOut={onSignedOut} onAdmin={onAdmin} />
      </div>
    </Panel>
  );
}
