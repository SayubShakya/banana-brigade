// Admin tools: every account, with buttons to reset scores and to promote or demote,
// and the live event feed from the server.
// This screen is only shown to admins, but that is just convenience: the server
// checks the role in the database on every admin request and answers 403 otherwise.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Panel } from './common.jsx';
import LiveEvents from './LiveEvents.jsx';

const TABS = [['players', 'Players'], ['events', 'Live events']];

const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function Admin({ account, onBack }) {
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('players');

  const load = () => api.adminUsers().then(({ users: list }) => setUsers(list)).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  async function act(promise, done) {
    setMsg('');
    try { await promise; setMsg(done); load(); } catch (err) { setMsg(err.message); }
  }

  return (
    <Panel wide title="Admin" subtitle="The server checks the role on every request; hiding this screen is not what protects it."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {tab === 'events' && <LiveEvents />}
      {tab === 'players' && <>
      <table className="results compact admin-table">
        <thead><tr><th>Player</th><th>Role</th><th>Joined</th><th>Games</th><th>Kills</th><th>Puzzles</th><th>Actions</th></tr></thead>
        <tbody>
          {!users && <tr className="empty-row"><td colSpan={7}>Loading…</td></tr>}
          {users?.map((u) => {
            const me = u.id === account.id;
            const next = u.role === 'admin' ? 'player' : 'admin';
            return (
              <tr key={u.id}>
                <td>{u.username}{me && ' (you)'}</td>
                <td><span className="role-badge" data-role={u.role}>{u.role}</span></td>
                <td>{when(u.created_at)}</td><td>{u.games}</td><td>{u.kills}</td><td>{u.puzzles_solved}</td>
                <td className="admin-actions">
                  <button className="toggle" disabled={!u.games} onClick={() => act(api.resetScores(u.id), `Scores reset for ${u.username}.`)}>Reset scores</button>
                  {/* The server refuses self-demotion too; disabling it here just avoids the error. */}
                  <button className="toggle" disabled={me} onClick={() => act(api.setRole(u.id, next), `${u.username} is now ${next}.`)}>
                    {next === 'admin' ? 'Promote' : 'Demote'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="setting-note" role="status">{msg}</p>
      </>}
    </Panel>
  );
}
