// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { Panel, Skeleton, SkeletonRows } from '../../components/common.jsx';
import LiveEvents from './LiveEvents.jsx';

const TABS = [['players', 'Players'], ['audit', 'Audit log'], ['health', 'API health'], ['events', 'Live events']];
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const stamp = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Players({ account }) {
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState('');
  const [asking, setAsking] = useState(null);
  const [reason, setReason] = useState('');

  const load = () => api.adminUsers().then(({ users: list }) => setUsers(list)).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const ask = (id, label, run, done) => { setAsking({ id, label, run, done }); setReason(''); setMsg(''); };
  async function confirm(e) {
    e.preventDefault();
    try { await asking.run(reason.trim()); setMsg(asking.done); setAsking(null); load(); } catch (err) { setMsg(err.message); }
  }

  return (
    <>
      <p className="setting-note admin-msg" role="status">{msg || (asking ? '' : 'Every action asks for a reason, which is saved in the audit log.')}</p>
      {asking && (
        <form className="reason-form" onSubmit={confirm}>
          <label className="field">{asking.label}: why? (saved in the audit log)
            <input autoFocus maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 99 kills in 30 seconds" />
          </label>
          <button className="mbtn primary" type="submit" disabled={reason.trim().length < 3}>Confirm</button>
          <button className="mbtn ghost" type="button" onClick={() => setAsking(null)}>Cancel</button>
        </form>
      )}
      <table className="results compact admin-table">
        <thead><tr><th>Player</th><th>Role</th><th>Joined</th><th>Games</th><th>Kills</th><th>Puzzles</th><th>Actions</th></tr></thead>
        <tbody>
          {!users && <SkeletonRows cols={7} />}
          {users?.map((u) => {
            const me = u.id === account.id;
            const next = u.role === 'admin' ? 'player' : 'admin';
            return (
              <tr key={u.id} data-suspended={!!u.suspended} data-asking={asking?.id === u.id}>
                <td>{u.username}{me && ' (you)'}{u.suspended && <small className="suspended-note">Suspended: {u.suspended.reason}</small>}</td>
                <td><span className="role-badge" data-role={u.guest ? 'guest' : u.role}>{u.guest ? 'guest' : u.role}</span></td>
                <td>{when(u.created_at)}</td><td>{u.games}</td><td>{u.kills}</td><td>{u.puzzles_solved}</td>
                <td className="admin-actions">
                  <button className="toggle" disabled={!u.games} title={u.games ? '' : 'No games to reset'} onClick={() => ask(u.id, `Reset ${u.username}'s scores`, (r) => api.resetScores(u.id, r), `Scores reset for ${u.username}.`)}>Reset scores</button>
                  <button className="toggle" disabled={me || u.guest} title={me ? 'You cannot demote yourself' : u.guest ? 'Guests must save their account first' : ''} onClick={() => ask(u.id, `${next === 'admin' ? 'Promote' : 'Demote'} ${u.username}`, (r) => api.setRole(u.id, next, r), `${u.username} is now ${next}.`)}>
                    {next === 'admin' ? 'Promote' : 'Demote'}
                  </button>
                  {u.suspended
                    ? <button className="toggle" onClick={() => ask(u.id, `Restore ${u.username}`, (r) => api.restore(u.id, r), `${u.username} can log in again.`)}>Restore</button>
                    : <button className="toggle danger" disabled={me || u.role === 'admin'} title={me ? 'You cannot suspend yourself' : u.role === 'admin' ? 'Demote an admin before suspending them' : ''} onClick={() => ask(u.id, `Suspend ${u.username}`, (r) => api.suspend(u.id, r), `${u.username} is suspended and was signed out.`)}>Suspend</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function Audit() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.audit().then((d) => setRows(d.rows)).catch((e) => setError(e.message)); }, []);
  return (
    <table className="results compact admin-table">
      <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Player</th><th>Reason</th></tr></thead>
      <tbody>
        {!rows && !error && <SkeletonRows cols={5} />}
        {error && <tr className="empty-row"><td colSpan={5}>{error}</td></tr>}
        {rows?.length === 0 && <tr className="empty-row"><td colSpan={5}>No admin actions yet.</td></tr>}
        {rows?.map((r) => (
          <tr key={r.id}><td>{stamp(r.at)}</td><td>{r.actor}</td><td>{r.detail ?? r.action}</td><td>{r.target ?? '—'}</td><td>{r.reason}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Sparkline({ values, max, label, unit }) {
  const pts = values.map((v, i) => [values.length < 2 ? 0 : (i / (values.length - 1)) * 100, v == null ? null : 30 - (Math.min(v, max) / max) * 28]);
  const line = pts.filter(([, y]) => y != null).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = [...values].reverse().find((v) => v != null);
  return (
    <figure className="spark">
      <figcaption>{label}<b>{last == null ? '—' : `${last}${unit}`}</b></figcaption>
      {line.includes(' ')
        ? (
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={`${label} over the last hour`}>
            <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          </svg>
        )
        : <p className="spark-wait">Collecting: the chart appears after two samples (a sample is taken every 30 s).</p>}
    </figure>
  );
}

function Health() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => api.health().then(setData).catch((e) => setError(e.message));
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, []);
  if (error) return <p className="auth-error">{error}</p>;
  if (!data) return <Skeleton rows={3} height="8cqh" />;
  const { now, history } = data;
  return (
    <div className="health">
      <div className="health-chips">
        <span className="chip">Banana API <b>{now.online === false ? 'offline' : now.online ? 'online' : 'unknown'}</b></span>
        <span className="chip" data-circuit={now.circuit.state}>Circuit breaker <b>{now.circuit.state}</b></span>
        <span className="chip">Ready <b>{now.ready}</b> · reserve <b>{now.reserve}</b></span>
        <span className="chip">Retries <b>{now.retriesUsed}</b></span>
      </div>
      <Sparkline label="Median latency" unit=" ms" max={Math.max(500, ...history.map((h) => h.p50LatencyMs ?? 0)) * 1.25} values={history.map((h) => h.p50LatencyMs)} />
      <Sparkline label="Success rate" unit="%" max={110} values={history.map((h) => h.successRate)} />
      <p className="setting-note">{history.length} samples, one every 30 s (the last hour). Refreshes every 10 s.</p>
    </div>
  );
}

export default function Admin({ account, onBack }) {
  const [tab, setTab] = useState('players');
  return (
    <Panel wide title="Admin" subtitle="The server checks the role on every request; hiding this screen is not what protects it."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {tab === 'players' && <Players account={account} />}
      {tab === 'audit' && <Audit />}
      {tab === 'health' && <Health />}
      <div hidden={tab !== 'events'}><LiveEvents /></div>
    </Panel>
  );
}
