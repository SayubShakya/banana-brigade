// Tests for how the server copes with a slow, broken or down Banana API:
// timeouts, retries with backoff, and the circuit breaker in the puzzle pool.
// The network is faked, so these run offline and without real waiting.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBananaApi, BananaApiError } = require('../server/services/bananaApi');
const { createPuzzlePool } = require('../server/pool');

const PNG = 'iVBORw0KGgo' + 'A'.repeat(120);
const good = (solution = 5) => ({ ok: true, status: 200, text: async () => JSON.stringify({ question: PNG, solution }) });
const http = (status) => ({ ok: false, status, text: async () => '' });

// A fake fetch that answers from a list, one entry per call, and remembers what it was asked.
function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(opts) : next;
  };
  return { fetchImpl, calls };
}
const noWait = { sleep: async () => {}, random: () => 0 };

test('a transient failure is retried and the puzzle still arrives', async () => {
  const waits = [];
  const { fetchImpl, calls } = fakeFetch([new TypeError('fetch failed'), http(503), good(4)]);
  const api = createBananaApi({ fetchImpl, sleep: async (ms) => { waits.push(ms); }, random: () => 0 });
  const p = await api.fetchPuzzle();
  assert.equal(p.solution, 4);
  assert.match(p.image, /^data:image\/png;base64,/);
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [300, 900]);                         // exponential backoff
  assert.equal(api.stats().retriesUsed, 2);
  assert.equal(api.stats().successRate, 1);
});

test('the request asks for JSON with a base64 image and no stored copy', async () => {
  const { fetchImpl, calls } = fakeFetch([good()]);
  await createBananaApi({ fetchImpl, ...noWait }).fetchPuzzle();
  assert.match(calls[0].url, /\?out=json&base64=yes$/);
  assert.equal(calls[0].opts.headers['Cache-Control'], 'no-store');
});

test('malformed data is not retried', async () => {
  const bad = { ok: true, status: 200, text: async () => '{"question":"x","solution":42}' };
  const { fetchImpl, calls } = fakeFetch([bad, good()]);
  const api = createBananaApi({ fetchImpl, ...noWait });
  await assert.rejects(api.fetchPuzzle(), (err) => err instanceof BananaApiError && err.kind === 'bad-data');
  assert.equal(calls.length, 1);
  assert.equal(api.stats().successRate, 0);
});

test('a 4xx answer is not retried, but 429 (too many requests) is', async () => {
  const { fetchImpl, calls } = fakeFetch([http(404)]);
  await assert.rejects(createBananaApi({ fetchImpl, ...noWait }).fetchPuzzle(), (err) => err.kind === 'http-4xx');
  assert.equal(calls.length, 1);
  const busy = fakeFetch([http(429), good(1)]);
  assert.equal((await createBananaApi({ fetchImpl: busy.fetchImpl, ...noWait }).fetchPuzzle()).solution, 1);
  assert.equal(busy.calls.length, 2);
});

test('a hung request is aborted by the timeout', async () => {
  // Never answers on its own; only the abort signal ends it.
  const hang = (opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const { fetchImpl, calls } = fakeFetch([hang, hang]);
  const api = createBananaApi({ fetchImpl, timeoutMs: 30, retries: 1, ...noWait });
  const started = Date.now();
  await assert.rejects(api.fetchPuzzle(), (err) => err.kind === 'timeout' && /30 ms/.test(err.message));
  assert.equal(calls.length, 2);                               // a timeout is worth one more try
  assert.ok(Date.now() - started < 1000);
  assert.ok(calls[0].opts.signal.aborted);
});

test('small format differences are normalised', async () => {
  const odd = { ok: true, status: 200, text: async () => JSON.stringify({ question: `data:image/png;base64,${PNG.slice(0, 50)}\n${PNG.slice(50)}`, solution: '3' }) };
  const { fetchImpl } = fakeFetch([odd]);
  const p = await createBananaApi({ fetchImpl, ...noWait }).fetchPuzzle();
  assert.deepEqual(p, { image: `data:image/png;base64,${PNG}`, solution: 3 });
});

// ----- the puzzle pool: circuit breaker, deadline, in-flight limit, status -----

const PUZZLE = { image: 'data:image/png;base64,xyz', solution: 6 };
const down = () => new BananaApiError('Banana API is unreachable', { kind: 'network' });

test('the circuit opens after K failures in a row, serves the reserve, then probes', async () => {
  let clock = 0;
  let up = true;
  let calls = 0;
  const pool = createPuzzlePool({
    fetchPuzzle: async () => { calls += 1; clock += 40; if (!up) throw down(); return PUZZLE; },
    size: 0, failureThreshold: 3, coolDownMs: 30_000, now: () => clock,
  });
  await pool.take();                                  // fills the reserve
  up = false;
  for (let i = 0; i < 3; i++) assert.equal((await pool.take()).source, 'reserve');
  assert.equal(pool.status().circuit.state, 'open');
  assert.equal(calls, 4);

  // While open, the API is not called at all and players still get puzzles.
  assert.equal((await pool.take()).source, 'reserve');
  assert.equal(calls, 4);
  assert.equal(pool.status().lastError, 'network');       // still the real cause, not the pause

  // After the cool-down one probe goes out; it works, so the circuit closes.
  clock += 30_000;
  up = true;
  assert.equal((await pool.take()).source, 'live');
  assert.equal(calls, 5);
  assert.equal(pool.status().circuit.state, 'closed');
});

test('a failed probe opens the circuit again', async () => {
  let clock = 0;
  const pool = createPuzzlePool({ fetchPuzzle: async () => { throw down(); }, size: 0, failureThreshold: 2, coolDownMs: 1000, now: () => clock });
  await assert.rejects(pool.take());
  await assert.rejects(pool.take());
  assert.equal(pool.status().circuit.state, 'open');
  clock += 1000;
  assert.equal(pool.status().circuit.state, 'half-open');
  await assert.rejects(pool.take(), (err) => err.kind === 'network');   // the probe really called the API
  assert.equal(pool.status().circuit.state, 'open');
  assert.equal(pool.status().circuit.retryInMs, 1000);
});

test('a slow API does not keep the player waiting when there is a reserve', async () => {
  let slow = false;
  const pool = createPuzzlePool({
    fetchPuzzle: () => (slow ? new Promise((r) => setTimeout(() => r(PUZZLE), 200)) : Promise.resolve(PUZZLE)),
    size: 0, takeDeadlineMs: 20,
  });
  await pool.take();
  slow = true;
  const started = Date.now();
  assert.equal((await pool.take()).source, 'reserve');
  assert.ok(Date.now() - started < 150);
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(pool.status().ready, 1);               // the late live puzzle was kept, not wasted
});

test('many players at once do not flood the API', async () => {
  let calls = 0;
  let open = 0;
  let most = 0;
  const pool = createPuzzlePool({
    fetchPuzzle: async () => {
      calls += 1; open += 1; most = Math.max(most, open);
      await new Promise((r) => setTimeout(r, 5));
      open -= 1;
      return PUZZLE;
    },
    size: 0, maxInFlight: 2,
  });
  const got = await Promise.all(Array.from({ length: 6 }, () => pool.take()));
  assert.equal(got.length, 6);
  assert.ok(got.every((p) => p.source === 'live'));
  assert.ok(most <= 2, `at most 2 calls at once, saw ${most}`);
});

test('status reports latency, success rate and retries', async () => {
  let clock = 0;
  const steps = [120, 80, 'fail', 100];
  const pool = createPuzzlePool({
    fetchPuzzle: async () => { const s = steps.shift(); if (s === 'fail') { clock += 10; throw down(); } clock += s; return PUZZLE; },
    apiStats: () => ({ retriesUsed: 2 }),
    size: 0, now: () => clock,
  });
  for (let i = 0; i < 4; i++) await pool.take();
  const st = pool.status();
  assert.equal(st.calls, 4);
  assert.equal(st.successRate, 75);
  assert.equal(st.lastLatencyMs, 100);
  assert.equal(st.avgLatencyMs, 100);
  assert.equal(st.p50LatencyMs, 100);
  assert.equal(st.retriesUsed, 2);
  assert.equal(st.circuit.state, 'closed');
});
