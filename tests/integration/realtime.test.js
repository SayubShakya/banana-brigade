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
    const { room } = await call(a.socket, 'room:create', { bots: true, teamMode: true, isPublic: true });
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
    const { room } = await call(a.socket, 'room:create', { bots: true, teamMode: false });
    await call(b.socket, 'room:join', { code: room.code });
    b.socket.emit('room:ready', { ready: true });
    await once(a.socket, 'room:update');
    const started = once(a.socket, 'match:start');
    assert.deepEqual(await call(a.socket, 'room:start'), { ok: true });
    const start = await started;
    assert.equal(start.me, `u${a.me.id}`);
    assert.equal(start.roster.length, 6);
    assert.ok(['jungle', 'desert', 'snow', 'night'].includes(start.map), 'the server names the map');
    assert.equal(start.roster.filter((r) => r.human).length, 2);

    const snap = await once(b.socket, 'match:snapshot');
    assert.ok(snap.soldiers.some((x) => x.id === `u${b.me.id}`));
    assert.equal('solution' in snap, false);

    b.socket.emit('score', { kills: 999 });
    b.socket.emit('match:end', { winner: 'bravo' });
    b.socket.emit('input', { fire: true, aimX: 'x', kills: 999 });
    assert.equal((await call(b.socket, 'puzzle:get', { purpose: 'respawn' })).error, 'No puzzle needed right now');
    assert.match((await call(b.socket, 'puzzle:answer', { puzzleId: 'made-up', answer: 7 })).error, /not yours/);

    const ended = once(a.socket, 'match:end');
    s.realtime.rooms.endMatch(room.code);
    const summary = await ended;
    assert.equal(summary.ranking.length, 6);
    await new Promise((r) => setTimeout(r, 200));

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
    assert.equal((await call(a.socket, 'room:create', { bots: true, difficulty: 'insane' })).error, 'Unknown difficulty');
    assert.equal((await call(a.socket, 'room:create', { bots: true, difficulty: { $ne: 1 } })).error, 'Unknown difficulty');
    assert.equal((await call(a.socket, 'room:create', { bots: true })).room.difficulty, 'medium');

    const { room } = await call(a.socket, 'room:create', { bots: true, difficulty: 'hard' });
    assert.equal(room.difficulty, 'hard');
    assert.equal((await call(b.socket, 'rooms:list')).rooms.find((r) => r.code === room.code).difficulty, 'hard');

    assert.deepEqual(await call(a.socket, 'room:start'), { ok: true });
    assert.equal(s.realtime.rooms.room(room.code).match.botLevel, 'Hard');
    s.realtime.rooms.endMatch(room.code);
  } finally { a.socket.close(); b.socket.close(); await s.close(); }
});

test('banana crates online: the room difficulty time, a server time limit, and one respawn try per death', async () => {
  const s = await startServer({ matchOptions: { crateTimings: { extraMs: -11800 } } });
  const a = await player(s, 'crater');
  try {
    const { room } = await call(a.socket, 'room:create', { bots: true, difficulty: 'hard' });
    const started = once(a.socket, 'match:start');
    await call(a.socket, 'room:start');
    assert.equal((await started).difficulty, 'hard');
    const match = s.realtime.rooms.room(room.code).match;
    const me = match.world.soldiers.find((x) => x.id === `u${a.me.id}`);

    const offered = once(a.socket, 'puzzle:offer');
    match.world.emit('banana:crate', { soldier: me, pickup: match.world.pickups.find((p) => p.kind === 'banana') });
    assert.deepEqual(await offered, { purpose: 'crate', seconds: 12 });
    assert.equal(me.busy, true);
    assert.deepEqual(await once(a.socket, 'puzzle:closed'), { purpose: 'crate', reason: 'time' });
    assert.equal(me.busy, false);
    assert.ok(me.shieldTimer > 1.5);

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

test('a player who drops out mid-match gets their soldier back when they reconnect', async () => {
  const s = await startServer();
  const a = await player(s, 'stayer');
  const b = await player(s, 'dropper');
  try {
    const { room } = await call(a.socket, 'room:create', { bots: true, teamMode: false });
    await call(b.socket, 'room:join', { code: room.code });
    b.socket.emit('room:ready', { ready: true });
    await once(a.socket, 'room:update');
    const started = once(b.socket, 'match:start');
    await call(a.socket, 'room:start');
    const first = await started;

    const left = once(a.socket, 'room:update');
    b.socket.close();
    assert.equal((await left).players.find((p) => p.userId === b.me.id).connected, false);

    const again = io(s.base, { transports: ['websocket'], extraHeaders: { Cookie: b.c.cookie }, forceNew: true });
    try {
      const back = await once(again, 'match:start');
      assert.equal(back.matchId, first.matchId);
      assert.equal(back.me, `u${b.me.id}`);
      assert.equal(s.realtime.rooms.room(room.code).players.get(b.me.id).connected, true);
    } finally { again.close(); }
  } finally { a.socket.close(); b.socket.close(); await s.close(); }
});

test('opening the lobby again shows the room you are still in', async () => {
  const s = await startServer();
  const a = await player(s, 'roomhost');
  try {
    const { room } = await call(a.socket, 'room:create', { bots: true, teamMode: false });
    await new Promise((r) => setTimeout(r, 100));
    const update = once(a.socket, 'room:update', 1000);
    await call(a.socket, 'rooms:list');
    assert.equal((await update).code, room.code);
  } finally { a.socket.close(); await s.close(); }
});

test('an online match end saves one battle log with kills, puzzles, joins and the full roster', async () => {
  const { damage } = require('../../client/src/game/world.js');
  const s = await startServer();
  const a = await player(s, 'logger');
  const b = await player(s, 'logpal');
  const matches = [];
  const scores = [];
  const { addMatch, addScore } = s.db;
  s.db.addMatch = async (m) => { matches.push(m); return addMatch ? addMatch.call(s.db, m) : m.matchId; };
  s.db.addScore = async (row) => { scores.push(row); return addScore.call(s.db, row); };
  try {
    const { room } = await call(a.socket, 'room:create', { bots: true, teamMode: false });
    await call(b.socket, 'room:join', { code: room.code });
    b.socket.emit('room:ready', { ready: true });
    await once(a.socket, 'room:update');
    const started = once(a.socket, 'match:start');
    await call(a.socket, 'room:start');
    await started;
    const match = s.realtime.rooms.room(room.code).match;
    const [me, pal] = [`u${a.me.id}`, `u${b.me.id}`].map((id) => match.world.soldiers.find((x) => x.id === id));
    const bot = match.world.soldiers.find((x) => !x.isPlayer);
    for (const x of [me, pal, bot]) x.shieldTimer = 0;
    damage(match.world, bot, 999, me, 'sniper');
    damage(match.world, pal, 999, bot, 'rifle');
    match.countPuzzle(b.me.id, false);
    match.applyPuzzle(b.me.id, 'respawn', false);

    const ended = once(a.socket, 'match:end');
    s.realtime.rooms.endMatch(room.code);
    const summary = await ended;
    await new Promise((r) => setTimeout(r, 300));

    const kills = summary.log.filter((e) => e.type === 'kill');
    assert.deepEqual(kills[0], { t: kills[0].t, type: 'kill', by: 'logger', target: bot.name, weapon: 'Sniper' });
    assert.deepEqual(kills[1], { t: kills[1].t, type: 'kill', by: bot.name, target: 'logpal', weapon: 'Assault Rifle' });
    assert.deepEqual(summary.log.filter((e) => e.type === 'join').map((e) => e.by).sort(), ['logger', 'logpal']);
    const puzzle = summary.log.find((e) => e.type === 'puzzle');
    assert.deepEqual(puzzle, { t: puzzle.t, type: 'puzzle', by: 'logpal', ok: false, detail: 'respawn' });
    assert.deepEqual(summary.log.at(-1), { t: summary.log.at(-1).t, type: 'end', detail: 'Host ended it' });
    assert.equal(summary.roster.length, 6);
    assert.equal(summary.roster.filter((r) => r.bot).length, 4);
    assert.ok(summary.roster.every((r) => !('userId' in r)), 'the room never sees user ids');

    assert.equal(matches.length, 1);
    const [saved] = matches;
    assert.deepEqual([saved.mode, saved.multiplayer, saved.owner, saved.matchId], ['online', true, null, summary.matchId]);
    assert.deepEqual(saved.log, summary.log);
    assert.deepEqual(saved.roster.filter((r) => r.userId).map((r) => r.userId).sort(), [a.me.id, b.me.id].map(String).sort());
    assert.equal(scores.length, 2);
    assert.ok(scores.every((row) => row.matchId === summary.matchId && row.multiplayer));
  } finally { a.socket.close(); b.socket.close(); await s.close(); }
});

test('an online tie is a draw for everyone, and the room difficulty and game time are saved', async () => {
  const s = await startServer();
  const a = await player(s, 'tiehost');
  const b = await player(s, 'tiepal');
  const scores = [];
  const { addScore } = s.db;
  s.db.addScore = async (row) => { scores.push(row); return addScore.call(s.db, row); };
  try {
    const { room } = await call(a.socket, 'room:create', { bots: false, difficulty: 'hard' });
    await call(b.socket, 'room:join', { code: room.code });
    b.socket.emit('room:ready', { ready: true });
    await once(a.socket, 'room:update');
    const started = once(a.socket, 'match:start');
    await call(a.socket, 'room:start');
    await started;
    const match = s.realtime.rooms.room(room.code).match;
    const ended = once(a.socket, 'match:end');
    s.realtime.rooms.endMatch(room.code);
    const summary = await ended;
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(summary.winner, null);
    assert.equal(summary.durationS, Math.round(match.world.time));
    assert.equal(summary.roster.length, 2);
    assert.equal(scores.length, 2);
    assert.ok(scores.every((row) => row.won === false && row.draw === true && row.difficulty === 'hard'));
  } finally { a.socket.close(); b.socket.close(); await s.close(); }
});

test('a player who leaves keeps their real name in the log and roster, still gets the game, but cannot win it', async () => {
  const { damage } = require('../../client/src/game/world.js');
  const s = await startServer();
  const a = await player(s, 'quitter');
  const b = await player(s, 'keeper');
  const scores = [];
  const { addScore } = s.db;
  s.db.addScore = async (row) => { scores.push(row); return addScore.call(s.db, row); };
  try {
    const { room } = await call(a.socket, 'room:create', { bots: false });
    await call(b.socket, 'room:join', { code: room.code });
    b.socket.emit('room:ready', { ready: true });
    await once(a.socket, 'room:update');
    const started = once(b.socket, 'match:start');
    await call(a.socket, 'room:start');
    await started;
    const match = s.realtime.rooms.room(room.code).match;
    const [quitter, keeper] = [a, b].map((p) => match.world.soldiers.find((x) => x.id === `u${p.me.id}`));
    const left = once(b.socket, 'room:update');
    a.socket.emit('room:leave');
    await left;
    keeper.shieldTimer = 0;
    damage(match.world, keeper, 999, quitter, 'sniper');
    const ended = once(b.socket, 'match:end');
    match.end('host');
    const summary = await ended;
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(summary.winner, 'quitter');
    assert.deepEqual(summary.roster.map((r) => [r.name, r.bot]), [['quitter', false], ['keeper', false]]);
    assert.ok(summary.log.some((e) => e.type === 'leave' && e.by === 'quitter'));
    assert.ok(summary.log.some((e) => e.type === 'kill' && e.by === 'quitter' && e.target === 'keeper'));
    assert.ok(!JSON.stringify(summary).includes('(bot)'));
    const mine = scores.find((row) => row.userId === a.me.id);
    assert.deepEqual([mine.kills, mine.won], [1, false]);
    assert.equal(scores.find((row) => row.userId === b.me.id).won, false);
  } finally { a.socket.close(); b.socket.close(); await s.close(); }
});
