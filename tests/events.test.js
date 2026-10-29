// Tests for the live event feed (server/eventLog.js): events are recorded as they
// happen and pushed over Socket.io to admins who are watching; players cannot watch.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { createEventLog } = require('../server/eventLog');
const { startServer, client } = require('./helpers');

const once = (socket, event, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
  socket.once(event, (data) => { clearTimeout(t); resolve(data); });
});
const call = (socket, event) => new Promise((resolve) => socket.emit(event, resolve));

async function connect(s, username, admin = false) {
  const c = client(s.base);
  const { user } = (await c.post('/api/auth/register', { username, password: 'bananas123' })).body;
  if (admin) await s.db.setRole(user.id, 'admin');
  const socket = io(s.base, { transports: ['websocket'], extraHeaders: { Cookie: c.cookie }, forceNew: true });
  await once(socket, 'connect');
  return { socket, c };
}

test('the log keeps the last events and tells listeners', () => {
  const log = createEventLog({ size: 3 });
  const heard = [];
  const stop = log.onEvent((e) => heard.push(e.text));
  for (let i = 1; i <= 5; i++) log.record('auth', 'sayub', `event ${i}`);
  stop();
  log.record('auth', 'sayub', 'event 6');
  assert.deepEqual(log.recent().map((e) => e.text), ['event 4', 'event 5', 'event 6']);
  assert.equal(heard.length, 5);
});

test('an admin watching gets recent events and new ones live; a player is refused', async () => {
  const s = await startServer();
  const admin = await connect(s, 'boss', true);
  const player = await connect(s, 'grunt');
  try {
    const refused = await call(player.socket, 'events:watch');
    assert.equal(refused.error, 'Admins only');

    const watching = await call(admin.socket, 'events:watch');
    assert.ok(watching.ok);
    assert.ok(watching.recent.some((e) => e.user === 'grunt' && e.text === 'created an account'));

    const live = once(admin.socket, 'server:event');
    await client(s.base).post('/api/auth/login', { username: 'grunt', password: 'bananas123' });
    const event = await live;
    assert.equal(event.kind, 'auth');
    assert.equal(event.user, 'grunt');
    assert.equal(event.text, 'logged in');

    // Events from the achievement engine (here a saved score) arrive too.
    const scoreEvent = new Promise((resolve) => admin.socket.on('server:event', (e) => e.kind === 'score' && resolve(e)));
    await player.c.post('/api/scores', { mode: 'quick', kills: 4, deaths: 2, durationS: 60 });
    assert.match((await scoreEvent).text, /finished a quick game with 4 kills/);

    let leaked = false;
    player.socket.on('server:event', () => { leaked = true; });
    await client(s.base).post('/api/auth/login', { username: 'boss', password: 'bananas123' });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(leaked, false);
  } finally { admin.socket.close(); player.socket.close(); await s.close(); }
});
