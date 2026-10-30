// Saves a guest as a full account: the player picks a name and a password, and keeps
// every score, achievement and campaign star earned as a guest (the server keeps the
// same record and only adds the name and the bcrypt hash). The fields work like
// "Create account": a live name check and a strength meter.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useState } from 'react';
import { api } from '../lib/api.js';
import { Panel } from '../components/common.jsx';
import { useNameHint, strength, LEVELS } from './Login/authFields.js';

export default function SaveAccount({ account, onSaved, onBack }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hint = useNameHint(username.trim(), true);
  const level = password ? strength(password) : '';

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Choose a username.'); return; }
    if (password.length < 8) { setError('The password needs at least 8 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const { user } = await api.upgrade(username.trim(), password);
      onSaved(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel narrow title="Save account" subtitle={`You are playing as ${account.username}. A guest is deleted after 7 days; your scores, achievements and stars stay when you save.`}
      footer={<button className="mbtn ghost" onClick={onBack}>Not now</button>}>
      <form className="save-form" onSubmit={submit} noValidate>
        <label className="field">Username
          <input autoComplete="username" autoFocus maxLength={16} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. sayub_s" />
        </label>
        <span className="name-hint" data-ok={hint?.ok} aria-live="polite">{hint?.text ?? ''}</span>
        <label className="field">Password
          <input type="password" autoComplete="new-password" maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="meter" data-level={level}><i /><i /><i /><i /></div>
        {password && <span className="meter-text">{LEVELS[level]}</span>}
        <label className="field">Confirm password
          <input type="password" autoComplete="new-password" maxLength={72} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="mbtn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save account'}</button>
      </form>
    </Panel>
  );
}
