// Service layer: a puzzle pool in front of the Banana API (interoperability theme).
// It pre-fetches puzzles so players do not wait, limits parallel calls, uses a circuit
// breaker when the API keeps failing, and falls back to a reserve of saved puzzles.

const { BananaApiError } = require('./bananaApi');

// Number of recent calls used for latency and success statistics.
const WINDOW = 20;

/**
 * Creates the puzzle pool.
 * @param {object} opts
 * @param {Function} opts.fetchPuzzle the Banana API client's fetchPuzzle()
 * @param {number} opts.size puzzles kept ready in advance (3)
 * @param {number} opts.reserveSize recent puzzles kept as a fallback (25)
 * @param {number} opts.maxInFlight max API calls at the same time (3)
 * @param {number} opts.takeDeadlineMs how long a player waits before getting a reserve puzzle (2.5 s)
 * @param {number} opts.failureThreshold failures in a row that open the circuit (3)
 * @param {number} opts.coolDownMs how long the circuit stays open (30 s)
 * @param {object|null} opts.store MongoDB reserve puzzle store (save/load)
 * @returns {object} take, warmUp, loadReserve, status, history, sample, startSampling
 */
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
  // ready: fresh puzzles waiting; reserve: recent puzzles for fallback; waiting: players waiting for one.
  const ready = [];
  const reserve = [];
  const waiting = [];
  const recent = [];
  let inFlight = 0;
  let online = null;
  let lastError = null;
  let lastSuccess = null;

  // Circuit breaker state: 'closed' = normal, 'open' = API paused after failures,
  // 'half-open' = cool-down over, allow one test call ("probe").
  let circuit = 'closed';
  let failuresInRow = 0;
  let openedAt = 0;
  let probing = false;

  // Adds a good puzzle to the reserve (max 25) and saves it to MongoDB too.
  function remember(puzzle, { save = true } = {}) {
    reserve.push(puzzle);
    if (reserve.length > reserveSize) reserve.shift();
    if (save && store) store.save({ image: puzzle.image, solution: puzzle.solution }).catch(() => {});
  }

  /** On start-up, loads saved reserve puzzles from MongoDB so a fallback exists at once. */
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

  // True while the circuit is open and the 30 s cool-down has not finished.
  const coolingDown = () => circuit === 'open' && now() - openedAt < coolDownMs;

  /**
   * Circuit breaker gate: may we call the API now?
   * closed -> yes; open -> no until the cool-down ends, then half-open;
   * half-open -> only one probe call at a time.
   */
  function allowCall() {
    if (circuit === 'closed') return true;
    if (circuit === 'open' && !coolingDown()) circuit = 'half-open';
    if (circuit === 'half-open' && !probing) { probing = true; return true; }
    return false;
  }

  /**
   * Calls the Banana API through the circuit breaker and updates the health stats.
   * Success closes the circuit; reaching the failure threshold (or a failed probe) opens it.
   * @throws {BananaApiError} kind 'circuit-open' when calls are paused
   */
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

  // Starts a fetch and keeps the in-flight count right.
  function startFetch() {
    inFlight += 1;
    return fetchLive().finally(() => { inFlight -= 1; });
  }

  // Gives a new puzzle to the first waiting player, or stores it as ready.
  function deliver(puzzle) {
    if (waiting.length) waiting.shift().resolve(puzzle);
    else ready.push(puzzle);
  }

  /**
   * Keeps the ready queue topped up in the background, never with more than
   * maxInFlight calls at once, and not at all while the circuit is cooling down.
   */
  function refill() {
    while (ready.length + inFlight < size + waiting.length && inFlight < maxInFlight) {
      if (coolingDown()) break;
      inFlight += 1;
      fetchLive().then(
        (p) => { inFlight -= 1; deliver(p); refill(); },
        (err) => {
          inFlight -= 1;
          // If the circuit just opened, fail every waiting player now; otherwise only one.
          const give = circuit === 'open' ? waiting.splice(0) : waiting.splice(0, 1);
          for (const w of give) w.reject(err);
        },
      );
      // If the API is offline, do not start a burst of calls that will all fail.
      if (online === false) break;
    }
  }

  // A random puzzle from the reserve, marked source: 'reserve'.
  function fromReserve() {
    return reserve.length ? { ...reserve[Math.floor(Math.random() * reserve.length)], source: 'reserve' } : null;
  }

  /**
   * Gives one puzzle to a player.
   * 1. Use a ready puzzle if there is one.
   * 2. Otherwise fetch live, but race it against a 2.5 s deadline.
   * 3. If the deadline wins or the API fails, use a reserve puzzle instead.
   * @returns {Promise<{image, solution, source: 'live'|'reserve'}>}
   * @throws only if the API failed and the reserve is empty
   */
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
      // Deadline passed: stop waiting, but keep the late live puzzle for the next player.
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

  /** Health snapshot for the status/admin page: online, queue sizes, latency, success rate, circuit state. */
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

  // Samples the status every 30 s (last 120 kept) for the admin health chart.
  const samples = [];
  function sample() {
    const s = status();
    samples.push({ at: new Date(now()).toISOString(), online: s.online, ready: s.ready, reserve: s.reserve, p50LatencyMs: s.p50LatencyMs, successRate: s.successRate, circuit: s.circuit.state });
    if (samples.length > 120) samples.shift();
  }
  function startSampling(everyMs = 30_000) {
    const first = setTimeout(sample, 5000);
    const timer = setInterval(sample, everyMs);
    // unref() means these timers do not keep Node running on shutdown.
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
