// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startServer, client } = require('./helpers');

test('register logs the player in with an HttpOnly, SameSite session cookie', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    const res = await c.post('/api/auth/register', { username: 'sayub', password: 'bananas123' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.username, 'sayub');
    assert.equal(res.body.user.role, 'player');
    assert.match(res.body.user.id, /^[0-9a-f]{24}$/);
    assert.match(res.setCookie, /^brigade\.sid=/);
    assert.match(res.setCookie, /HttpOnly/i);
    assert.match(res.setCookie, /SameSite=Lax/i);
    const me = await c.get('/api/auth/me');
    assert.equal(me.body.user.username, 'sayub');
  } finally { await s.close(); }
});

test('passwords are stored as bcrypt hashes, never in plain text', async () => {
  const s = await startServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'hashme', password: 'bananas123' });
    const row = await s.db.findUserByName('hashme');
    assert.notEqual(row.password_hash, 'bananas123');
    assert.match(row.password_hash, /^\$2[aby]\$10\$/);
    assert.equal(await bcrypt.compare('bananas123', row.password_hash), true);
  } finally { await s.close(); }
});

test('bad usernames, short passwords and duplicate names are refused', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    assert.equal((await c.post('/api/auth/register', { username: 'a', password: 'bananas123' })).status, 400);
    assert.equal((await c.post('/api/auth/register', { username: 'bad name!', password: 'bananas123' })).status, 400);
    assert.equal((await c.post('/api/auth/register', { username: 'okname', password: 'short' })).status, 400);
    assert.equal((await c.post('/api/auth/register', { username: 'okname', password: 'bananas123' })).status, 201);
    assert.equal((await client(s.base).post('/api/auth/register', { username: 'OKNAME', password: 'bananas123' })).status, 409);
  } finally { await s.close(); }
});

test('login works with the right password, refuses the wrong one, and logout ends the session', async () => {
  const s = await startServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'pilot', password: 'bananas123' });
    const c = client(s.base);
    assert.equal((await c.post('/api/auth/login', { username: 'pilot', password: 'wrongpass' })).status, 401);
    assert.equal((await c.post('/api/auth/login', { username: 'nobody', password: 'bananas123' })).status, 401);
    const ok = await c.post('/api/auth/login', { username: 'pilot', password: 'bananas123' });
    assert.equal(ok.status, 200);
    assert.equal((await c.get('/api/auth/me')).body.user.username, 'pilot');
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).body.user, null);
  } finally { await s.close(); }
});

test('login gives a new session id, so a planted id cannot be reused (session fixation)', async () => {
  const s = await startServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'fixed', password: 'bananas123' });
    const c = client(s.base);
    await c.get('/api/auth/me');
    const before = c.cookie;
    await c.post('/api/auth/login', { username: 'fixed', password: 'bananas123' });
    assert.notEqual(c.cookie, before);
  } finally { await s.close(); }
});

test('five wrong passwords for one name from one IP are limited for a while', async () => {
  const s = await startServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'locked', password: 'bananas123' });
    const c = client(s.base);
    for (let i = 0; i < 5; i++) await c.post('/api/auth/login', { username: 'locked', password: 'nope-nope' });
    const res = await c.post('/api/auth/login', { username: 'locked', password: 'bananas123' });
    assert.equal(res.status, 429);
    assert.match(res.body.error, /Too many failed attempts/);
  } finally { await s.close(); }
});

test('Banana puzzles and saving scores need a login', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    assert.equal((await c.get('/api/puzzle')).status, 401);
    assert.equal((await c.post('/api/scores', { mode: 'quick', kills: 1, deaths: 0, durationS: 10 })).status, 401);
  } finally { await s.close(); }
});

test('puzzle counts on a saved score come from the server, not the browser', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    await c.post('/api/auth/register', { username: 'solver', password: 'bananas123' });
    for (const answer of [3, 7]) {
      const { puzzleId } = (await c.get('/api/puzzle')).body;
      await c.post('/api/puzzle/answer', { puzzleId, answer });
    }
    const saved = await c.post('/api/scores', { mode: 'quick', kills: 5, deaths: 2, durationS: 120, puzzlesSolved: 99 });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.puzzlesSolved, 1);
    assert.equal(saved.body.puzzlesAttempted, 2);
    const board = await c.get('/api/scores/leaderboard?mode=quick');
    assert.equal(board.body.rows[0].username, 'solver');
    assert.equal(board.body.rows[0].kills, 5);
    const today = await c.get('/api/scores/leaderboard?mode=quick&period=today');
    assert.equal(today.body.period, 'today');
    assert.equal(today.body.rows.length, 1);
    const mine = await c.get('/api/scores/me');
    assert.equal(mine.body.totals.games, 1);
    assert.equal(mine.body.totals.seconds_played, 120);
  } finally { await s.close(); }
});

test('a new deploy puzzle starts a new count, so puzzles from a battle that was never saved do not leak into the next one', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    await c.post('/api/auth/register', { username: 'quitter', password: 'bananas123' });
    const answer = async (purpose, given) => {
      const { puzzleId } = (await c.get(`/api/puzzle?purpose=${purpose}`)).body;
      await c.post('/api/puzzle/answer', { puzzleId, answer: given });
    };
    await answer('deploy', 7);
    await answer('respawn', 3);
    await answer('respawn', 7);
    await answer('deploy', 3);
    await answer('deploy', 7);
    await answer('crate', 7);
    const saved = (await c.post('/api/scores', { mode: 'quick', kills: 1, deaths: 0, durationS: 30 })).body;
    assert.deepEqual([saved.puzzlesSolved, saved.puzzlesAttempted], [2, 3]);
    await answer('respawn', 7);
    await answer('deploy', 7);
    const next = (await c.post('/api/scores', { mode: 'quick', kills: 1, deaths: 0, durationS: 30 })).body;
    assert.deepEqual([next.puzzlesSolved, next.puzzlesAttempted], [1, 1]);
  } finally { await s.close(); }
});

test('invalid scores are refused', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    await c.post('/api/auth/register', { username: 'cheater', password: 'bananas123' });
    assert.equal((await c.post('/api/scores', { mode: 'quick', kills: -1, deaths: 0, durationS: 5 })).status, 400);
    assert.equal((await c.post('/api/scores', { mode: 'god', kills: 1, deaths: 0, durationS: 5 })).status, 400);
    assert.equal((await c.post('/api/scores', { mode: 'quick', difficulty: 'impossible', kills: 1, deaths: 0, durationS: 5 })).status, 400);
    assert.equal((await c.post('/api/scores', { mode: 'quick', kills: 99999, deaths: 0, durationS: 5 })).status, 400);
  } finally { await s.close(); }
});

test('admin pages are refused for players (403) and allowed for admins', async () => {
  const s = await startServer();
  try {
    const player = client(s.base);
    await player.post('/api/auth/register', { username: 'player1', password: 'bananas123' });
    assert.equal((await player.get('/api/admin/users')).status, 403);
    assert.equal((await client(s.base).get('/api/admin/users')).status, 401);

    await s.db.createUser('boss', bcrypt.hashSync('bananas123', 4), 'admin');
    const admin = client(s.base);
    await admin.post('/api/auth/login', { username: 'boss', password: 'bananas123' });
    const users = await admin.get('/api/admin/users');
    assert.equal(users.status, 200);
    assert.equal(users.body.users.length, 2);
    const playerId = users.body.users.find((u) => u.username === 'player1').id;
    assert.equal((await admin.del(`/api/admin/users/${playerId}/scores`, { reason: 'test reset' })).status, 200);
    assert.equal((await admin.del('/api/admin/users/not-an-id/scores', { reason: 'test reset' })).status, 404);
  } finally { await s.close(); }
});
