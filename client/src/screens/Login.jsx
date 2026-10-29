// Log in / create account. The password goes to the server once over HTTPS and is
// stored there only as a bcrypt hash; after that an HttpOnly cookie identifies the
// player, which page JavaScript (and so an XSS attack) cannot read.
//
// "Forgot password?" asks the server for a reset link (in this demo it is printed in
// the server terminal instead of emailed). Opening the link (#reset=<token>) shows
// the "Choose a new password" form; the token is then removed from the address bar
// so it is not left in the browser history.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Sky } from './common.jsx';

// Rough strength hint while typing (the server enforces the minimum length).
function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}
const LEVELS = ['Too weak', 'Weak', 'OK', 'Strong', 'Very strong'];
const NAME = /^[A-Za-z0-9_]{3,16}$/;

// Asks the server whether the name is free, 400 ms after the player stops typing,
// so a fast typist sends one request instead of one per key.
function useNameHint(name, active) {
  const [hint, setHint] = useState(null);
  useEffect(() => {
    setHint(null);
    if (!active || !name) return undefined;
    if (!NAME.test(name)) { setHint({ ok: false, text: '3–16 letters, numbers or _' }); return undefined; }
    let stale = false;
    const timer = setTimeout(() => {
      api.available(name)
        .then(({ available }) => !stale && setHint(available ? { ok: true, text: 'Name is free' } : { ok: false, text: 'That name is taken' }))
        .catch(() => {});   // the hint is only a help; register still checks
    }, 400);
    return () => { stale = true; clearTimeout(timer); };
  }, [name, active]);
  return hint;
}

// The reset token from a link like http://localhost:3100/#reset=abc..., or null.
const tokenFromHash = () => (location.hash.startsWith('#reset=') ? location.hash.slice(7) : null);

const SUBMIT = { login: 'Log in', register: 'Create account', forgot: 'Send reset link', reset: 'Save new password' };
const TITLES = { forgot: 'Forgot your password?', reset: 'Choose a new password' };

export default function Login({ onLogin }) {
  const [resetToken] = useState(tokenFromHash);
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const [info, setInfo] = useState('');
  const hint = useNameHint(username.trim(), mode === 'register');
  const level = password ? strength(password) : '';

  // Take the token out of the address bar once it has been read.
  useEffect(() => { if (resetToken) history.replaceState(null, '', location.pathname); }, [resetToken]);

  function switchTo(next) { setMode(next); setError(''); setInfo(''); setPassword(''); setConfirm(''); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if ((mode === 'register' || mode === 'reset') && password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      if (mode === 'forgot') {
        setInfo((await api.forgot(username.trim())).message);
      } else if (mode === 'reset') {
        const { username: name } = await api.resetPassword(resetToken, password);
        switchTo('login');
        setUsername(name);
        setInfo('Password changed. Every device was logged out, so log in with the new password.');
      } else {
        const { user } = mode === 'login' ? await api.login(username.trim(), password, remember) : await api.register(username.trim(), password);
        onLogin(user, mode === 'register');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="screen login">
      <Sky />
      <div className="login-wrap">
        <div className="brand"><img className="emblem" src="/logo.svg" alt="" /><h1 className="logo small">BANANA<span>BRIGADE</span></h1></div>
        <form id="auth-form" className="panel login-panel" data-mode={mode} noValidate onSubmit={submit}>
          {TITLES[mode] ? <h2 className="auth-title">{TITLES[mode]}</h2> : (
            <div className="auth-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchTo('login')}>Log in</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchTo('register')}>Create account</button>
            </div>
          )}
          {mode === 'forgot' && <p className="auth-note">Type your username. A link to set a new password is sent to you; it works once, for 30 minutes. (In this demo the link appears in the server terminal.)</p>}
          {mode !== 'reset' && <label className="field">Username
            <input name="username" autoComplete="username" required minLength={3} maxLength={16} pattern="[A-Za-z0-9_]{3,16}"
              placeholder="e.g. sayub_s" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>}
          {mode === 'register' && <span className="name-hint" data-ok={hint?.ok} aria-live="polite">{hint?.text ?? ''}</span>}
          {mode !== 'forgot' && <label className="field">{mode === 'reset' ? 'New password' : 'Password'}
            <input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} maxLength={72}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>}
          <div className="register-only">
            <div className="meter" data-level={level}><i /><i /><i /><i /></div>
            <span className="meter-text">{password ? LEVELS[level] : ''}</span>
            <label className="field">Confirm password
              <input type="password" autoComplete="new-password" maxLength={72} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
          </div>
          {mode === 'login' && (
            <label className="remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me for 30 days <small>(not on a shared computer)</small>
            </label>
          )}
          {info && <p className="auth-info" role="status">{info}</p>}
          <p className="auth-error" role="alert">{error}</p>
          <button className="mbtn primary" type="submit" disabled={busy}>{SUBMIT[mode]}</button>
          {mode === 'login' && <button type="button" className="link-btn" onClick={() => switchTo('forgot')}>Forgot password?</button>}
          {TITLES[mode] && <button type="button" className="link-btn" onClick={() => switchTo('login')}>Back to log in</button>}
          <p className="auth-note">Passwords are stored only as bcrypt hashes. You stay signed in with a secure, HttpOnly session cookie.</p>
        </form>
      </div>
    </section>
  );
}
