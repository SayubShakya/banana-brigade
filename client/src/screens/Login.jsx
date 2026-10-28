// Log in / create account. The password goes to the server once over HTTPS and is
// stored there only as a bcrypt hash; after that an HttpOnly cookie identifies the
// player, which page JavaScript (and so an XSS attack) cannot read.
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

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const hint = useNameHint(username.trim(), mode === 'register');
  const level = password ? strength(password) : '';

  function switchTo(next) { setMode(next); setError(''); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const { user } = mode === 'login' ? await api.login(username.trim(), password, remember) : await api.register(username.trim(), password);
      onLogin(user, mode === 'register');
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
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchTo('login')}>Log in</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchTo('register')}>Create account</button>
          </div>
          <label className="field">Username
            <input name="username" autoComplete="username" required minLength={3} maxLength={16} pattern="[A-Za-z0-9_]{3,16}"
              placeholder="e.g. sayub_s" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          {mode === 'register' && <span className="name-hint" data-ok={hint?.ok} aria-live="polite">{hint?.text ?? ''}</span>}
          <label className="field">Password
            <input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} maxLength={72}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
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
          <p className="auth-error" role="alert">{error}</p>
          <button className="mbtn primary" type="submit" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
          <p className="auth-note">Passwords are stored only as bcrypt hashes. You stay signed in with a secure, HttpOnly session cookie.</p>
        </form>
      </div>
    </section>
  );
}
