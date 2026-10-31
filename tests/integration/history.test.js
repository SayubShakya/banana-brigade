// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { startServer, client } = require('./helpers');

async function player(s, username) {
  const c = client(s.base);
  const { user } = (await c.post('/api/auth/register', { username, password: 'bananas123' })).body;
  return { c, user };
}

const LOG = [
  { t: 1.24, type: 'join', by: 'sayub' },
  { t: 12.5, type: 'kill', by: 'sayub', target: 'Bot Kiwi', weapon: 'sniper' },
  { t: 20, type: 'puzzle', by: 'sayub', ok: true, detail: 'respawn' },
  { t: 61, type: 'end', detail: 'Time up' },
];
const ROSTER = [
  { name: 'sayub', kills: 4, deaths: 1, bot: false, me: true },
  { name: 'Bot Kiwi', kills: 2, deaths: 3, bot: true },
];

test('a saved battle log shows in the history and only players in the match can open it', async () => {
  const s = await startServer();
  try {
    const { c } = await player(s, 'sayub');
    const saved = await c.post('/api/scores', { mode: 'quick', kills: 4, deaths: 1, durationS: 61, won: true, map: 'jungle', roster: ROSTER, log: LOG });
    assert.equal(saved.status, 201);
    assert.match(saved.body.matchId, /^[0-9a-f-]{36}$/);
    const plain = await c.post('/api/scores', { mode: 'survival', kills: 9, deaths: 1, wave: 3, durationS: 50 });
    assert.equal(plain.body.matchId, null);
    await c.post('/api/scores', { mode: 'training', kills: 1, deaths: 0, durationS: 10, log: LOG });

    const { rows, next } = (await c.get('/api/scores/history')).body;
    assert.equal(next, null);
    assert.deepEqual(rows.map((r) => [r.mode, r.hasLog]), [['survival', false], ['quick', true]]);
    assert.equal(rows[1].matchId, saved.body.matchId);
    assert.equal(rows[1].map, 'jungle');
    assert.equal(rows[1].draw, false);

    const recent = (await c.get('/api/scores/me')).body.recent;
    const quick = recent.find((r) => r.mode === 'quick');
    assert.equal(quick.matchId, saved.body.matchId);
    assert.equal(quick.hasLog, true);
    assert.equal(recent.find((r) => r.mode === 'survival').hasLog, false);

    const { match } = (await c.get(`/api/v1/matches/${saved.body.matchId}`)).body;
    assert.equal(match.mode, 'quick');
    assert.equal(match.map, 'jungle');
    assert.equal(match.multiplayer, false);
    assert.equal(match.winner, 'sayub');
    assert.equal(match.log.length, 4);
    assert.equal(match.log[0].t, 1.2);
    assert.deepEqual(match.log[1], { t: 12.5, type: 'kill', by: 'sayub', target: 'Bot Kiwi', weapon: 'sniper' });
    assert.equal(match.roster.find((r) => r.name === 'sayub').me, true);
    assert.equal(match.roster.find((r) => r.name === 'Bot Kiwi').me, undefined);
    assert.ok(!JSON.stringify(match).includes('userId'));

    const other = await player(s, 'nosy');
    assert.equal((await other.c.get(`/api/matches/${saved.body.matchId}`)).status, 404);
    assert.equal((await other.c.get('/api/matches/not-a-match')).status, 404);
    assert.equal((await client(s.base).get(`/api/matches/${saved.body.matchId}`)).status, 401);
    await s.db.setRole(other.user.id, 'admin');
    assert.equal((await other.c.get(`/api/matches/${saved.body.matchId}`)).status, 200);
    assert.equal((await client(s.base).get('/api/scores/history')).status, 401);
  } finally { await s.close(); }
});

test('a log without a roster gets a one-row scoreboard; campaign results save a log too', async () => {
  const s = await startServer();
  try {
    const { c } = await player(s, 'lonewolf');
    const saved = await c.post('/api/scores', { mode: 'quick', kills: 2, deaths: 5, durationS: 30, log: LOG, draw: true, won: true });
    const { match } = (await c.get(`/api/matches/${saved.body.matchId}`)).body;
    assert.deepEqual(match.roster, [{ name: 'lonewolf', kills: 2, deaths: 5, bot: false, me: true }]);
    assert.equal(match.winner, null);
    const row = (await c.get('/api/scores/history')).body.rows[0];
    assert.equal(row.draw, true);
    assert.equal(row.won, 0);

    const camp = await c.post('/api/campaign/result', { mission: 1, won: true, kills: 5, deaths: 0, continues: 0, timeS: 90, map: 'beach', log: LOG });
    assert.equal(camp.status, 200);
    assert.ok(camp.body.matchId);
    const h = (await c.get('/api/scores/history?filter=campaign')).body.rows;
    assert.equal(h.length, 1);
    assert.equal(h[0].matchId, camp.body.matchId);
    assert.equal(h[0].map, 'beach');
    assert.equal((await c.post('/api/campaign/result', { mission: 1, won: true, kills: 5, deaths: 0, continues: 0, timeS: 90, log: 'x' })).status, 400);
  } finally { await s.close(); }
});

test('history filters and pages with a cursor', async () => {
  const s = await startServer();
  try {
    const { c, user } = await player(s, 'pager');
    const base = Date.now() - 100000;
    const add = async (mode, i, extra = {}) => {
      const id = await s.db.addScore({ userId: user.id, mode, kills: i, deaths: 0, durationS: 10, ...extra });
      await s.db.models.Score.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { createdAt: new Date(base + i * 1000) } });
    };
    for (let i = 1; i <= 5; i++) await add('quick', i);
    await add('survival', 6, { wave: 4 });
    await add('online', 7, { multiplayer: true, matchId: 'room-7' });
    await add('team', 8);

    const seen = [];
    let next = null;
    do {
      const page = (await c.get(`/api/scores/history?limit=3${next ? `&before=${next}` : ''}`)).body;
      assert.ok(page.rows.length <= 3);
      seen.push(...page.rows.map((r) => r.kills));
      next = page.next;
    } while (next);
    assert.deepEqual(seen, [8, 7, 6, 5, 4, 3, 2, 1]);

    const kills = async (q) => (await c.get(`/api/scores/history?${q}`)).body.rows.map((r) => r.kills);
    assert.deepEqual(await kills('filter=online'), [7]);
    assert.deepEqual(await kills('filter=solo'), [8, 6, 5, 4, 3, 2, 1]);
    assert.deepEqual(await kills('filter=survival'), [6]);
    assert.deepEqual(await kills('filter=team'), [8]);
    assert.deepEqual(await kills('filter=quick&limit=2'), [5, 4]);
    assert.deepEqual(await kills('filter=nonsense&limit=1'), [8]);
    assert.deepEqual(await kills('before=garbage&limit=1'), [8]);
  } finally { await s.close(); }
});

test('the leaderboard has one row per player, a career view, my own rank, and no guests', async () => {
  const s = await startServer();
  try {
    const players = [];
    for (const name of ['ace', 'bee', 'cat', 'dan']) players.push(await player(s, name));
    const [ace, bee, cat, dan] = players.map((p) => p.user.id);
    const add = (userId, kills, won = false, mode = 'quick', wave = 0) => s.db.addScore({ userId, mode, kills, deaths: 1, durationS: 60, won, wave });
    await add(ace, 10); await add(ace, 30); await add(ace, 5, true);
    await add(bee, 20, true); await add(bee, 21, true);
    await add(cat, 25);
    await add(dan, 1);
    await add(ace, 50, false, 'survival', 2); await add(bee, 5, false, 'survival', 9);
    const guest = client(s.base);
    await guest.post('/api/auth/guest');
    await guest.post('/api/scores', { mode: 'quick', kills: 99, deaths: 0, durationS: 60 });

    const best = (await players[3].c.get('/api/scores/leaderboard?mode=quick&limit=2')).body;
    assert.equal(best.by, 'best');
    assert.deepEqual(best.rows.map((r) => [r.rank, r.username, r.kills, r.games]), [[1, 'ace', 30, 3], [2, 'cat', 25, 1]]);
    assert.deepEqual([best.me.rank, best.me.username, best.me.kills], [4, 'dan', 1]);
    for (const r of [...best.rows, best.me]) assert.ok(!('id' in r) && !('matchId' in r) && !('user' in r), 'leaderboard rows carry no ids');

    const all = (await client(s.base).get('/api/scores/leaderboard?mode=quick')).body;
    assert.deepEqual(all.rows.map((r) => r.username), ['ace', 'cat', 'bee', 'dan']);
    assert.equal(all.me, null);

    const survival = (await players[0].c.get('/api/scores/leaderboard?mode=survival')).body;
    assert.deepEqual(survival.rows.map((r) => r.username), ['bee', 'ace']);
    assert.equal(survival.me.rank, 2);

    const career = (await players[0].c.get('/api/scores/leaderboard?mode=quick&by=career')).body;
    assert.equal(career.by, 'career');
    assert.deepEqual(career.rows.map((r) => [r.rank, r.username, r.wins, r.kills, r.games]), [[1, 'bee', 2, 41, 2], [2, 'ace', 1, 45, 3], [3, 'cat', 0, 25, 1], [4, 'dan', 0, 1, 1]]);
    assert.deepEqual([career.me.rank, career.me.username], [2, 'ace']);
    const everything = (await players[0].c.get('/api/scores/leaderboard?mode=all&by=career')).body;
    assert.equal(everything.mode, 'all');
    assert.equal(everything.me.games, 4);

    const guestBoard = (await guest.get('/api/scores/leaderboard?mode=quick')).body;
    assert.ok(!guestBoard.rows.some((r) => r.kills === 99));
    assert.equal(guestBoard.me, null);
    const today = (await client(s.base).get('/api/scores/leaderboard?mode=quick&period=today')).body;
    assert.equal(today.period, 'today');
    assert.equal(today.rows.length, 4);

    const pub = await (await fetch(`${s.base}/api/public/leaderboard?mode=quick`)).json();
    assert.deepEqual(pub.rows.map((r) => [r.rank, r.username]), [[1, 'ace'], [2, 'cat'], [3, 'bee'], [4, 'dan']]);
  } finally { await s.close(); }
});

test('deleting an account removes its solo matches and anonymises it in online matches', async () => {
  const s = await startServer();
  try {
    const leaver = await player(s, 'leaver');
    const stayer = await player(s, 'stayer');
    const solo = (await leaver.c.post('/api/scores', { mode: 'quick', kills: 1, deaths: 0, durationS: 20, log: LOG })).body.matchId;
    const matchId = await s.db.addMatch({
      mode: 'online', multiplayer: true, map: 'docks', difficulty: 'medium', durationS: 120, teamMode: false, winner: 'leaver', owner: null,
      roster: [
        { name: 'leaver', kills: 5, deaths: 1, bot: false, userId: leaver.user.id },
        { name: 'stayer', kills: 2, deaths: 4, bot: false, userId: stayer.user.id },
        { name: 'Bot Mango', kills: 1, deaths: 3, bot: true },
      ],
      log: [{ t: 3, type: 'kill', by: 'leaver', target: 'stayer', weapon: 'rifle' }, { t: 9, type: 'kill', by: 'stayer', target: 'leaver' }, { t: 10, type: 'leave', by: 'leaver' }],
    });
    for (const p of [leaver, stayer]) await s.db.addScore({ userId: p.user.id, mode: 'online', kills: 1, deaths: 1, durationS: 120, matchId, multiplayer: true });

    const before = (await stayer.c.get(`/api/matches/${matchId}`)).body.match;
    assert.deepEqual(before.roster.map((r) => [r.name, !!r.me]), [['leaver', false], ['stayer', true], ['Bot Mango', false]]);

    const res = await leaver.c.del('/api/auth/account', { password: 'bananas123' });
    assert.equal(res.status, 200);
    assert.equal(await s.db.models.Match.countDocuments({ matchId: solo }), 0);
    const after = (await stayer.c.get(`/api/matches/${matchId}`)).body.match;
    assert.deepEqual(after.roster.map((r) => r.name), ['Deleted soldier', 'stayer', 'Bot Mango']);
    assert.equal(after.winner, 'Deleted soldier');
    assert.deepEqual(after.log.map((e) => [e.by, e.target]), [['Deleted soldier', 'stayer'], ['stayer', 'Deleted soldier'], ['Deleted soldier', undefined]]);
    const raw = await s.db.models.Match.findOne({ matchId }).lean();
    assert.ok(!raw.roster.some((r) => String(r.userId) === leaver.user.id));
    assert.ok(!JSON.stringify(raw).includes('"leaver"'));
  } finally { await s.close(); }
});

test('bad roster and log input is refused or cleaned, and the body size limit still applies', async () => {
  const s = await startServer();
  try {
    const { c } = await player(s, 'fuzzer');
    const score = { mode: 'quick', kills: 1, deaths: 1, durationS: 30 };
    assert.equal((await c.post('/api/scores', { ...score, log: 'kill everyone' })).status, 400);
    assert.equal((await c.post('/api/scores', { ...score, roster: { name: 'x' } })).status, 400);
    assert.equal((await c.post('/api/scores', { ...score, map: 42 })).status, 400);
    assert.equal((await c.post('/api/scores', { ...score, draw: 'yes' })).status, 400);
    assert.equal((await s.db.models.Match.countDocuments()), 0);

    const log = [
      { t: -5, type: 'kill', by: 'x'.repeat(100), target: { $ne: 1 }, weapon: 7, ok: 'yes', extra: 'drop me' },
      { t: 99999, type: 'hack', by: 'evil' },
      { type: 'kill' }, 'nonsense', null, [1, 2],
      { t: 5, type: 'wave', detail: '  Wave 3\n ' },
      ...Array.from({ length: 400 }, (_, i) => ({ t: i, type: 'crate', by: 'fuzzer', detail: 'shield' })),
    ];
    const roster = [
      { name: '  fuzzer  ', kills: -3, deaths: 1e9, bot: 'no', me: true, team: 'green', userId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
      { name: '', kills: 1 }, { kills: 2 }, 'x',
      ...Array.from({ length: 20 }, (_, i) => ({ name: `Bot ${i}`, kills: 1.6, deaths: 0, bot: true })),
    ];
    const saved = await c.post('/api/scores', { ...score, map: 'x'.repeat(80), roster, log });
    assert.equal(saved.status, 201);
    const { match } = (await c.get(`/api/matches/${saved.body.matchId}`)).body;
    assert.equal(match.map.length, 40);
    assert.equal(match.log.length, 300);
    assert.deepEqual(match.log[0], { t: 0, type: 'kill', by: 'x'.repeat(40) });
    assert.deepEqual(match.log[1], { t: 5, type: 'wave', detail: 'Wave 3' });
    assert.ok(match.log.every((e) => e.type !== 'hack'));
    assert.equal(match.roster.length, 12);
    assert.deepEqual(match.roster[0], { name: 'fuzzer', kills: 0, deaths: 999, bot: false, me: true });
    assert.equal(match.roster[1].kills, 2);

    const huge = await c.post('/api/scores', { ...score, log: Array.from({ length: 3000 }, () => ({ t: 1, type: 'kill', by: 'x'.repeat(40) })) });
    assert.equal(huge.status, 413);
    assert.equal((await c.post('/api/auth/login', { username: 'a'.repeat(5000), password: 'x' })).status, 413);
  } finally { await s.close(); }
});

test('download my data includes the match history and battle logs', async () => {
  const s = await startServer();
  try {
    const { c } = await player(s, 'exporter2');
    const { matchId } = (await c.post('/api/scores', { mode: 'quick', kills: 3, deaths: 1, durationS: 40, roster: ROSTER, log: LOG })).body;
    const data = (await c.get('/api/auth/export')).body;
    assert.equal(data.history.length, 1);
    assert.equal(data.history[0].matchId, matchId);
    assert.equal(data.matches.length, 1);
    assert.equal(data.matches[0].log.length, 4);
    assert.equal(data.matches[0].roster[0].me, true);
    assert.ok(!JSON.stringify(data).includes('userId'));
  } finally { await s.close(); }
});

test('a lost solo battle names the best other soldier as winner, fewer deaths breaking a kill tie', async () => {
  const s = await startServer();
  try {
    const { c } = await player(s, 'loser');
    const roster = [{ name: 'loser', kills: 0, deaths: 0, me: true }, { name: 'Blaze', kills: 0, deaths: 1, bot: true }, { name: 'Viper', kills: 0, deaths: 0, bot: true }];
    const saved = await c.post('/api/scores', { mode: 'quick', kills: 0, deaths: 0, durationS: 5, won: false, roster, log: LOG });
    assert.equal((await c.get(`/api/matches/${saved.body.matchId}`)).body.match.winner, 'Viper');
  } finally { await s.close(); }
});
