// Tests for "forgot password" (single-use reset links that last 30 minutes) and the
// login limits counted per IP address (so nobody can lock out someone else's name).
// Different IP addresses are faked with X-Forwarded-For and trust proxy turned on.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

const PW = 'bananas123';
const NEW_PW = 'new-bananas-456';

// A server whose reset "emails" land in an array instead of the log.
async function resetServer() {
  const sent = [];
  const s = await startServer({ appOptions: { trustProxy: true, sendResetLink: (msg) => { sent.push(msg); } } });
  return { s, sent };
}
const tokenOf = (msg) => new URL(msg.link).hash.replace('#reset=', '');
const fromIp = (s, ip) => client(s.base, { headers: { 'X-Forwarded-For': ip } });

test('a reset link sets a new password, works once and ends every session', async () => {
  const { s, sent } = await resetServer();
  try {
    const owner = client(s.base);
    await owner.post('/api/auth/register', { username: 'forgetful', password: PW });
    const res = await client(s.base).post('/api/auth/forgot', { username: 'forgetful' });
    assert.equal(res.status, 200);
    assert.equal(sent.length, 1);
    assert.match(sent[0].link, /\/#reset=[\w-]{43}$/);

    const token = tokenOf(sent[0]);
    const used = await client(s.base).post('/api/auth/reset', { token, password: NEW_PW });
    assert.equal(used.status, 200);
    assert.equal(used.body.username, 'forgetful');
    assert.equal((await owner.get('/api/auth/me')).body.user, null);   // old session ended

    assert.equal((await client(s.base).post('/api/auth/login', { username: 'forgetful', password: PW })).status, 401);
    assert.equal((await client(s.base).post('/api/auth/login', { username: 'forgetful', password: NEW_PW })).status, 200);

    // The same link a second time does nothing.
    const again = await client(s.base).post('/api/auth/reset', { token, password: 'third-password-1' });
    assert.equal(again.status, 400);
    assert.match(again.body.error, /not valid/);
  } finally { await s.close(); }
});

test('the token is stored only as a hash, and two uses at once still work only once', async () => {
  const { s, sent } = await resetServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'racer', password: PW });
    await client(s.base).post('/api/auth/forgot', { username: 'racer' });
    const token = tokenOf(sent[0]);
    const stored = await s.db.models.PasswordReset.findOne().lean();
    assert.notEqual(stored.tokenHash, token);
    assert.equal(stored.tokenHash.length, 64);   // SHA-256 in hex

    const results = await Promise.all([1, 2, 3].map((i) => client(s.base).post('/api/auth/reset', { token, password: `parallel-pw-${i}` })));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
  } finally { await s.close(); }
});

test('an expired link is refused, and only the newest link works', async () => {
  const { s, sent } = await resetServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'slowpoke', password: PW });
    await client(s.base).post('/api/auth/forgot', { username: 'slowpoke' });
    // Move the link's expiry into the past (as if 30 minutes had gone by).
    await s.db.models.PasswordReset.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    assert.equal((await client(s.base).post('/api/auth/reset', { token: tokenOf(sent[0]), password: NEW_PW })).status, 400);

    await client(s.base).post('/api/auth/forgot', { username: 'slowpoke' });
    await client(s.base).post('/api/auth/forgot', { username: 'slowpoke' });
    assert.equal((await client(s.base).post('/api/auth/reset', { token: tokenOf(sent[1]), password: NEW_PW })).status, 400);
    assert.equal((await client(s.base).post('/api/auth/reset', { token: tokenOf(sent[2]), password: NEW_PW })).status, 200);
  } finally { await s.close(); }
});

test('an unknown username gets the same reply, and requests are limited per IP', async () => {
  const { s, sent } = await resetServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'realone', password: PW });
    const c = fromIp(s, '10.0.0.7');
    const known = await c.post('/api/auth/forgot', { username: 'realone' });
    const unknown = await c.post('/api/auth/forgot', { username: 'nobody_here' });
    assert.deepEqual(known.body, unknown.body);
    assert.equal(sent.length, 1);
    for (let i = 0; i < 3; i++) await c.post('/api/auth/forgot', { username: 'nobody_here' });
    assert.equal((await c.post('/api/auth/forgot', { username: 'realone' })).status, 429);
    assert.equal((await fromIp(s, '10.0.0.8').post('/api/auth/forgot', { username: 'realone' })).status, 200);
  } finally { await s.close(); }
});

test('a stranger typing wrong passwords does not lock the owner out on their own IP', async () => {
  const { s } = await resetServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'victim', password: PW });
    const attacker = fromIp(s, '203.0.113.9');
    for (let i = 0; i < 5; i++) await attacker.post('/api/auth/login', { username: 'victim', password: 'guess-guess' });
    assert.equal((await attacker.post('/api/auth/login', { username: 'victim', password: PW })).status, 429);
    assert.equal((await fromIp(s, '198.51.100.4').post('/api/auth/login', { username: 'victim', password: PW })).status, 200);
  } finally { await s.close(); }
});

test('one IP cannot try more than 20 wrong passwords across different names', async () => {
  const { s } = await resetServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'target21', password: PW });
    const c = fromIp(s, '203.0.113.50');
    for (let i = 0; i < 20; i++) await c.post('/api/auth/login', { username: `name${i}`, password: 'guess-guess' });
    const blocked = await c.post('/api/auth/login', { username: 'target21', password: PW });
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.error, /Try again in \d+ min/);
  } finally { await s.close(); }
});

test('parallel guesses cannot get past the limit of 5', async () => {
  const { s } = await resetServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'burst', password: PW });
    const c = fromIp(s, '203.0.113.77');
    const results = await Promise.all(Array.from({ length: 12 }, () => c.post('/api/auth/login', { username: 'burst', password: 'guess-guess' })));
    assert.equal(results.filter((r) => r.status === 401).length, 5);
    assert.equal(results.filter((r) => r.status === 429).length, 7);
  } finally { await s.close(); }
});

test('a correct password does not use up the IP allowance', async () => {
  const { s } = await resetServer();
  try {
    await client(s.base).post('/api/auth/register', { username: 'regular', password: PW });
    // A lab where everyone shares one IP: 25 good logins in a row are all fine.
    for (let i = 0; i < 25; i++) {
      const res = await fromIp(s, '192.0.2.1').post('/api/auth/login', { username: 'regular', password: PW });
      assert.equal(res.status, 200);
    }
  } finally { await s.close(); }
});
