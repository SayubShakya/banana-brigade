// Admin: the server's events as they happen (logins, guests, puzzles, scores,
// achievements, online kills, admin actions). The server pushes each one over the
// WebSocket ("server:event"); this screen only listens. Pause stops adding new ones
// to the list without disconnecting.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef, useState } from 'react';
import { getSocket, request } from '../net/socket.js';

const KINDS = ['all', 'auth', 'security', 'puzzle', 'score', 'kill', 'achievement', 'campaign', 'daily', 'power', 'admin'];
const MAX = 200;
const time = (iso) => new Date(iso).toLocaleTimeString();

export default function LiveEvents() {
  const [events, setEvents] = useState([]);
  const [kind, setKind] = useState('all');
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('Connecting…');
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    const socket = getSocket();
    const onEvent = (e) => { if (!pausedRef.current) setEvents((list) => [e, ...list].slice(0, MAX)); };
    socket.on('server:event', onEvent);
    request('events:watch')
      .then(({ recent }) => { setEvents(recent.reverse()); setStatus('Live'); })
      .catch((err) => setStatus(err.message));
    return () => { socket.off('server:event', onEvent); socket.emit('events:stop'); };
  }, []);

  const shown = kind === 'all' ? events : events.filter((e) => e.kind === kind);
  return (
    <div className="live-events">
      <div className="live-bar">
        <span className="live-status" data-live={status === 'Live' && !paused}><i />{paused ? 'Paused' : status}</span>
        <label>Show <select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <button className="toggle" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
        <button className="toggle" onClick={() => setEvents([])}>Clear</button>
      </div>
      <ol className="event-list" aria-live="polite">
        {!shown.length && <li className="empty-row">No events yet. Log in from another browser or play a game to see them arrive.</li>}
        {shown.map((e) => (
          <li key={e.id} data-kind={e.kind}>
            <time>{time(e.at)}</time><span className="event-kind">{e.kind}</span><span><b>{e.user ?? 'a bot'}</b> {e.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
