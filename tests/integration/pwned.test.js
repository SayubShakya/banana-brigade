// Tests for the breached password check (Have I Been Pwned range API).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createPwnedCheck } = require('../../server/services/pwned');
const { startServer, client } = require('./helpers');

// Upper case SHA-1 hash, the format the range API uses.
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').toUpperCase();
const BREACHED = 'password123';

// A fake range API: it records each URL it is called with and answers like the real service.
function fakeRangeApi() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const prefix = url.slice(-5);
    const lines = ['0018A45C4D1DEF81644B54AB7F969B88D65:0'];
    const h = sha1(BREACHED);
    if (h.startsWith(prefix)) lines.push(`${h.slice(5)}:250000`);
    return { ok: true, text: async () => lines.join('\r\n') };
  };
  return { fetchImpl, calls };
}
const quiet = { warn: () => {} };

// Proves only the first 5 characters of the hash leave the server, so the password itself is never sent.
test('only the first 5 characters of the SHA-1 hash are sent', async () => {
  const { fetchImpl, calls } = fakeRangeApi();
  const check = createPwnedCheck({ fetchImpl, log: quiet });
  const result = await check(BREACHED);
  assert.deepEqual(result, { pwned: true, count: 250000, checked: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0], `https://api.pwnedpasswords.com/range/${sha1(BREACHED).slice(0, 5)}`);
  assert.ok(!calls[0].includes(BREACHED) && !calls[0].includes(sha1(BREACHED)));
  assert.equal((await check('a-much-better-banana-password')).pwned, false);
});

// Proves an outage of the outside service does not block sign-ups; it only logs a warning.
test('when the service is down the password is allowed and a warning is logged', async () => {
  const warnings = [];
  const check = createPwnedCheck({ fetchImpl: async () => { throw new TypeError('fetch failed'); }, log: { warn: (m) => warnings.push(m) } });
  assert.deepEqual(await check(BREACHED), { pwned: false, count: 0, checked: false });
  assert.match(warnings[0], /check skipped, password allowed/);
});

// Proves every place a password is set refuses a known breached password.
test('register, change password and reset refuse a breached password', async () => {
  const sent = [];
  const check = createPwnedCheck({ fetchImpl: fakeRangeApi().fetchImpl, log: quiet });
  const s = await startServer({ appOptions: { pwnedCheck: check, sendResetLink: (m) => sent.push(m) } });
  try {
    const refused = await client(s.base).post('/api/auth/register', { username: 'pwned_one', password: BREACHED });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /250,000 leaked password lists/);

    const c = client(s.base);
    assert.equal((await c.post('/api/auth/register', { username: 'safe_one', password: 'banana-split-77' })).status, 201);
    assert.equal((await c.post('/api/auth/password', { current: 'banana-split-77', next: BREACHED })).status, 400);

    await client(s.base).post('/api/auth/forgot', { username: 'safe_one' });
    const token = new URL(sent[0].link).hash.replace('#reset=', '');
    assert.equal((await client(s.base).post('/api/auth/reset', { token, password: BREACHED })).status, 400);
    assert.equal((await client(s.base).post('/api/auth/reset', { token, password: 'another-banana-88' })).status, 200);
  } finally { await s.close(); }
});
