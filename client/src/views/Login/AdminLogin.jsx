// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useState } from 'react';
import { api } from '../../services/api.js';
import { Sky, Icon } from '../../components/common.jsx';

export default function AdminLogin({ onLogin, onPlayer, onHome }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user } = await api.adminLogin(username.trim(), password);
      onLogin(user);
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
        <form className="panel login-panel admin-login" noValidate onSubmit={submit}>
          <h2 className="auth-title">Admin login <span className="role-badge" data-role="admin">admin</span></h2>
          <p className="auth-note">Only admin accounts can sign in here. Players use the normal login.</p>
          <label className="field">Username
            <input name="username" autoComplete="username" autoFocus required maxLength={16} value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field">Password
            <input name="password" type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="mbtn primary" type="submit" disabled={busy}>Log in as admin</button>
          <div className="auth-links">
            <button type="button" className="pill-btn" onClick={onHome}><span aria-hidden="true">←</span>Home</button>
            <button type="button" className="pill-btn" onClick={onPlayer}><Icon id="user" />Player login</button>
          </div>
        </form>
      </div>
    </section>
  );
}
