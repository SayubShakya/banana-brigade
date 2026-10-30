// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

test('a guest gets a temporary account that lasts 7 days and is not on the leaderboard', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    const res = await c.post('/api/auth/guest');
    assert.equal(res.status, 201);
    assert.match(res.body.user.username, /^guest_[0-9a-f]{6}$/);
    assert.equal(res.body.user.guest, true);
    const days = (Date.parse(/Expires=([^;]+)/i.exec(res.setCookie)[1]) - Date.now()) / 86400000;
    assert.ok(days > 6.9 && days <= 7, `cookie lasts ${days} days`);
    const doc = await s.db.models.User.findById(res.body.user.id).lean();
    assert.ok(doc.guestExpiresAt > new Date(Date.now() + 6.9 * 86400000));
    assert.equal(doc.passwordHash, undefined);

    assert.equal((await c.post('/api/scores', { mode: 'quick', kills: 50, deaths: 0, durationS: 60 })).status, 201);
    const board = await client(s.base).get('/api/scores/leaderboard?mode=quick');
    assert.equal(board.body.rows.length, 0);
  } finally { await s.close(); }
});

test('saving a guest keeps its id and scores, and it can then log in', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    const { id, username: guestName } = (await c.post('/api/auth/guest')).body.user;
    await c.post('/api/scores', { mode: 'quick', kills: 7, deaths: 1, durationS: 60 });
    const before = c.cookie;

    const saved = await c.post('/api/auth/upgrade', { username: 'kept_it', password: 'banana-keeper-1' });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.user, { id, username: 'kept_it', role: 'player', guest: false });
    assert.notEqual(c.cookie, before);
    assert.equal((await s.db.scoresForUser(id)).length, 1);
    assert.equal((await s.db.models.User.findById(id).lean()).guestExpiresAt, undefined);

    assert.equal((await client(s.base).post('/api/auth/login', { username: 'kept_it', password: 'banana-keeper-1' })).status, 200);
    assert.equal((await client(s.base).post('/api/auth/login', { username: guestName, password: 'anything-1' })).status, 401);
    assert.equal((await c.post('/api/auth/upgrade', { username: 'again_one', password: 'banana-keeper-1' })).status, 400);
  } finally { await s.close(); }
});

test('a guest cannot take a used name, a guest_ name, or log in by name', async () => {
  const s = await startServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'taken', password: 'bananas123' });
    const c = client(s.base);
    const guest = (await c.post('/api/auth/guest')).body.user;
    assert.equal((await c.post('/api/auth/upgrade', { username: 'TAKEN', password: 'banana-keeper-1' })).status, 409);
    assert.equal((await c.post('/api/auth/upgrade', { username: 'guest_mine', password: 'banana-keeper-1' })).status, 400);
    assert.equal((await client(s.base).post('/api/auth/register', { username: 'guest_fake', password: 'bananas123' })).status, 400);
    assert.equal((await client(s.base).post('/api/auth/login', { username: guest.username, password: 'whatever1' })).status, 401);
    assert.equal((await c.post('/api/auth/password', { current: '', next: 'banana-keeper-1' })).status, 403);
    assert.equal((await client(s.base).post('/api/auth/upgrade', { username: 'no_session', password: 'banana-keeper-1' })).status, 401);
  } finally { await s.close(); }
});

test('a guest can delete itself without a password', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    const { id } = (await c.post('/api/auth/guest')).body.user;
    assert.equal((await c.del('/api/auth/account', {})).status, 200);
    assert.equal(await s.db.findUserById(id), null);
  } finally { await s.close(); }
});
