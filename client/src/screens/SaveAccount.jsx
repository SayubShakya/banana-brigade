// Saves a guest as a full account: the player picks a name and a password, and keeps
// every score, achievement and campaign star earned as a guest (the server keeps the
// same record and only adds the name and the bcrypt hash).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useState } from 'react';
import { api } from '../api.js';
import { Panel } from './common.jsx';

export default function SaveAccount({ account, onSaved, onBack }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
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
    <Panel narrow title="Save your progress" subtitle={`You are playing as ${account.username}. A guest is deleted after 7 days.`}
      footer={<button className="mbtn ghost" onClick={onBack}>Not now</button>}>
      <form className="account-form" onSubmit={submit} noValidate>
        <p className="setting-note">Pick a name and a password. Your scores, achievements and campaign stars stay with you.</p>
        <label className="field">Username<input autoComplete="username" maxLength={16} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. sayub_s" /></label>
        <label className="field">Password (8–72 characters)<input type="password" autoComplete="new-password" maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="field">Confirm password<input type="password" autoComplete="new-password" maxLength={72} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <p className="auth-error" role="alert">{error}</p>
        <button className="mbtn primary" type="submit" disabled={busy || !username || !password}>Save account</button>
      </form>
    </Panel>
  );
}
