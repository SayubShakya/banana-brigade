// Profile: rank, XP and the service record, all worked out from games saved on the
// server, so the record follows the account rather than the browser.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { rankFor, xpFor, MODE_NAMES } from '../rank.js';
import { Panel, AvatarCanvas, RankCard, Icon, Skeleton, SkeletonRows } from './common.jsx';

const playTime = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`);
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function Profile({ account, parts, onCustomise, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [badges, setBadges] = useState(null);
  const [identity, setIdentity] = useState(null);
  useEffect(() => {
    api.myRecord().then(setData).catch((e) => setError(e.message));
    api.sessions().then(setIdentity).catch(() => {});
    api.achievements().then(setBadges).catch(() => {});
  }, []);
  const have = new Map((badges?.mine ?? []).map((a) => [a.id, a.at]));

  const t = data?.totals;
  const items = t ? [
    ['Battles', t.games], ['Wins', t.wins], ['Kills', t.kills], ['Deaths', t.deaths],
    ['K/D ratio', (t.deaths ? t.kills / t.deaths : t.kills).toFixed(2)], ['Best kills', t.best_kills],
    ['Best wave', t.best_wave], ['Time played', playTime(t.seconds_played)],
    ['Puzzles solved', t.puzzles_solved], ['Puzzle accuracy', t.puzzles_attempted ? `${Math.round((t.puzzles_solved / t.puzzles_attempted) * 100)}%` : '—'],
  ] : [];

  return (
    <Panel wide title="Profile" subtitle="Your service record. Every number comes from games saved on the server."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="profile-layout">
        <div className="profile-card">
          <AvatarCanvas parts={parts} aria-label="Your soldier" />
          <b>{account.username}</b>
          <span className="role-badge" data-role={account.role}>{account.role}</span>
          {identity && (
            <dl className="identity">
              <div><dt>Member since</dt><dd>{when(identity.memberSince)}</dd></div>
              <div><dt>Last login</dt><dd>{identity.lastLogin ? when(identity.lastLogin) : '—'}</dd></div>
              <div><dt>Active sessions</dt><dd>{identity.count}</dd></div>
            </dl>
          )}
          <button className="mbtn" onClick={onCustomise}>Customise</button>
        </div>
        <div className="profile-main">
          <RankCard big rank={rankFor(t ? xpFor(t) : 0)} />
          <dl className="record">
            {error && <div><dt>Record</dt><dd>Offline</dd></div>}
            {!data && !error && <Skeleton rows={2} />}
            {data && items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <h3 className="sub-head">Achievements {badges && `· ${have.size} / ${badges.all.length}`}</h3>
          <div className="badges">
            {!badges && <Skeleton rows={1} />}
            {badges?.all.map((a) => (
              <div key={a.id} className={`badge-item${have.has(a.id) ? '' : ' locked'}`} title={`${a.text}${have.has(a.id) ? ` (unlocked ${when(have.get(a.id))})` : ''}`}>
                <Icon id="trophy" />{a.name}
              </div>
            ))}
          </div>
          <h3 className="sub-head">Recent battles</h3>
          <table className="results compact">
            <thead><tr><th>Mode</th><th>Kills</th><th>Deaths</th><th>Puzzles</th><th>Result</th><th>When</th></tr></thead>
            <tbody>
              {!data && !error && <SkeletonRows cols={6} />}
              {data && !data.recent.length && <tr className="empty-row"><td colSpan={6}>No battles yet. Deploy to start your record.</td></tr>}
              {data?.recent.slice(0, 4).map((r) => (
                <tr key={r.id}>
                  <td>{MODE_NAMES[r.mode] ?? r.mode}{r.mode !== 'online' && <small className={`level-tag ${r.difficulty}`}>{r.difficulty}</small>}</td><td>{r.kills}</td><td>{r.deaths}</td><td>{r.puzzles_solved} / {r.puzzles_attempted}</td>
                  <td>{r.mode === 'survival' ? `Wave ${r.wave}` : r.won ? <span className="win">Won</span> : 'Lost'}</td><td>{when(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
