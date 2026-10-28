// Tests for how the server copes with a slow, broken or down Banana API:
// timeouts, retries with backoff, and the circuit breaker in the puzzle pool.
// The network is faked, so these run offline and without real waiting.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBananaApi, BananaApiError } = require('../server/services/bananaApi');

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
