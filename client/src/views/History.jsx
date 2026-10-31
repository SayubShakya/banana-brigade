// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Panel, SkeletonRows } from '../components/common.jsx';
import { BattleLogDialog } from '../components/BattleLog.jsx';
import { FILTERS, ago, clock, mapLabel, modeName, resultLabel } from '../services/history.js';
import '../styles/history.css';

const COLS = 8;
const EMPTY = { all: 'No battles yet. Deploy from the menu to start your record.', solo: 'No solo battles yet.', online: 'No online battles yet. Try Play Online with a friend.' };

export default function History({ account, onBack }) {
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState(null);
  const [next, setNext] = useState(null);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setNext(null);
    setError('');
    api.history(filter).then((d) => { if (alive) { setRows(d.rows ?? []); setNext(d.next ?? null); } })
      .catch((e) => { if (alive) { setRows([]); setError(e.offline ? 'Cannot reach the game server. Check your connection.' : 'Could not load your history. Try again in a moment.'); } });
    return () => { alive = false; };
  }, [filter]);

  const loadMore = () => {
    setMore(true);
    api.history(filter, next).then((d) => { setRows((r) => [...r, ...(d.rows ?? [])]); setNext(d.next ?? null); })
      .catch(() => setError('Could not load more battles. Try again.'))
      .finally(() => setMore(false));
  };

  return (
    <Panel wide title="Match history" subtitle={`Every battle you played, newest first.${account?.guest ? ' Save your account to keep it for good.' : ''}`}
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="tabs history-tabs" role="tablist" aria-label="Filter battles">
        {FILTERS.map(([key, label]) => <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      <div className="bl-scroll-x">
        <table className="results compact history-table">
          <thead><tr><th>Mode</th><th>Map</th><th>Result</th><th>K / D</th><th>Puzzles</th><th>Time</th><th>When</th><th><span className="sr-only">Battle log</span></th></tr></thead>
          <tbody aria-live="polite" aria-busy={rows === null}>
            {rows === null && <SkeletonRows cols={COLS} rows={5} />}
            {error && <tr className="empty-row error"><td colSpan={COLS}>{error}</td></tr>}
            {rows?.length === 0 && !error && <tr className="empty-row"><td colSpan={COLS}>{EMPTY[filter] ?? `No ${modeName(filter)} battles yet.`}</td></tr>}
            {rows?.map((r) => {
              const res = resultLabel(r);
              return (
                <tr key={r.id ?? r.matchId}>
                  <td data-label="Mode">{modeName(r.mode)}{r.multiplayer && r.mode !== 'online' && ' · online'}{r.difficulty && r.mode !== 'online' && <small className={`level-tag ${r.difficulty}`}>{r.difficulty}</small>}</td>
                  <td data-label="Map">{mapLabel(r.map)}</td>
                  <td data-label="Result"><span className={`res res-${res.kind}`}>{res.text}</span></td>
                  <td data-label="K / D">{r.kills} / {r.deaths}</td>
                  <td data-label="Puzzles">{r.puzzles_solved} / {r.puzzles_attempted}</td>
                  <td data-label="Time">{clock(r.duration_s)}</td>
                  <td data-label="When"><time dateTime={r.created_at} title={new Date(r.created_at).toLocaleString()}>{ago(r.created_at)}</time></td>
                  <td>{r.hasLog && r.matchId ? <button className="mbtn ghost small" onClick={() => setOpen(r.matchId)}>Battle log</button> : <span className="muted" title="No log was saved for this battle">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {next && rows?.length > 0 && (
        <button className="mbtn load-more" onClick={loadMore} disabled={more}>{more ? 'Loading…' : 'Load more'}</button>
      )}
      {open && <BattleLogDialog matchId={open} onClose={() => setOpen(null)} />}
    </Panel>
  );
}
