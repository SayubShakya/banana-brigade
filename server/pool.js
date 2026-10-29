// Keeps Banana API puzzles ready before anyone asks for one.
//
// - `ready`: a few fresh puzzles fetched in the background, so the puzzle screen
//   opens instantly instead of waiting for the API.
// - `reserve`: recently fetched puzzles kept for emergencies. The Banana API notes
//   that it "may be discontinued without notice"; if it stops answering, the game
//   keeps working from the reserve and the menu shows the API as offline.
// - a deadline on take(): a slow API with retries could keep a player waiting for
//   two timeouts plus backoff, so after a short wait a reserve puzzle is used instead
//   (the live puzzle still arrives later and goes into `ready`).
// - a limit on calls in flight: if many players ask while `ready` is empty, they
//   queue for the next puzzle instead of each firing a new request at the API.
// - a circuit breaker: after a few failures in a row the pool stops calling the API
//   for a cool-down and serves the reserve straight away. That spares a struggling
//   API from more traffic, and spares players from waiting through timeouts and
//   retries that are very likely to fail again. After the cool-down one "probe"
//   call is let through (half-open); if it works, normal calls resume.
//
//   closed --K failures in a row--> open --cool-down over--> half-open
//      ^                                                        |
//      +---------------- probe succeeds ------------------------+  (probe fails -> open)
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { BananaApiError } = require('./services/bananaApi');

const WINDOW = 20;   // the status numbers describe the last 20 real calls

function createPuzzlePool({
  fetchPuzzle,
  apiStats = null,          // optional: () => ({ retriesUsed }) from the Banana API client
  size = 3,
  reserveSize = 25,
  maxInFlight = 3,
  takeDeadlineMs = 2500,
  failureThreshold = 3,
  coolDownMs = 30_000,
  now = () => Date.now(),
}) {
  const ready = [];
  const reserve = [];
  const waiting = [];       // players queued for the next live puzzle: { resolve, reject }
  const recent = [];        // { ok, ms } for the last WINDOW real calls
  let inFlight = 0;
  let online = null;        // unknown until the first call
  let lastError = null;     // a short category only (e.g. 'timeout'), safe to show publicly
  let lastSuccess = null;

  // Circuit breaker state.
  let circuit = 'closed';
  let failuresInRow = 0;
  let openedAt = 0;
  let probing = false;

  function remember(puzzle) {
    reserve.push(puzzle);
    if (reserve.length > reserveSize) reserve.shift();
  }

  function measure(ok, ms) {
    recent.push({ ok, ms });
    if (recent.length > WINDOW) recent.shift();
  }

  const coolingDown = () => circuit === 'open' && now() - openedAt < coolDownMs;

  // Decides whether a real call may go out right now.
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

  // A live call made for one waiting player (not for `ready`).
  function startFetch() {
    inFlight += 1;
    return fetchLive().finally(() => { inFlight -= 1; });
  }

  // A finished background puzzle goes to the first queued player, or into `ready`.
  function deliver(puzzle) {
    if (waiting.length) waiting.shift().resolve(puzzle);
    else ready.push(puzzle);
  }

  function refill() {
    while (ready.length + inFlight < size + waiting.length && inFlight < maxInFlight) {
      if (coolingDown()) break;   // nothing to gain until the cool-down is over
      // The count only drops once the puzzle is delivered, so two calls finishing
      // together cannot both think `ready` is short and over-fill it.
      inFlight += 1;
      fetchLive().then(
        (p) => { inFlight -= 1; deliver(p); refill(); },
        (err) => {
          inFlight -= 1;
          // Once the circuit opens no more calls will come, so nobody should keep waiting.
          const give = circuit === 'open' ? waiting.splice(0) : waiting.splice(0, 1);
          for (const w of give) w.reject(err);
        },
      );
      if (online === false) break; // do not hammer an API that is down
    }
  }

  function fromReserve() {
    return reserve.length ? { ...reserve[Math.floor(Math.random() * reserve.length)], source: 'reserve' } : null;
  }

  async function take() {
    const puzzle = ready.shift();
    if (puzzle) { refill(); return { ...puzzle, source: 'live' }; }

    // Either start our own call, or queue for one already running.
    let live;
    let waiter = null;
    if (coolingDown()) live = fetchLive();             // fails at once: the circuit is open
    else if (inFlight < maxInFlight) live = startFetch();
    else live = new Promise((resolve, reject) => { waiter = { resolve, reject }; waiting.push(waiter); refill(); });

    let timer;
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve('deadline'), takeDeadlineMs); });
    try {
      const first = await Promise.race([live, deadline]);
      if (first !== 'deadline') { refill(); return { ...first, source: 'live' }; }
      const spare = fromReserve();
      if (!spare) { const p = await live; refill(); return { ...p, source: 'live' }; }
      // Too slow: give the player a reserve puzzle and keep the live one for later.
      // If this player is still queued, leave the queue (only our own entry: indexOf
      // is -1 once a puzzle was already handed to us). Otherwise the live puzzle is
      // ours and arrives later, so it goes to `ready` for the next player.
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
      successRate: recent.length ? Math.round((ok.length / recent.length) * 100) : null,   // percent
      retriesUsed: apiStats?.().retriesUsed ?? 0,
      circuit: { state: coolingDown() || circuit !== 'open' ? circuit : 'half-open', failuresInRow, retryInMs: coolingDown() ? coolDownMs - (now() - openedAt) : 0 },
    };
  }

  // Health over time for the admin screen: a small sample of status() every 30 s
  // (started by index.js), the last 120 kept (one hour).
  const samples = [];
  function sample() {
    const s = status();
    samples.push({ at: new Date(now()).toISOString(), online: s.online, ready: s.ready, reserve: s.reserve, p50LatencyMs: s.p50LatencyMs, successRate: s.successRate, circuit: s.circuit.state });
    if (samples.length > 120) samples.shift();
  }
  function startSampling(everyMs = 30_000) {
    const first = setTimeout(sample, 5000);   // after the warm-up calls have had time to answer
    const timer = setInterval(sample, everyMs);
    first.unref?.(); timer.unref?.();
    return () => { clearTimeout(first); clearInterval(timer); };
  }

  return {
    sample,
    startSampling,
    history: () => [...samples],
    // Returns { image, solution, source } where source is 'live' or 'reserve'.
    take,
    warmUp: refill,
    status,
  };
}

module.exports = { createPuzzlePool };
