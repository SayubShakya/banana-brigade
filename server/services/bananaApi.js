// Service layer: the HTTP client for Marc Conrad's Banana API (interoperability theme).
// The server (never the browser) calls the API over HTTPS, gets JSON back, checks it,
// and keeps the solution secret. Timeouts and retries make it robust.

const DEFAULT_BASE_URL = 'https://marcconrad.com/uob/banana/api.php'; // Banana API by Marc Conrad, University of Bedfordshire (https://marcconrad.com/uob/banana/doc.php).
// How many recent calls are kept for the latency/success statistics.
const HISTORY = 20;

/**
 * Error for any Banana API problem.
 * retryable says whether trying again might work (timeouts, network, HTTP 5xx/429);
 * kind is a short label such as 'timeout', 'network', 'http-5xx' or 'bad-data'.
 */
class BananaApiError extends Error {
  constructor(message, { cause, retryable = false, status, kind = 'other' } = {}) {
    super(message, { cause });
    this.name = 'BananaApiError';
    this.retryable = retryable;
    this.kind = kind;
    if (status) this.status = status;
  }
}

const badData = (message, cause) => new BananaApiError(message, { cause, kind: 'bad-data' });

/**
 * Reads and validates the API's reply. Never trusts the external data blindly.
 * @param {string} body raw response text
 * @param {'json'|'csv'} format reply format asked for
 * @param {boolean} base64 true if the image is sent inside the JSON as base64 PNG
 * @returns {{image: string, solution: number}} image (data URL or https URL) and the digit 0-9
 * @throws {BananaApiError} kind 'bad-data' if anything is missing or wrong
 */
function parsePuzzle(body, format, base64 = false) {
  let question;
  let solution;

  if (format === 'csv') {
    // CSV reply: "question,solution" - split at the last comma.
    const lastComma = String(body).trim().lastIndexOf(',');
    if (lastComma === -1) throw badData('CSV response has no comma');
    question = body.slice(0, lastComma).trim();
    solution = body.slice(lastComma + 1).trim();
  } else {
    // JSON reply: { "question": ..., "solution": ... }
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
    // Base64 mode: check it really is base64 PNG data before showing it to players.
  if (base64) {
    const png = question.replace(/^data:image\/png;base64,/, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(png) || png.length < 100) throw badData('Response has no valid base64 image');
    image = `data:image/png;base64,${png}`;
  } else {
    image = question.trim();
    if (!/^https?:\/\//.test(image)) throw badData('Response has no valid image URL');
  }
  // The solution must be a single digit 0-9 (the API sometimes sends it as text).
  if (typeof solution === 'string' && /^\s*\d\s*$/.test(solution)) solution = Number(solution);
  if (!Number.isInteger(solution) || solution < 0 || solution > 9) {
    throw badData('Response has no valid digit solution');
  }
  return { image, solution };
}

// Turns a low-level fetch error into a BananaApiError (timeouts and network errors are retryable).
function toApiError(err, timedOut, timeoutMs) {
  if (err instanceof BananaApiError) return err;
  if (timedOut) return new BananaApiError(`Banana API timed out after ${timeoutMs} ms`, { cause: err, retryable: true, kind: 'timeout' });
  return new BananaApiError('Banana API is unreachable', { cause: err, retryable: true, kind: 'network' });
}

/**
 * Creates the Banana API client.
 * @param {object} opts baseUrl, format ('json'), base64, timeoutMs (5 s), retries (2),
 *   backoffMs (300 ms); fetchImpl/sleep/random/now can be replaced by fakes in tests
 * @returns {{fetchPuzzle: Function, stats: Function}}
 */
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
  const history = [];
  let retriesUsed = 0;

  // Keeps the last 20 call results for stats().
  function record(entry) {
    history.push(entry);
    if (history.length > HISTORY) history.shift();
  }

  /**
   * Makes one HTTPS GET request to the API.
   * An AbortController cancels the request if it takes longer than timeoutMs.
   * @returns {Promise<{image, solution}>}
   * @throws {BananaApiError}
   */
  async function attempt() {
    const url = `${baseUrl}?out=${format}&base64=${base64 ? 'yes' : 'no'}`;
    const controller = new AbortController();
    let timedOut = false;
    // Timeout: abort the request so a slow API cannot hang the game.
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try { //Get the puzzle from banana api, Server calls over HTTPS
      const res = await fetchImpl(url, { signal: controller.signal, headers: { 'Cache-Control': 'no-store', Accept: 'application/json' } });
      // Only server errors (5xx) and "too many requests" (429) are worth retrying; other 4xx are not.
      if (!res.ok) {
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

  /**
   * Gets one puzzle, retrying up to `retries` times on retryable errors.
   * Waits grow each time (exponential backoff: 300 ms, 900 ms...) with a little random
   * "jitter" so many clients do not all retry at the same moment.
   * @returns {Promise<{image, solution}>}
   * @throws {BananaApiError} the last error if every try failed
   */
  async function fetchPuzzle() {
    const started = now();
    let lastError;
    let made = 0;
    for (let tries = 0; tries <= retries; tries++) {
      if (tries > 0) {
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
        // Bad data or a 4xx will not fix itself, so stop retrying.
        if (!err.retryable) break;
      }
    }
    record({ ms: Math.round(now() - started), ok: false, attempts: made, error: lastError.message });
    throw lastError;
  }

  /** Call statistics for the status page: latency, success rate, retries used. */
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
