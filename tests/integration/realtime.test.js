// Tests for online play over Socket.io: only logged-in players can connect, rooms
// work by code, the server runs the match and writes the scores itself.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { startServer, client } = require('./helpers');

const once = (socket, event, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
  socket.once(event, (data) => { clearTimeout(t); resolve(data); });
});
const call = (socket, event, data) => new Promise((resolve) => (data === undefined ? socket.emit(event, resolve) : socket.emit(event, data, resolve)));

// Registers a player over HTTP, then opens a WebSocket that carries the session cookie.
async function player(s, username) {
  const c = client(s.base);
  await c.post('/api/auth/register', { username, password: 'bananas123' });
  const socket = io(s.base, { transports: ['websocket'], extraHeaders: { Cookie: c.cookie }, forceNew: true });
  await once(socket, 'connect');
  const me = (await c.get('/api/auth/me')).body.user;
  return { socket, c, me };
}

test('a WebSocket without a login session is refused', async () => {
  const s = await startServer();
  const socket = io(s.base, { transports: ['websocket'], forceNew: true });
  try {
    const err = await once(socket, 'connect_error');
    assert.match(err.message, /Log in/);
  } finally { socket.close(); await s.close(); }
});

test('players meet in a room by code; only the host can start', async () => {
  const s = await startServer();
  const a = await player(s, 'hostie');
  const b = await player(s, 'guesty');
  try {
    const { room } = await call(a.socket, 'room:create', { teamMode: true, isPublic: true });
    assert.match(room.code, /^[A-Z]{6}$/);
    assert.equal((await call(b.socket, 'rooms:list')).rooms[0].code, room.code);
    assert.equal((await call(b.socket, 'room:join', { code: 'NOPE00' })).error, 'No room with that code');
    const joined = await call(b.socket, 'room:join', { code: room.code.toLowerCase() });
    assert.equal(joined.room.players.length, 2);
    assert.deepEqual(joined.room.players.map((p) => p.team).sort(), ['blue', 'red']);
    assert.equal((await call(b.socket, 'room:start')).error, 'Only the host can start');
    assert.equal((await call(a.socket, 'room:start')).error, 'Everyone must be ready');
  } finally { a.socket.close(); b.socket.close(); await s.close(); }
});

test('the server runs the match, ignores faked scores and saves the results itself', async () => {
  const s = await startServer();
  const a = await player(s, 'alpha');
  const b = await player(s, 'bravo');
  try {
    const { room } = await call(a.socket, 'room:create', { teamMode: false });
    await call(b.socket, 'room:join', { code: room.code });
    b.socket.emit('room:ready', { ready: true });
    await once(a.socket, 'room:update');
    const started = once(a.socket, 'match:start');
    assert.deepEqual(await call(a.socket, 'room:start'), { ok: true });
    const start = await started;
    assert.equal(start.me, `u${a.me.id}`);
    assert.equal(start.roster.length, 6);                    // 2 players + 4 bots
    assert.ok(['jungle', 'desert', 'snow', 'night'].includes(start.map), 'the server names the map');
    assert.equal(start.roster.filter((r) => r.human).length, 2);

    const snap = await once(b.socket, 'match:snapshot');
    assert.ok(snap.soldiers.some((x) => x.id === `u${b.me.id}`));
    assert.equal('solution' in snap, false);

    // A cheating browser: invented messages and impossible controls change nothing.
    b.socket.emit('score', { kills: 999 });
    b.socket.emit('match:end', { winner: 'bravo' });
    b.socket.emit('input', { fire: true, aimX: 'x', kills: 999 });
    assert.equal((await call(b.socket, 'puzzle:get', { purpose: 'respawn' })).error, 'No puzzle needed right now');
    assert.match((await call(b.socket, 'puzzle:answer', { puzzleId: 'made-up', answer: 7 })).error, /not yours/);

    const ended = once(a.socket, 'match:end');
    s.realtime.rooms.endMatch(room.code);
    const summary = await ended;
    assert.equal(summary.ranking.length, 6);
    await new Promise((r) => setTimeout(r, 200));            // scores are written after match:end

    const board = await a.c.get('/api/scores/leaderboard?mode=online');
    assert.equal(board.body.rows.length, 2);
    assert.ok(board.body.rows.every((r) => r.multiplayer === true && r.kills < 999));
  } finally { a.socket.close(); b.socket.close(); await s.close(); }
});

test('the host picks the bot difficulty; the server checks it and passes it to the match', async () => {
  const s = await startServer();
  const a = await player(s, 'hardhost');
  const b = await player(s, 'looker');
  try {
    assert.equal((await call(a.socket, 'room:create', { difficulty: 'insane' })).error, 'Unknown difficulty');
    assert.equal((await call(a.socket, 'room:create', { difficulty: { $ne: 1 } })).error, 'Unknown difficulty');
    assert.equal((await call(a.socket, 'room:create', {})).room.difficulty, 'medium');   // default

    const { room } = await call(a.socket, 'room:create', { difficulty: 'hard' });
    assert.equal(room.difficulty, 'hard');
    assert.equal((await call(b.socket, 'rooms:list')).rooms.find((r) => r.code === room.code).difficulty, 'hard');

    assert.deepEqual(await call(a.socket, 'room:start'), { ok: true });
    assert.equal(s.realtime.rooms.room(room.code).match.botLevel, 'Hard');
    s.realtime.rooms.endMatch(room.code);
  } finally { a.socket.close(); b.socket.close(); await s.close(); }
});

test('banana crates online: the room difficulty time, a server time limit, and one respawn try per death', async () => {
  const s = await startServer({ matchOptions: { crateTimings: { extraMs: -11800 } } });   // hard: 12 s - 11.8 s = a 0.2 s limit
  const a = await player(s, 'crater');
  try {
    const { room } = await call(a.socket, 'room:create', { difficulty: 'hard' });
    const started = once(a.socket, 'match:start');
    await call(a.socket, 'room:start');
    assert.equal((await started).difficulty, 'hard');
    const match = s.realtime.rooms.room(room.code).match;
    const me = match.world.soldiers.find((x) => x.id === `u${a.me.id}`);

    // Pressing E at a crate: the offer carries the hard crate time; nobody answers, so the server closes it.
    const offered = once(a.socket, 'puzzle:offer');
    match.world.emit('banana:crate', { soldier: me, pickup: match.world.pickups.find((p) => p.kind === 'banana') });
    assert.deepEqual(await offered, { purpose: 'crate', seconds: 12 });
    assert.equal(me.busy, true);
    assert.deepEqual(await once(a.socket, 'puzzle:closed'), { purpose: 'crate', reason: 'time' });
    assert.equal(me.busy, false);
    assert.ok(me.shieldTimer > 1.5);

    // Down: one respawn puzzle, then no more until the next death.
    me.alive = false;
    me.respawnTimer = 99;
    const first = await call(a.socket, 'puzzle:get', { purpose: 'respawn' });
    assert.ok(first.puzzleId);
    assert.equal((await call(a.socket, 'puzzle:get', { purpose: 'respawn' })).error, 'No puzzle needed right now');
    assert.equal((await call(a.socket, 'puzzle:answer', { puzzleId: first.puzzleId, answer: 3 })).correct, false);
    assert.equal(me.alive, false);
    assert.equal((await call(a.socket, 'puzzle:get', { purpose: 'respawn' })).error, 'No puzzle needed right now');
    s.realtime.rooms.endMatch(room.code);
  } finally { a.socket.close(); await s.close(); }
});
