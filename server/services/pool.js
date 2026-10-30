// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { BananaApiError } = require('./bananaApi');

const WINDOW = 20;

function createPuzzlePool({
  fetchPuzzle,
  apiStats = null,
  size = 3,
  reserveSize = 25,
  maxInFlight = 3,
  takeDeadlineMs = 2500,
  failureThreshold = 3,
  coolDownMs = 30_000,
  now = () => Date.now(),
  store = null,
}) {
  const ready = [];
  const reserve = [];
  const waiting = [];
  const recent = [];
  let inFlight = 0;
  let online = null;
  let lastError = null;
  let lastSuccess = null;

  let circuit = 'closed';
  let failuresInRow = 0;
  let openedAt = 0;
  let probing = false;

  function remember(puzzle, { save = true } = {}) {
    reserve.push(puzzle);
    if (reserve.length > reserveSize) reserve.shift();
    if (save && store) store.save({ image: puzzle.image, solution: puzzle.solution }).catch(() => {});
  }

  async function loadReserve() {
    if (!store) return 0;
    const saved = await store.load(reserveSize);
    for (const p of saved.reverse()) remember({ image: p.image, solution: p.solution }, { save: false });
    return saved.length;
  }

  function measure(ok, ms) {
    recent.push({ ok, ms });
    if (recent.length > WINDOW) recent.shift();
  }

  const coolingDown = () => circuit === 'open' && now() - openedAt < coolDownMs;

  function allowCall() {
    if (circuit === 'closed') return true;
    if (circuit === 'open' && !coolingDown()) circuit = 'half-open';
    if (circuit === 'half-open' && !probing) { probing = true; return true; }
    return false;
  }

  async function fetchLive() {
    if (!allowCall()) throw new BananaApiError('Banana API paused after repeated failures', { kind: 'circuit-open' });
    const isProbe = circuit === 'half-open';
    const started = now();
    try {
      const puzzle = await fetchPuzzle();
      measure(true, now() - started);
      online = true;
      lastError = null;
      lastSuccess = new Date().toISOString();
      failuresInRow = 0;
      circuit = 'closed';
      remember(puzzle);
      return puzzle;
    } catch (err) {
      measure(false, now() - started);
      online = false;
      lastError = err.kind ?? 'other';
      failuresInRow += 1;
      if (isProbe || failuresInRow >= failureThreshold) { circuit = 'open'; openedAt = now(); }
      throw err;
    } finally {
      if (isProbe) probing = false;
    }
  }

  function startFetch() {
    inFlight += 1;
    return fetchLive().finally(() => { inFlight -= 1; });
  }

  function deliver(puzzle) {
    if (waiting.length) waiting.shift().resolve(puzzle);
    else ready.push(puzzle);
  }

  function refill() {
    while (ready.length + inFlight < size + waiting.length && inFlight < maxInFlight) {
      if (coolingDown()) break;
      inFlight += 1;
      fetchLive().then(
        (p) => { inFlight -= 1; deliver(p); refill(); },
        (err) => {
          inFlight -= 1;
          const give = circuit === 'open' ? waiting.splice(0) : waiting.splice(0, 1);
          for (const w of give) w.reject(err);
        },
      );
      if (online === false) break;
    }
  }

  function fromReserve() {
    return reserve.length ? { ...reserve[Math.floor(Math.random() * reserve.length)], source: 'reserve' } : null;
  }

  async function take() {
    const puzzle = ready.shift();
    if (puzzle) { refill(); return { ...puzzle, source: 'live' }; }

    let live;
    let waiter = null;
    if (coolingDown()) live = fetchLive();
    else if (inFlight < maxInFlight) live = startFetch();
    else live = new Promise((resolve, reject) => { waiter = { resolve, reject }; waiting.push(waiter); refill(); });

    let timer;
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve('deadline'), takeDeadlineMs); });
    try {
      const first = await Promise.race([live, deadline]);
      if (first !== 'deadline') { refill(); return { ...first, source: 'live' }; }
      const spare = fromReserve();
      if (!spare) { const p = await live; refill(); return { ...p, source: 'live' }; }
      const i = waiter ? waiting.indexOf(waiter) : -1;
      if (i >= 0) waiting.splice(i, 1);
      else live.then((p) => ready.push(p), () => {});
      refill();
      return spare;
    } catch (err) {
      refill();
      const spare = fromReserve();
      if (!spare) throw err;
      return spare;
    } finally {
      clearTimeout(timer);
    }
  }

  function status() {
    const ok = recent.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
    const last = recent[recent.length - 1];
    return {
      online, ready: ready.length, reserve: reserve.length, lastError, lastSuccess,
      calls: recent.length,
      lastLatencyMs: last ? Math.round(last.ms) : null,
      p50LatencyMs: ok.length ? Math.round(ok[Math.floor((ok.length - 1) / 2)]) : null,
      avgLatencyMs: ok.length ? Math.round(ok.reduce((t, ms) => t + ms, 0) / ok.length) : null,
      successRate: recent.length ? Math.round((ok.length / recent.length) * 100) : null,
      retriesUsed: apiStats?.().retriesUsed ?? 0,
      circuit: { state: coolingDown() || circuit !== 'open' ? circuit : 'half-open', failuresInRow, retryInMs: coolingDown() ? coolDownMs - (now() - openedAt) : 0 },
    };
  }

  const samples = [];
  function sample() {
    const s = status();
    samples.push({ at: new Date(now()).toISOString(), online: s.online, ready: s.ready, reserve: s.reserve, p50LatencyMs: s.p50LatencyMs, successRate: s.successRate, circuit: s.circuit.state });
    if (samples.length > 120) samples.shift();
  }
  function startSampling(everyMs = 30_000) {
    const first = setTimeout(sample, 5000);
    const timer = setInterval(sample, everyMs);
    first.unref?.(); timer.unref?.();
    return () => { clearTimeout(first); clearInterval(timer); };
  }

  return {
    sample,
    startSampling,
    history: () => [...samples],
    take,
    warmUp: refill,
    loadReserve,
    status,
  };
}

module.exports = { createPuzzlePool };
