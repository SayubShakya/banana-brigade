// Leaderboards: today's leaders next to the all-time leaders, one tab per mode.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Panel, Rank, SkeletonRows } from '../components/common.jsx';

const TABS = [['quick', 'Quick Play'], ['survival', 'Survival'], ['team', 'Team Battle'], ['online', 'Online']];

function Board({ title, rows, mode, me }) {
  const main = mode === 'survival' ? 'Wave' : 'Kills';
  return (
    <section>
      <h3 className="sub-head">{title}</h3>
      <table className="results compact leaderboard">
        <thead><tr><th>#</th><th>Soldier</th><th>{main}</th><th>Puzzles</th></tr></thead>
        <tbody>
          {rows === null && <SkeletonRows cols={4} />}
          {rows === false && <tr className="empty-row"><td colSpan={4}>Could not load the leaderboard. Try again in a moment.</td></tr>}
          {rows?.length === 0 && <tr className="empty-row"><td colSpan={4}>No scores yet.</td></tr>}
          {rows?.map((r, i) => (
            <tr key={r.id} className={r.username === me ? 'me' : ''}>
              <td><Rank n={i + 1} /></td><td>{r.username}</td><td>{mode === 'survival' ? r.wave : r.kills}</td><td>{r.puzzles_solved} / {r.puzzles_attempted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function Scores({ me, onBack }) {
  const [mode, setMode] = useState('quick');
  const [today, setToday] = useState(null);
  const [all, setAll] = useState(null);
  useEffect(() => {
    let alive = true;
    setToday(null);
    setAll(null);
    Promise.all([api.leaderboard(mode, 'today'), api.leaderboard(mode, 'all')])
      .then(([t, a]) => { if (alive) { setToday(t.rows); setAll(a.rows); } })
      .catch(() => { if (alive) { setToday(false); setAll(false); } });   // false = failed (the toast says why)
    return () => { alive = false; };
  }, [mode]);

  return (
    <Panel wide title="Scores" subtitle="Top soldiers per mode. Survival ranks by wave, the others by kills."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={mode === key} onClick={() => setMode(key)}>{label}</button>)}
      </div>
      <div className="boards">
        <Board title="Today's leaders" rows={today} mode={mode} me={me} />
        <Board title="All-time leaders" rows={all} mode={mode} me={me} />
      </div>
    </Panel>
  );
}
