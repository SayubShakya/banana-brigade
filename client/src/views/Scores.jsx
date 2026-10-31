// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Panel, Rank, SkeletonRows } from '../components/common.jsx';
import { boardStat, pinnedMe } from '../services/history.js';
import '../styles/history.css';

const TABS = [['quick', 'Quick Play'], ['survival', 'Survival'], ['team', 'Team Battle'], ['online', 'Online'], ['campaign', 'Campaign']];
const VIEWS = [['best', 'Best game'], ['career', 'Career']];
const COLS = 6;

function Row({ r, mode, by, mine, pinned }) {
  return (
    <tr className={`${mine ? 'me' : ''}${pinned ? ' pinned' : ''}`} aria-current={mine ? 'true' : undefined}>
      <td>{r.rank ? <Rank n={r.rank} /> : '—'}</td>
      <td>{r.username}{pinned && <small className="bl-tag you">your rank</small>}</td>
      <td>{boardStat(r, mode, by)}</td><td>{r.wins ?? 0}</td><td>{r.games ?? 0}</td><td>{r.puzzles_solved ?? 0} / {r.puzzles_attempted ?? 0}</td>
    </tr>
  );
}

function Board({ title, data, mode, by, me }) {
  const rows = data?.rows;
  const pin = data ? pinnedMe(data, me) : null;
  const main = by === 'career' ? 'Kills' : mode === 'survival' ? 'Wave' : 'Kills';
  return (
    <section>
      <h3 className="sub-head">{title}</h3>
      <div className="bl-scroll-x">
        <table className="results compact leaderboard">
          <thead><tr><th>#</th><th>Soldier</th><th>{by === 'career' ? `Total ${main.toLowerCase()}` : `Best ${main.toLowerCase()}`}</th><th>Wins</th><th>Games</th><th>Puzzles</th></tr></thead>
          <tbody>
            {data === null && <SkeletonRows cols={COLS} />}
            {data === false && <tr className="empty-row"><td colSpan={COLS}>Could not load the leaderboard. Try again in a moment.</td></tr>}
            {rows?.length === 0 && <tr className="empty-row"><td colSpan={COLS}>No scores yet.</td></tr>}
            {rows?.map((r, i) => <Row key={r.username ?? i} r={{ ...r, rank: r.rank ?? i + 1 }} mode={mode} by={by} mine={r.username === me} />)}
          </tbody>
          {pin && <tfoot><Row r={pin} mode={mode} by={by} mine pinned /></tfoot>}
        </table>
      </div>
    </section>
  );
}

export default function Scores({ me, onBack }) {
  const [mode, setMode] = useState('quick');
  const [by, setBy] = useState('best');
  const [today, setToday] = useState(null);
  const [all, setAll] = useState(null);
  useEffect(() => {
    let alive = true;
    setToday(null);
    setAll(null);
    Promise.all([api.leaderboard(mode, 'today', by), api.leaderboard(mode, 'all', by)])
      .then(([t, a]) => { if (alive) { setToday(t); setAll(a); } })
      .catch(() => { if (alive) { setToday(false); setAll(false); } });
    return () => { alive = false; };
  }, [mode, by]);

  return (
    <Panel wide title="Scores" subtitle={by === 'career'
      ? 'Career totals per soldier, ranked by wins and then kills.'
      : 'Each soldier\'s best game. Survival ranks by wave, the others by kills.'}
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="scores-bar">
        <div className="tabs" role="tablist" aria-label="Mode">
          {TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={mode === key} onClick={() => setMode(key)}>{label}</button>)}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Rank by">
          {VIEWS.map(([key, label]) => <button key={key} role="radio" aria-checked={by === key} onClick={() => setBy(key)}>{label}</button>)}
        </div>
      </div>
      <div className="boards">
        <Board title="Today's leaders" data={today} mode={mode} by={by} me={me} />
        <Board title="All-time leaders" data={all} mode={mode} by={by} me={me} />
      </div>
    </Panel>
  );
}
