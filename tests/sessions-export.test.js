// Tests for "where you're signed in" (each session's device and last use, signing
// out one of them) and "download my data".
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');
const { describeDevice } = require('../server/routes/auth');

const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test('the device name is read from the User-Agent', () => {
  assert.equal(describeDevice(MAC_CHROME), 'Chrome on macOS');
  assert.equal(describeDevice(IPHONE), 'Safari on iOS');
  assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/131.0'), 'Firefox on Windows');
  assert.equal(describeDevice(''), 'Unknown device');
});

test('the list shows each device, marks this one, and one other device can be signed out', async () => {
  const s = await startServer();
  try {
    const laptop = client(s.base, { headers: { 'User-Agent': MAC_CHROME } });
    await laptop.post('/api/auth/register', { username: 'two_devices', password: 'bananas123' });
    const phone = client(s.base, { headers: { 'User-Agent': IPHONE } });
    await phone.post('/api/auth/login', { username: 'two_devices', password: 'bananas123' });

    const { body } = await laptop.get('/api/auth/sessions');
    assert.equal(body.count, 2);
    const here = body.list.find((x) => x.current);
    const there = body.list.find((x) => !x.current);
    assert.equal(here.device, 'Chrome on macOS');
    assert.equal(there.device, 'Safari on iOS');
    assert.match(there.handle, /^[0-9a-f]{16}$/);
    assert.ok(!laptop.cookie.includes(there.handle) && !phone.cookie.includes(there.handle));   // never the real id
    assert.ok(here.lastSeen && here.createdAt);

    assert.equal((await laptop.del(`/api/auth/sessions/${here.handle}`)).status, 400);         // not this one
    assert.equal((await laptop.del(`/api/auth/sessions/${there.handle}`)).status, 200);
    assert.equal((await phone.get('/api/auth/me')).body.user, null);                           // the phone is out
    assert.equal((await laptop.get('/api/auth/me')).body.user.username, 'two_devices');        // the laptop is not
    assert.equal((await laptop.del(`/api/auth/sessions/${there.handle}`)).status, 404);

    // Another player cannot end my sessions with my handle.
    const other = client(s.base);
    await other.post('/api/auth/register', { username: 'stranger', password: 'bananas123' });
    assert.equal((await other.del(`/api/auth/sessions/${here.handle}`)).status, 404);
  } finally { await s.close(); }
});

test('download my data has the profile, scores and sessions, and no password hash', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    const { user } = (await c.post('/api/auth/register', { username: 'exporter', password: 'bananas123' })).body;
    await c.post('/api/scores', { mode: 'quick', kills: 6, deaths: 2, durationS: 90 });
    const res = await fetch(`${s.base}/api/v1/auth/export`, { headers: { Cookie: c.cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="banana-brigade-exporter-\d{4}-\d{2}-\d{2}\.json"/);
    const text = await res.text();
    assert.ok(!/passwordHash|password_hash|\$2[aby]\$/.test(text), 'no password hash in the export');
    const data = JSON.parse(text);
    assert.equal(data.profile.id, user.id);
    assert.equal(data.profile.username, 'exporter');
    assert.equal(data.scores.length, 1);
    assert.equal(data.scores[0].kills, 6);
    assert.equal(data.sessions.length, 1);
    assert.equal((await client(s.base).get('/api/auth/export')).status, 401);
  } finally { await s.close(); }
});
