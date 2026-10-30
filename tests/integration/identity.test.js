// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { once } = require('node:events');
const { io } = require('socket.io-client');
const { startServer, client } = require('./helpers');

const PW = 'bananas123';

async function registered(s, username) {
  const c = client(s.base);
  const res = await c.post('/api/auth/register', { username, password: PW });
  return { c, id: res.body.user.id };
}
async function loggedIn(s, username, password = PW, extra = {}) {
  const c = client(s.base);
  const res = await c.post('/api/auth/login', { username, password, ...extra });
  return { c, res };
}
const maxAge = (setCookie) => (Date.parse(/Expires=([^;]+)/i.exec(setCookie ?? '')?.[1]) - Date.now()) / 1000;
const connectSocket = async (s, c) => {
  const socket = io(s.base, { transports: ['websocket'], extraHeaders: { Cookie: c.cookie }, forceNew: true });
  await once(socket, 'connect');
  return socket;
};

test('remember me keeps the cookie for 30 days; the default is 2 hours', async () => {
  const s = await startServer();
  try {
    await registered(s, 'rememb');
    const short = await loggedIn(s, 'rememb');
    assert.ok(Math.abs(maxAge(short.res.setCookie) - 2 * 60 * 60) < 60);
    const long = await loggedIn(s, 'rememb', PW, { remember: true });
    assert.ok(Math.abs(maxAge(long.res.setCookie) - 30 * 24 * 60 * 60) < 60);
  } finally { await s.close(); }
});

test('log out of all devices ends the sessions and live sockets on other clients too', async () => {
  const s = await startServer();
  let socket;
  try {
    await registered(s, 'everywhere');
    const phone = (await loggedIn(s, 'everywhere')).c;
    const laptop = (await loggedIn(s, 'everywhere')).c;
    const other = (await registered(s, 'bystander')).c;
    socket = await connectSocket(s, phone);
    const dropped = once(socket, 'disconnect');
    const count = await laptop.get('/api/auth/sessions');
    assert.equal(count.body.count, 3);
    assert.ok(count.body.current.createdAt);
    assert.ok(count.body.memberSince);

    assert.equal((await laptop.post('/api/auth/logout-all')).status, 200);
    assert.equal((await laptop.get('/api/auth/me')).body.user, null);
    assert.equal((await phone.get('/api/auth/me')).body.user, null);
    const [reason] = await dropped;
    assert.equal(reason, 'io server disconnect');
    assert.equal((await other.get('/api/auth/me')).body.user.username, 'bystander');
  } finally { socket?.close(); await s.close(); }
});

test('changing the password needs the current one and logs out the other sessions', async () => {
  const s = await startServer();
  try {
    const { c: me } = await registered(s, 'changer');
    const other = (await loggedIn(s, 'changer')).c;
    assert.equal((await me.post('/api/auth/password', { current: 'wrongpass', next: 'newbananas1' })).status, 403);
    assert.equal((await me.post('/api/auth/password', { current: PW, next: 'short' })).status, 400);
    assert.equal((await client(s.base).post('/api/auth/password', { current: PW, next: 'newbananas1' })).status, 401);

    const ok = await me.post('/api/auth/password', { current: PW, next: 'newbananas1' });
    assert.equal(ok.status, 200);
    assert.equal((await me.get('/api/auth/me')).body.user.username, 'changer');
    assert.equal((await other.get('/api/auth/me')).body.user, null);
    assert.equal((await loggedIn(s, 'changer')).res.status, 401);
    assert.equal((await loggedIn(s, 'changer', 'newbananas1')).res.status, 200);
  } finally { await s.close(); }
});

test('deleting the account removes the user, their scores and their session', async () => {
  const s = await startServer();
  try {
    const { c, id } = await registered(s, 'leaver');
    const second = (await loggedIn(s, 'leaver')).c;
    await s.db.addScore({ userId: id, mode: 'quick', kills: 3, deaths: 1 });
    await client(s.base).post('/api/auth/login', { username: 'leaver', password: 'wrongpass' });
    assert.equal((await c.del('/api/auth/account', { password: 'wrongpass' })).status, 403);
    const res = await c.del('/api/auth/account', { password: PW });
    assert.equal(res.status, 200);
    assert.equal(await s.db.findUserById(id), null);
    assert.equal((await s.db.scoresForUser(id)).length, 0);
    assert.equal((await c.get('/api/auth/me')).body.user, null);
    assert.equal((await second.get('/api/auth/me')).body.user, null);
    assert.equal(await s.db.countersFor('leaver'), 0);
    assert.deepEqual((await client(s.base).get('/api/auth/available?u=leaver')).body, { available: true, valid: true });
  } finally { await s.close(); }
});

test('the username check says whether a name is valid and free', async () => {
  const s = await startServer();
  try {
    await registered(s, 'takenname');
    const c = client(s.base);
    assert.deepEqual((await c.get('/api/auth/available?u=TakenName')).body, { available: false, valid: true });
    assert.deepEqual((await c.get('/api/auth/available?u=freename')).body, { available: true, valid: true });
    assert.deepEqual((await c.get('/api/auth/available?u=no')).body, { available: false, valid: false });
    assert.deepEqual((await c.get('/api/auth/available?u=bad%20name')).body, { available: false, valid: false });
  } finally { await s.close(); }
});

test('only admins can change roles, and an admin cannot demote themselves', async () => {
  const s = await startServer();
  try {
    const { c: player, id: playerId } = await registered(s, 'grunt');
    const boss = await s.db.createUser('boss', bcrypt.hashSync(PW, 4), 'admin');
    assert.equal((await player.patch(`/api/admin/users/${playerId}/role`, { role: 'admin', reason: 'test promotion' })).status, 403);

    const admin = (await loggedIn(s, 'boss')).c;
    assert.equal((await admin.patch(`/api/admin/users/${playerId}/role`, { role: 'king', reason: 'test' })).status, 400);
    assert.equal((await admin.patch(`/api/admin/users/${boss.id}/role`, { role: 'player', reason: 'test demotion' })).status, 400);
    const promoted = await admin.patch(`/api/admin/users/${playerId}/role`, { role: 'admin', reason: 'test promotion' });
    assert.equal(promoted.status, 200);
    assert.equal((await s.db.findUserById(playerId)).role, 'admin');
    assert.equal((await player.get('/api/admin/users')).status, 200);
    assert.equal((await admin.patch(`/api/admin/users/${playerId}/role`, { role: 'player', reason: 'test demotion' })).status, 200);
    assert.equal((await player.get('/api/admin/users')).status, 403);
  } finally { await s.close(); }
});

test('a demoted or deleted admin loses access at once, even with a live session', async () => {
  const s = await startServer();
  try {
    const boss = await s.db.createUser('chief', bcrypt.hashSync(PW, 4), 'admin');
    const admin = (await loggedIn(s, 'chief')).c;
    assert.equal((await admin.get('/api/admin/users')).status, 200);
    await s.db.setRole(boss.id, 'player');
    assert.equal((await admin.get('/api/admin/users')).status, 403);
    await s.db.deleteUser(boss.id);
    assert.equal((await admin.get('/api/scores/me')).status, 401);
    assert.equal((await admin.get('/api/auth/me')).body.user, null);
  } finally { await s.close(); }
});

test('a password change drops the other devices\' sockets but keeps this one', async () => {
  const s = await startServer();
  let mine; let theirs;
  try {
    const { c: me } = await registered(s, 'sockpw');
    const other = (await loggedIn(s, 'sockpw')).c;
    mine = await connectSocket(s, me);
    theirs = await connectSocket(s, other);
    const dropped = once(theirs, 'disconnect');
    assert.equal((await me.post('/api/auth/password', { current: PW, next: 'newbananas1' })).status, 200);
    await dropped;
    assert.equal(mine.connected, true);
  } finally { mine?.close(); theirs?.close(); await s.close(); }
});
