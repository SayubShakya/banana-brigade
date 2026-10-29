// Tests for the admin tools: every action needs a reason and is written to the
// audit log; a suspended player is thrown out at once and cannot log in until
// restored; the Banana API health history.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { startServer, client } = require('./helpers');
const { createPuzzlePool } = require('../server/pool');

const PW = 'bananas123';
async function setup(s) {
  const admin = client(s.base);
  const boss = (await admin.post('/api/auth/register', { username: 'boss', password: PW })).body.user;
  await s.db.setRole(boss.id, 'admin');
  const player = client(s.base);
  const cheat = (await player.post('/api/auth/register', { username: 'cheater', password: PW })).body.user;
  return { admin, boss, player, cheat };
}

test('admin actions need a reason and are written to the audit log', async () => {
  const s = await startServer();
  try {
    const { admin, player, cheat } = await setup(s);
    await player.post('/api/scores', { mode: 'quick', kills: 99, deaths: 0, durationS: 30 });
    assert.equal((await admin.del(`/api/admin/users/${cheat.id}/scores`, {})).status, 400);
    assert.equal((await admin.del(`/api/admin/users/${cheat.id}/scores`, { reason: 'no' })).status, 400);
    assert.equal((await admin.del(`/api/admin/users/${cheat.id}/scores`, { reason: '99 kills in 30 s' })).status, 200);
    assert.equal((await admin.patch(`/api/admin/users/${cheat.id}/role`, { role: 'admin', reason: 'trusted tester' })).status, 200);
    assert.equal((await admin.patch(`/api/admin/users/${cheat.id}/role`, { role: 'player', reason: 'testing over' })).status, 200);

    const { rows } = (await admin.get('/api/admin/audit')).body;
    assert.deepEqual(rows.map((r) => r.action), ['set-role', 'set-role', 'reset-scores']);   // newest first
    assert.deepEqual(rows[2], { ...rows[2], actor: 'boss', target: 'cheater', reason: '99 kills in 30 s', detail: 'reset 1 score' });
    assert.equal((await player.get('/api/admin/audit')).status, 403);
  } finally { await s.close(); }
});

test('a suspended player is signed out at once, cannot log in or connect, and can be restored', async () => {
  const s = await startServer();
  try {
    const { admin, boss, player, cheat } = await setup(s);
    const socket = io(s.base, { transports: ['websocket'], extraHeaders: { Cookie: player.cookie }, forceNew: true });
    await new Promise((r) => socket.once('connect', r));
    const dropped = new Promise((r) => socket.once('disconnect', r));

    assert.equal((await admin.post(`/api/admin/users/${cheat.id}/suspend`, {})).status, 400);
    assert.equal((await admin.post(`/api/admin/users/${boss.id}/suspend`, { reason: 'myself' })).status, 400);
    const res = await admin.post(`/api/admin/users/${cheat.id}/suspend`, { reason: 'aimbot' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ended, 1);
    await dropped;                                                            // live socket closed
    assert.equal((await player.get('/api/auth/me')).body.user, null);         // session gone
    assert.equal((await admin.post(`/api/admin/users/${cheat.id}/suspend`, { reason: 'again' })).status, 409);

    const login = await client(s.base).post('/api/auth/login', { username: 'cheater', password: PW });
    assert.equal(login.status, 403);
    assert.match(login.body.error, /suspended: aimbot/);

    const users = (await admin.get('/api/admin/users')).body.users;
    assert.equal(users.find((u) => u.username === 'cheater').suspended.reason, 'aimbot');

    assert.equal((await admin.post(`/api/admin/users/${cheat.id}/restore`, { reason: 'appeal accepted' })).status, 200);
    assert.equal((await client(s.base).post('/api/auth/login', { username: 'cheater', password: PW })).status, 200);
    const { rows } = (await admin.get('/api/admin/audit')).body;
    assert.deepEqual(rows.map((r) => r.action), ['restore', 'suspend']);
    socket.close();
  } finally { await s.close(); }
});

test('the health history keeps one sample per tick, at most 120, and is admins only', async () => {
  const clock = { t: Date.parse('2026-11-01T10:00:00Z') };
  const pool = createPuzzlePool({ fetchPuzzle: async () => ({ image: 'x', solution: 3 }), size: 0, now: () => clock.t });
  for (let i = 0; i < 130; i++) { pool.sample(); clock.t += 30_000; }
  const h = pool.history();
  assert.equal(h.length, 120);
  assert.equal(h[0].at, new Date(Date.parse('2026-11-01T10:00:00Z') + 10 * 30_000).toISOString());
  assert.deepEqual(Object.keys(h[0]).sort(), ['at', 'circuit', 'online', 'p50LatencyMs', 'ready', 'reserve', 'successRate']);

  const s = await startServer();
  try {
    const { admin, player } = await setup(s);
    const res = (await admin.get('/api/admin/health')).body;
    assert.ok('circuit' in res.now && Array.isArray(res.history));
    assert.equal((await player.get('/api/admin/health')).status, 403);
  } finally { await s.close(); }
});
