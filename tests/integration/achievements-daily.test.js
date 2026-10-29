// Tests for achievements (unlocked by server events, only once) and the Daily
// Banana Challenge (same puzzles for everyone, one attempt a day, scored on the server).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, fakeApi } = require('./helpers');

async function login(s, username) {
  const c = client(s.base);
  await c.post('/api/auth/register', { username, password: 'bananas123' });
  return c;
}

test('saving a score unlocks achievements once, from numbers the server checks', async () => {
  const s = await startServer();
  try {
    const c = await login(s, 'ace');
    const first = await c.post('/api/scores', { mode: 'survival', kills: 12, deaths: 1, wave: 6, durationS: 200 });
    assert.deepEqual(first.body.unlocked.map((a) => a.id).sort(), ['first_blood', 'sharpshooter', 'survivor']);
    const again = await c.post('/api/scores', { mode: 'survival', kills: 12, deaths: 1, wave: 6, durationS: 200 });
    assert.deepEqual(again.body.unlocked, []);                  // write-once
    const list = await c.get('/api/achievements');
    assert.ok(list.body.all.length >= 10);
    assert.equal(list.body.mine.length, 3);
  } finally { await s.close(); }
});

test('five correct puzzles in a row unlock Banana Brain', async () => {
  const s = await startServer({ bananaApi: fakeApi(4) });
  try {
    const c = await login(s, 'brainy');
    let unlocked = [];
    for (let i = 0; i < 5; i++) {
      const { puzzleId } = (await c.get('/api/puzzle')).body;
      unlocked = (await c.post('/api/puzzle/answer', { puzzleId, answer: 4 })).body.unlocked;
    }
    assert.ok(unlocked.some((a) => a.id === 'banana_brain'));
  } finally { await s.close(); }
});

test('the daily challenge: 5 puzzles, doubling points, one attempt a day, no solution sent', async () => {
  const s = await startServer({ bananaApi: fakeApi(6) });
  try {
    const c = await login(s, 'daily1');
    assert.equal((await c.get('/api/daily')).body.played, false);
    const start = await c.post('/api/daily/start');
    assert.equal(start.status, 200);
    assert.equal(start.body.total, 5);
    assert.equal('solution' in start.body, false);
    let r;
    for (const answer of [6, 6, 1, 6, 6]) r = (await c.post('/api/daily/answer', { answer })).body;
    assert.equal(r.finished, true);
    assert.equal(r.solved, 4);
    assert.equal(r.score, 100 + 200 + 0 + 100 + 200);          // the miss resets the bonus
    assert.equal(r.streak, 1);
    assert.equal((await c.post('/api/daily/start')).status, 409);   // one attempt a day
    const status = (await c.get('/api/daily')).body;
    assert.deepEqual([status.played, status.result.score, status.streak], [true, 600, 1]);
    const board = (await c.get('/api/daily/leaderboard')).body.rows;
    assert.equal(board[0].username, 'daily1');

    // A second player gets the same puzzles (stored once for the day).
    const c2 = await login(s, 'daily2');
    const start2 = await c2.post('/api/daily/start');
    assert.equal(start2.body.image, start.body.image);
  } finally { await s.close(); }
});

test('daily: answers sent at the same time cannot score one puzzle twice', async () => {
  const s = await startServer({ bananaApi: fakeApi(3) });
  try {
    const c = await login(s, 'racer');
    await c.post('/api/daily/start');
    const replies = await Promise.all(Array.from({ length: 10 }, (_, d) => c.post('/api/daily/answer', { answer: d })));
    const ok = replies.filter((r) => r.status === 200);
    // Later requests may answer the next puzzles, but no puzzle is ever answered twice.
    const answered = ok.map((r) => (r.body.finished ? 5 : r.body.next.index));
    assert.equal(new Set(answered).size, ok.length);
    assert.equal(ok.length + replies.filter((r) => r.status === 409 || r.status === 400).length, 10);
    assert.ok(Math.max(...ok.map((r) => r.body.solved)) <= ok.length);
  } finally { await s.close(); }
});

test('daily: a Banana API outage does not use up the day\'s attempt', async () => {
  let down = true;
  const api = { fetchPuzzle: async () => { if (down) throw new Error('offline'); return { image: 'data:image/png;base64,AAAA', solution: 2 }; } };
  const s = await startServer({ bananaApi: api });
  try {
    const c = await login(s, 'patient');
    assert.equal((await c.post('/api/daily/start')).status, 502);
    down = false;
    assert.equal((await c.post('/api/daily/start')).status, 200);   // still allowed after the outage
  } finally { await s.close(); }
});
