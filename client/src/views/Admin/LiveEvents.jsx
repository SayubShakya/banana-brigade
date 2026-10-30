// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef, useState } from 'react';
import { getSocket, request } from '../../net/socket.js';

const KINDS = ['all', 'auth', 'security', 'puzzle', 'score', 'kill', 'achievement', 'campaign', 'daily', 'power', 'admin'];
const MAX = 200;
const time = (iso) => new Date(iso).toLocaleTimeString();

export default function LiveEvents() {
  const [events, setEvents] = useState([]);
  const [kind, setKind] = useState('all');
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('Connecting…');
  const [held, setHeld] = useState([]);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    const socket = getSocket();
    const onEvent = (e) => {
      if (pausedRef.current) setHeld((list) => [e, ...list].slice(0, MAX));
      else setEvents((list) => [e, ...list].slice(0, MAX));
    };
    const watch = () => request('events:watch')
      .then(({ recent }) => { setEvents((list) => (list.length ? list : recent.reverse())); setStatus('Live'); })
      .catch((err) => setStatus(err.message));
    const onDrop = () => setStatus('Disconnected');
    socket.on('server:event', onEvent);
    socket.on('connect', watch);
    socket.on('disconnect', onDrop);
    watch();
    return () => {
      socket.off('server:event', onEvent); socket.off('connect', watch); socket.off('disconnect', onDrop);
      socket.emit('events:stop');
    };
  }, []);

  function togglePause() {
    if (paused) { setEvents((list) => [...held, ...list].slice(0, MAX)); setHeld([]); }
    setPaused(!paused);
  }

  const shown = kind === 'all' ? events : events.filter((e) => e.kind === kind);
  return (
    <div className="live-events">
      <div className="live-bar">
        <span className="live-status" data-live={status === 'Live' && !paused}><i />{paused ? 'Paused' : status}</span>
        <label>Show <select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <button className="toggle" aria-pressed={paused} onClick={togglePause}>{paused ? `Resume${held.length ? ` (${held.length} new)` : ''}` : 'Pause'}</button>
        <button className="toggle" onClick={() => { setEvents([]); setHeld([]); }}>Clear</button>
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
