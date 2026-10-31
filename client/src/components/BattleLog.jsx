// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api.js';
import { Icon, Rank, Skeleton } from './common.jsx';
import { ICONS, clock, mapLabel, modeName, rankRoster, sentence, winnerLabel } from '../services/history.js';
import '../styles/history.css';

export default function BattleLog({ match }) {
  const roster = rankRoster(match?.roster ?? []);
  const log = match?.log ?? [];
  const team = match?.teamMode || roster.some((r) => r.team);
  return (
    <div className="battle-log">
      <dl className="bl-meta">
        <div><dt>Mode</dt><dd>{modeName(match?.mode)}{match?.multiplayer && match.mode !== 'online' ? ' · online' : ''}{match?.difficulty && match.mode !== 'online' && <small className={`level-tag ${match.difficulty}`}>{match.difficulty}</small>}</dd></div>
        <div><dt>Map</dt><dd>{mapLabel(match?.map)}</dd></div>
        <div><dt>Length</dt><dd>{clock(match?.durationS)}</dd></div>
        <div><dt>Result</dt><dd className={match?.teamMode && match.winner ? `team-${match.winner}` : ''}>{winnerLabel(match)}</dd></div>
      </dl>

      <h3 className="sub-head">Final scoreboard</h3>
      <div className="bl-scroll-x">
        <table className="results compact bl-board">
          <thead><tr><th>#</th><th>Soldier</th>{team && <th>Team</th>}<th>Kills</th><th>Deaths</th></tr></thead>
          <tbody>
            {!roster.length && <tr className="empty-row"><td colSpan={team ? 5 : 4}>No scoreboard was saved for this battle.</td></tr>}
            {roster.map((r) => (
              <tr key={`${r.name}-${r.rank}`} className={r.me ? 'me' : ''} aria-current={r.me ? 'true' : undefined}>
                <td><Rank n={r.rank} /></td>
                <td>{r.name}{r.me && <small className="bl-tag you">you</small>}{r.bot && <small className="bl-tag">bot</small>}</td>
                {team && <td>{r.team ? <span className={`team-dot ${r.team}`}>{r.team === 'blue' ? 'Blue' : 'Red'}</span> : '—'}</td>}
                <td>{r.kills ?? 0}</td><td>{r.deaths ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="sub-head">Timeline {log.length > 0 && `· ${log.length} events`}</h3>
      {log.length === 0
        ? <p className="bl-empty">No events were recorded for this battle.</p>
        : (
          <ol className="bl-timeline" tabIndex={0} aria-label="Battle timeline">
            {log.map((e, i) => (
              <li key={i} data-type={e.type} className={e.type === 'puzzle' && !e.ok ? 'miss' : ''}>
                <time>{clock(e.t)}</time>
                <Icon id={ICONS[e.type] ?? 'target'} className="ico bl-ico" />
                <span>{sentence(e)}</span>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

export function BattleLogDialog({ matchId, onClose }) {
  const [match, setMatch] = useState(null);
  const [error, setError] = useState('');
  const box = useRef(null);
  const closeBtn = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    let alive = true;
    setMatch(null);
    setError('');
    api.match(matchId).then((d) => alive && setMatch(d.match))
      .catch((e) => alive && setError(e.status === 404 ? 'This battle log is not available any more.' : 'Could not load the battle log. Try again in a moment.'));
    return () => { alive = false; };
  }, [matchId]);
  useEffect(() => {
    const before = document.activeElement;
    closeBtn.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); before?.focus?.(); };
  }, []);
  return createPortal(
    <div className="bl-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bl-dialog" role="dialog" aria-modal="true" aria-labelledby="bl-title" ref={box}>
        <header className="bl-head">
          <h2 id="bl-title">Battle log</h2>
          <button className="mbtn ghost bl-x" onClick={onClose} aria-label="Close battle log">✕</button>
        </header>
        <div className="bl-body">
          {error && <p className="bl-empty" role="alert">{error}</p>}
          {!match && !error && <Skeleton rows={5} />}
          {match && <BattleLog match={match} />}
        </div>
        <footer className="bl-foot"><button ref={closeBtn} className="mbtn primary" onClick={onClose}>Close</button></footer>
      </div>
    </div>,
    document.getElementById('ui') ?? document.body,
  );
}
