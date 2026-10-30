// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { getSocket, request } from '../net/socket.js';
import { Panel, Icon } from '../components/common.jsx';
import { DIFFICULTY, MATCH_LENGTHS } from '../game/config.js';
import { LengthPicker, savedLength } from './Difficulty.jsx';
import { emit } from '../services/eventBus.js';

const botLevel = (key) => DIFFICULTY[key]?.name ?? 'Medium';
const lengthText = (r) => `${MATCH_LENGTHS.find((l) => l.seconds === r.matchLength)?.label ?? '5 min'} · first to ${r.killLimit ?? 20}`;

export default function Lobby({ account, parts, onBack }) {
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null);
  const [code, setCode] = useState('');
  const [teamMode, setTeamMode] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [difficulty, setDifficulty] = useState('medium');
  const [matchLength, setMatchLength] = useState(savedLength);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => request('rooms:list').then((r) => setRooms(r.rooms)).catch(() => {});
    const onUpdate = (r) => setRoom(r.players.some((p) => p.userId === account.id) ? r : null);
    const onConnect = () => { setOnline(true); refresh(); };
    const onDrop = (reason) => { setOnline(false); if (reason === 'io server disconnect') setRoom(null); };
    const onError = (err) => { setOnline(false); setError(err.message); };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDrop);
    socket.on('connect_error', onError);
    socket.on('rooms:changed', refresh);
    socket.on('room:update', onUpdate);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDrop);
      socket.off('connect_error', onError);
      socket.off('rooms:changed', refresh);
      socket.off('room:update', onUpdate);
    };
  }, [account.id]);

  const run = async (fn) => {
    setError('');
    try { await fn(); } catch (err) { setError(err.message); }
  };
  const create = () => run(async () => setRoom((await request('room:create', { teamMode, isPublic, difficulty, matchLength, parts })).room));
  const join = (c) => run(async () => setRoom((await request('room:join', { code: c, parts })).room));
  const start = () => run(() => request('room:start'));
  const leave = () => { getSocket().emit('room:leave'); setRoom(null); };
  const mine = room?.players.find((p) => p.userId === account.id);
  const isHost = room?.host === account.id;
  const allReady = room?.players.every((p) => p.ready);

  return (
    <Panel wide title="Online" subtitle="Real players over WebSockets. The server runs the match, so nobody can fake a score."
      chip={<span className="mode-chip" data-state={online ? 'online' : 'offline'}>{online ? 'Connected' : 'Connecting…'}</span>}
      footer={<>
        <button className="mbtn primary" onClick={onBack}>{room ? 'Leave room and go back' : 'Back'}</button>
      </>}>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {!room ? (
        <div className="lobby-grid">
          <section className="lobby-box">
            <h3 className="sub-head">Create a room</h3>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={!teamMode} onClick={() => setTeamMode(false)}>Free-for-all</button>
              <button role="tab" aria-selected={teamMode} onClick={() => setTeamMode(true)}>Blue vs Red</button>
            </div>
            <div className="tabs" role="tablist" aria-label="Bot difficulty">
              {Object.entries(DIFFICULTY).map(([key, d]) => (
                <button key={key} role="tab" aria-selected={difficulty === key} onClick={() => setDifficulty(key)}>{d.name} bots</button>
              ))}
            </div>
            <LengthPicker mode="online" value={matchLength} onChange={(s) => { setMatchLength(s); emit('settings:set', { key: 'matchLength', value: s }); }} />
            <div className="setting"><span>Show in public list</span><button className="toggle" aria-pressed={isPublic} onClick={() => setIsPublic(!isPublic)}>{isPublic ? 'On' : 'Off'}</button></div>
            <button className="mbtn primary" onClick={create} disabled={!online}><Icon id="team" />Create room</button>
            <h3 className="sub-head">Join with a code</h3>
            <form className="code-row" onSubmit={(e) => { e.preventDefault(); join(code); }}>
              <input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="ABCDEF" aria-label="Room code" maxLength={6} />
              <button className="mbtn" type="submit" disabled={!online || code.length !== 6}>Join</button>
            </form>
          </section>
          <section className="lobby-box">
            <h3 className="sub-head">Public rooms</h3>
            <table className="results compact">
              <thead><tr><th>Host</th><th>Mode</th><th>Length</th><th>Bots</th><th>Players</th><th /></tr></thead>
              <tbody>
                {!rooms.length && <tr className="empty-row"><td colSpan={6}>No open rooms. Create one and share the code.</td></tr>}
                {rooms.map((r) => (
                  <tr key={r.code}>
                    <td>{r.host}</td><td>{r.teamMode ? 'Blue vs Red' : 'Free-for-all'}</td><td>{lengthText(r)}</td><td>{botLevel(r.difficulty)}</td><td>{r.players} / 6</td>
                    <td>{r.state === 'lobby' ? <button className="toggle" onClick={() => join(r.code)}>Join</button> : 'Playing'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : (
        <div className="room-view">
          <div className="room-code">Room code <b>{room.code}</b><small>{room.teamMode ? 'Blue vs Red' : 'Free-for-all'} · {lengthText(room)} kills · {botLevel(room.difficulty)} bots fill empty places up to 6</small></div>
          <table className="results compact">
            <thead><tr><th>Soldier</th>{room.teamMode && <th>Team</th>}<th>Status</th></tr></thead>
            <tbody>
              {room.players.map((p) => (
                <tr key={p.userId} className={p.userId === account.id ? 'me' : ''}>
                  <td>{p.username}{p.userId === room.host && <span className="role-badge">host</span>}</td>
                  {room.teamMode && <td className={`team-${p.team}`}>{p.team}</td>}
                  <td>{!p.connected ? 'Left' : room.state === 'playing' ? 'In battle' : p.ready ? <span className="win">Ready</span> : 'Not ready'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {room.state === 'lobby' && (
            <div className="room-actions">
              <button className="mbtn ghost" onClick={leave}>Leave room</button>
              {isHost
                ? <button className="mbtn primary" onClick={start} disabled={!allReady}>Start match</button>
                : <button className="mbtn primary" onClick={() => getSocket().emit('room:ready', { ready: !mine?.ready })}>{mine?.ready ? 'Not ready' : 'Ready'}</button>}
            </div>
          )}
          {room.state === 'lobby' && isHost && !allReady && <p className="status-line">Waiting for every player to press Ready. Share the code <b>{room.code}</b> to invite friends.</p>}
        </div>
      )}
    </Panel>
  );
}
