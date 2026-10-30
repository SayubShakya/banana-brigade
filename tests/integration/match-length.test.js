// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { startServer, client } = require('./helpers');

const once = (socket, event, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
  socket.once(event, (data) => { clearTimeout(t); resolve(data); });
});
const call = (socket, event, data) => new Promise((resolve) => (data === undefined ? socket.emit(event, resolve) : socket.emit(event, data, resolve)));

async function player(s, username) {
  const c = client(s.base);
  await c.post('/api/auth/register', { username, password: 'bananas123' });
  const socket = io(s.base, { transports: ['websocket'], extraHeaders: { Cookie: c.cookie }, forceNew: true });
  await once(socket, 'connect');
  return { socket, c };
}

test('the host picks the match length; the server only accepts the listed lengths and runs the match with them', async () => {
  const s = await startServer();
  const a = await player(s, 'timehost');
  const b = await player(s, 'timelook');
  try {
    for (const bad of [45, '30', -30, 0, { $gt: 1 }, 99999]) {
      assert.equal((await call(a.socket, 'room:create', { matchLength: bad })).error, 'Unknown match length');
    }
    for (const bad of ['moon', 5, { $ne: 1 }]) {
      assert.equal((await call(a.socket, 'room:create', { map: bad })).error, 'Unknown map');
    }
    const snowy = (await call(a.socket, 'room:create', { map: 'snow' })).room;
    assert.equal(snowy.map, 'snow');
    const plain = (await call(a.socket, 'room:create', {})).room;
    assert.equal(plain.matchLength, 300);
    assert.equal(plain.map, 'random');
    assert.equal(plain.killLimit, 20);

    const { room } = await call(a.socket, 'room:create', { matchLength: 30 });
    assert.equal(room.matchLength, 30);
    assert.equal(room.killLimit, 4);
    const listed = (await call(b.socket, 'rooms:list')).rooms.find((r) => r.code === room.code);
    assert.equal(listed.matchLength, 30);
    assert.equal(listed.killLimit, 4);

    const started = once(a.socket, 'match:start');
    assert.deepEqual(await call(a.socket, 'room:start'), { ok: true });
    const start = await started;
    assert.equal(start.timeLimit, 30);
    assert.equal(start.killLimit, 4);
    const match = s.realtime.rooms.room(room.code).match;
    assert.equal(match.world.cfg.killLimit, 4);
    assert.ok(match.world.timeLeft <= 30);
    const snap = await once(a.socket, 'match:snapshot');
    assert.ok(snap.timeLeft <= 30 && snap.timeLeft > 25);
    s.realtime.rooms.endMatch(room.code);
  } finally { a.socket.close(); b.socket.close(); await s.close(); }
});
