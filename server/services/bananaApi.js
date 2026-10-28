// Client for the third-party Banana API by Marc Conrad.
// Docs: https://marcconrad.com/uob/banana/doc.php
// Every call to the external service goes through this one file, so if the API
// changes (URL, format, field names) only this file needs updating.
//
// A third-party service can be slow, down, or send something odd, so each call:
// - has its own timeout (an AbortController), so a hung request never blocks a player;
// - is retried with growing waits plus a little randomness, but only when trying
//   again could help (network error, timeout, HTTP 5xx or 429 "too many requests"),
//   never for bad data or other 4xx answers;
// - checks the JSON before trusting it;
// - records how long it took and how it ended, for /api/status.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const DEFAULT_BASE_URL = 'https://marcconrad.com/uob/banana/api.php';
const HISTORY = 20;   // how many recent calls the stats look at

class BananaApiError extends Error {
  // `retryable` says whether trying the same request again could give a different result.
  // `kind` is a short category (timeout, network, http-5xx, http-4xx, bad-data) that is
  // safe to show publicly, unlike the full message.
  constructor(message, { cause, retryable = false, status, kind = 'other' } = {}) {
    super(message, { cause });
    this.name = 'BananaApiError';
    this.retryable = retryable;
    this.kind = kind;
    if (status) this.status = status;
  }
}

const badData = (message, cause) => new BananaApiError(message, { cause, kind: 'bad-data' });

// Turns the raw response body into { image, solution }.
// `image` is something an <img> can show: the image URL, or a data: URL when the
// API was asked for base64 (base64=yes sends the PNG itself, so the browser does
// not need a second download from the image host).
// JSON looks like:  { "question": "https://.../x.png" or "<base64 PNG>", "solution": 7 }
// CSV looks like:   https://.../x.png,7   or   <base64 PNG>,7
// Small differences are normalised first (spaces or line breaks inside the base64,
// a "data:image/png;base64," prefix, the digit sent as the string "7"), because
// those are harmless; anything else is rejected as malformed.
function parsePuzzle(body, format, base64 = false) {
  let question;
  let solution;

  if (format === 'csv') {
    const lastComma = String(body).trim().lastIndexOf(',');
    if (lastComma === -1) throw badData('CSV response has no comma');
    question = body.slice(0, lastComma).trim();
    solution = body.slice(lastComma + 1).trim();
  } else {
    let data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      throw badData('Response is not valid JSON', err);
    }
    if (!data || typeof data !== 'object') throw badData('Response is not a JSON object');
    question = data.question;
    solution = data.solution;
  }

  if (typeof question !== 'string') throw badData('Response has no question');
  let image;
  if (base64) {
    const png = question.replace(/^data:image\/png;base64,/, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(png) || png.length < 100) throw badData('Response has no valid base64 image');
    image = `data:image/png;base64,${png}`;
  } else {
    image = question.trim();
    if (!/^https?:\/\//.test(image)) throw badData('Response has no valid image URL');
  }
  // The puzzle hides a single digit.
  if (typeof solution === 'string' && /^\s*\d\s*$/.test(solution)) solution = Number(solution);
  if (!Number.isInteger(solution) || solution < 0 || solution > 9) {
    throw badData('Response has no valid digit solution');
  }
  return { image, solution };
}

// Network failures and timeouts are worth another try; anything else is not.
function toApiError(err, timedOut, timeoutMs) {
  if (err instanceof BananaApiError) return err;
  if (timedOut) return new BananaApiError(`Banana API timed out after ${timeoutMs} ms`, { cause: err, retryable: true, kind: 'timeout' });
  return new BananaApiError('Banana API is unreachable', { cause: err, retryable: true, kind: 'network' });
}

// fetchImpl, sleep and random are injectable so the tests can fake the network
// and skip the real waiting.
function createBananaApi({
  baseUrl = DEFAULT_BASE_URL,
  format = 'json',
  base64 = true,
  timeoutMs = 5000,
  retries = 2,
  backoffMs = 300,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  random = Math.random,
  now = () => performance.now(),
} = {}) {
  const history = [];        // last few calls: { ms, ok, attempts, error }
  let retriesUsed = 0;

  function record(entry) {
    history.push(entry);
    if (history.length > HISTORY) history.shift();
  }

  // One HTTP request with its own timeout. The timer covers reading the body too,
  // because a server can send headers quickly and then stall.
  async function attempt() {
    const url = `${baseUrl}?out=${format}&base64=${base64 ? 'yes' : 'no'}`;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      // Node's fetch keeps no HTTP cache of its own, so this header does not change
      // anything on our side. It only asks any proxy or server-side cache on the way
      // not to replay an old answer, since every call should be a new puzzle.
      const res = await fetchImpl(url, { signal: controller.signal, headers: { 'Cache-Control': 'no-store', Accept: 'application/json' } });
      if (!res.ok) {
        // 5xx is the server's own trouble and 429 means "slow down": both may pass.
        // Any other 4xx means our request is wrong, so repeating it is pointless.
        const retryable = res.status >= 500 || res.status === 429;
        throw new BananaApiError(`Banana API returned HTTP ${res.status}`, {
          retryable, status: res.status, kind: res.status >= 500 ? 'http-5xx' : 'http-4xx',
        });
      }
      const body = await res.text();
      return parsePuzzle(body, format, base64);
    } catch (err) {
      throw toApiError(err, timedOut, timeoutMs);
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchPuzzle() {
    const started = now();
    let lastError;
    let made = 0;
    for (let tries = 0; tries <= retries; tries++) {
      if (tries > 0) {
        // Exponential backoff (300 ms, then 900 ms) with up to 30% jitter, so many
        // servers retrying at once do not all hit the API at the same moment.
        const wait = backoffMs * 3 ** (tries - 1);
        await sleep(Math.round(wait * (1 + random() * 0.3)));
        retriesUsed += 1;
      }
      made += 1;
      try {
        const puzzle = await attempt();
        record({ ms: Math.round(now() - started), ok: true, attempts: made });
        return puzzle;
      } catch (err) {
        lastError = err;
        if (!err.retryable) break;   // bad data will be just as bad the second time
      }
    }
    record({ ms: Math.round(now() - started), ok: false, attempts: made, error: lastError.message });
    throw lastError;
  }

  // Numbers about recent calls, read by the pool for /api/status.
  function stats() {
    const ok = history.filter((h) => h.ok);
    const last = history[history.length - 1] ?? null;
    return {
      calls: history.length,
      lastLatencyMs: last ? last.ms : null,
      avgLatencyMs: ok.length ? Math.round(ok.reduce((t, h) => t + h.ms, 0) / ok.length) : null,
      successRate: history.length ? ok.length / history.length : null,
      retriesUsed,
    };
  }

  return { fetchPuzzle, stats };
}

module.exports = { createBananaApi, parsePuzzle, BananaApiError, DEFAULT_BASE_URL };
