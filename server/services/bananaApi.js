// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const DEFAULT_BASE_URL = 'https://marcconrad.com/uob/banana/api.php';
const HISTORY = 20;

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
  if (typeof solution === 'string' && /^\s*\d\s*$/.test(solution)) solution = Number(solution);
  if (!Number.isInteger(solution) || solution < 0 || solution > 9) {
    throw badData('Response has no valid digit solution');
  }
  return { image, solution };
}

function toApiError(err, timedOut, timeoutMs) {
  if (err instanceof BananaApiError) return err;
  if (timedOut) return new BananaApiError(`Banana API timed out after ${timeoutMs} ms`, { cause: err, retryable: true, kind: 'timeout' });
  return new BananaApiError('Banana API is unreachable', { cause: err, retryable: true, kind: 'network' });
}

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

  function record(entry) {
    history.push(entry);
    if (history.length > HISTORY) history.shift();
  }

  async function attempt() {
    const url = `${baseUrl}?out=${format}&base64=${base64 ? 'yes' : 'no'}`;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: controller.signal, headers: { 'Cache-Control': 'no-store', Accept: 'application/json' } });
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
        if (!err.retryable) break;
      }
    }
    record({ ms: Math.round(now() - started), ok: false, attempts: made, error: lastError.message });
    throw lastError;
  }

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
