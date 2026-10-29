// Tests for the puzzle API, using a fake Banana API so they run without the network.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPuzzleStore } = require('../../server/services/puzzles');
const { parsePuzzle, BananaApiError } = require('../../server/services/bananaApi');
const { createPuzzlePool } = require('../../server/services/pool');

const IMAGE = 'https://www.sanfoh.com/uob/banana/data/t1.png';

const { startServer, client, fakeApi, IMAGE: IMG } = require('./helpers');

// Starts the app and returns a client that is already logged in.
async function withPlayer(bananaApi, fn) {
  const s = await startServer({ bananaApi });
  try {
    const c = client(s.base);
    await c.post('/api/auth/register', { username: 'tester', password: 'bananas123' });
    await fn(c);
  } finally { await s.close(); }
}

test('GET /api/puzzle returns the image but never the solution', async () => {
  await withPlayer(fakeApi(7), async (c) => {
    const res = await c.get('/api/puzzle?purpose=crate');
    assert.equal(res.status, 200);
    assert.equal(res.body.image, IMG);
    assert.equal(res.body.purpose, 'crate');
    assert.equal(res.body.source, 'live');
    assert.equal(typeof res.body.puzzleId, 'string');
    assert.equal('solution' in res.body, false);
  });
});

test('a correct answer is accepted and the puzzle cannot be reused', async () => {
  await withPlayer(fakeApi(7), async (c) => {
    const { puzzleId } = (await c.get('/api/puzzle')).body;
    const first = await c.post('/api/puzzle/answer', { puzzleId, answer: 7 });
    const { unlocked, ...answer } = first.body;
    assert.deepEqual(answer, { correct: true, solution: 7, purpose: 'deploy' });
    assert.deepEqual(unlocked.map((a) => a.id), ['speed_demon']);   // answered in under 3 s
    assert.equal((await c.post('/api/puzzle/answer', { puzzleId, answer: 7 })).status, 404);
  });
});

test('a wrong answer is rejected and the solution is revealed', async () => {
  await withPlayer(fakeApi(3), async (c) => {
    const { puzzleId } = (await c.get('/api/puzzle?purpose=respawn')).body;
    const res = await c.post('/api/puzzle/answer', { puzzleId, answer: 5 });
    const { unlocked, ...answer } = res.body;
    assert.deepEqual(answer, { correct: false, solution: 3, purpose: 'respawn' });
    assert.deepEqual(unlocked, []);
  });
});

test('bad answers are refused with 400', async () => {
  await withPlayer(fakeApi(), async (c) => {
    assert.equal((await c.post('/api/puzzle/answer', { puzzleId: 'x', answer: '7' })).status, 400);
    assert.equal((await c.post('/api/puzzle/answer', { answer: 7 })).status, 400);
  });
});

test('an unknown purpose falls back to deploy', async () => {
  await withPlayer(fakeApi(), async (c) => {
    assert.equal((await c.get('/api/puzzle?purpose=hack')).body.purpose, 'deploy');
  });
});

test('a Banana API failure becomes a 502 with a friendly message', async () => {
  const broken = { fetchPuzzle: async () => { throw new BananaApiError('Banana API is unreachable'); } };
  await withPlayer(broken, async (c) => {
    const res = await c.get('/api/puzzle');
    assert.equal(res.status, 502);
    assert.match(res.body.error, /not responding/);
  });
});

test('puzzles expire after the time limit', () => {
  let clock = 0;
  const store = createPuzzleStore({ ttlMs: 1000, now: () => clock });
  const id = store.add(4, 'deploy');
  clock = 2000;
  assert.equal(store.answer(id, 4), null);
});

test('the Banana API response is parsed from JSON, CSV and base64', () => {
  const png = 'iVBORw0KGgo' + 'A'.repeat(120);
  assert.deepEqual(parsePuzzle(JSON.stringify({ question: IMAGE, solution: 2 }), 'json'), { image: IMAGE, solution: 2 });
  assert.deepEqual(parsePuzzle(`${IMAGE},9`, 'csv'), { image: IMAGE, solution: 9 });
  assert.deepEqual(parsePuzzle(JSON.stringify({ question: png, solution: 0 }), 'json', true), { image: `data:image/png;base64,${png}`, solution: 0 });
  assert.throws(() => parsePuzzle('{"question":"nope","solution":1}', 'json'), BananaApiError);
  assert.throws(() => parsePuzzle(JSON.stringify({ question: IMAGE, solution: 12 }), 'json'), BananaApiError, 'the answer must be one digit');
  assert.throws(() => parsePuzzle(JSON.stringify({ question: 'not base64!', solution: 1 }), 'json', true), BananaApiError);
});

test('the pool keeps puzzles ready so the next one is instant', async () => {
  let calls = 0;
  const pool = createPuzzlePool({ fetchPuzzle: async () => ({ image: `${IMAGE}?n=${++calls}`, solution: 1 }), size: 2 });
  pool.warmUp();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(pool.status().ready, 2);
  const p = await pool.take();
  assert.equal(p.source, 'live');
  assert.equal(pool.status().online, true);
});

test('when the Banana API goes down the pool serves reserve puzzles', async () => {
  let up = true;
  const pool = createPuzzlePool({
    fetchPuzzle: async () => { if (!up) throw new BananaApiError('Banana API is unreachable', { kind: 'network' }); return { image: IMAGE, solution: 4 }; },
    size: 0,
  });
  await pool.take();          // one live puzzle goes into the reserve
  up = false;
  const p = await pool.take();
  assert.equal(p.source, 'reserve');
  assert.equal(p.solution, 4);
  assert.equal(pool.status().online, false);
  assert.equal(pool.status().lastError, 'network');   // a category, never the raw message
});

test('with no reserve, an outage is reported as an error', async () => {
  const pool = createPuzzlePool({ fetchPuzzle: async () => { throw new BananaApiError('down'); }, size: 0 });
  await assert.rejects(pool.take(), BananaApiError);
});

test('GET /api/status reports the API state', async () => {
  await withPlayer(fakeApi(), async (c) => {
    await c.get('/api/puzzle');
    const status = (await c.get('/api/status')).body;
    assert.equal(status.online, true);
    assert.equal(typeof status.reserve, 'number');
    assert.equal(status.successRate, 100);
    assert.equal(typeof status.avgLatencyMs, 'number');
    assert.equal(status.circuit.state, 'closed');
  });
});

test('unknown pages are a 404: the React page for browsers, JSON under /api', async () => {
  const s = await startServer();
  try {
    const page = await fetch(`${s.base}/no-such-page`, { headers: { Accept: 'text/html' } });
    assert.equal(page.status, 404);
    const api = await fetch(`${s.base}/api/no-such-thing`);
    assert.equal(api.status, 404);
    assert.deepEqual(await api.json(), { error: 'Not found' });
  } finally { await s.close(); }
});
