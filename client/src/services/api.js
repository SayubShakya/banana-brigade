// api.js: the single place where the client talks to the server (interoperability theme).
// Every request goes to /api/v1 as JSON; the browser sends the httpOnly session cookie
// automatically because the page and the API share the same origin.
import { emit } from './eventBus.js';

const API = '/api/v1';

/**
 * call: send one HTTP request to the game server and return the parsed JSON body.
 * @param {string} method  HTTP verb, e.g. 'GET' or 'POST'.
 * @param {string} path    Path starting with /api/ (rewritten to /api/v1/).
 * @param {object} [body]  Optional data, sent as JSON.
 * @param {{quiet?: boolean}} [options]  quiet = do not show error toasts.
 * @returns {Promise<object>} the JSON reply; throws an Error with .status / .offline on failure.
 * Events emitted: 'toast:error', 'session:ended', 'achievement:unlocked'.
 */
async function call(method, path, body, { quiet = false } = {}) {
  let res;
  // fetch only rejects when the network itself fails (server down / no internet),
  // so this catch means "offline", not "bad request".
  try {
    res = await fetch(path.replace(/^\/api\//, `${API}/`), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const error = Object.assign(new Error('Cannot reach the game server'), { offline: true });
    if (!quiet) emit('toast:error', { text: 'Cannot reach the game server. Check your connection.' });
    throw error;
  }
  // Read the JSON body; if the body is empty or not JSON, fall back to {}.
  const data = await res.json().catch(() => ({}));
  // HTTP error (4xx / 5xx). A 401 on a normal route means the session cookie expired or
  // was revoked, so we tell the rest of the app through the event bus ('session:ended').
  // Login/register/reset routes are excluded because a 401 there just means a wrong password.
  if (!res.ok) {
    if ((res.status === 401 && !/\/auth\/(login|admin-login|register|forgot|reset)$/.test(path)) || data.suspended) {
      emit('session:ended', { text: data.suspended ? data.error : 'You were signed out. Please log in again.' });
    }
    // Server errors get a friendly toast; then we throw so the caller can react too.
    if (res.status >= 500 && !quiet) emit('toast:error', { text: data.error ? `Server problem: ${data.error}` : `The server had a problem (${res.status}). Try again.` });
    throw Object.assign(new Error(data.error || `Server returned ${res.status}`), { status: res.status, pwned: !!data.pwned });
  }
  // Any reply may carry newly unlocked achievements; announce each one as an event.
  for (const a of data.unlocked ?? []) emit('achievement:unlocked', a);
  return data;
}

/**
 * api: one small function per server endpoint, so views never build URLs themselves.
 * Auth (login, register, guest, logout, sessions), admin tools, Banana puzzles
 * (puzzle / answer), scores, campaign, daily challenge and match history.
 */
export const api = {
  me: () => call('GET', '/api/auth/me', undefined, { quiet: true }),
  login: (username, password, remember = false) => call('POST', '/api/auth/login', { username, password, remember }),
  register: (username, password) => call('POST', '/api/auth/register', { username, password }),
  adminLogin: (username, password) => call('POST', '/api/auth/admin-login', { username, password }),
  forgot: (username) => call('POST', '/api/auth/forgot', { username }),
  checkReset: (token) => call('POST', '/api/auth/reset/check', { token }),
  resetPassword: (token, password) => call('POST', '/api/auth/reset', { token, password }),
  guest: () => call('POST', '/api/auth/guest'),
  upgrade: (username, password) => call('POST', '/api/auth/upgrade', { username, password }),
  logout: () => call('POST', '/api/auth/logout'),
  logoutAll: () => call('POST', '/api/auth/logout-all'),
  changePassword: (current, next) => call('POST', '/api/auth/password', { current, next }),
  deleteAccount: (password) => call('DELETE', '/api/auth/account', { password }),
  available: (name) => call('GET', `/api/auth/available?u=${encodeURIComponent(name)}`),
  sessions: () => call('GET', '/api/auth/sessions'),
  endSession: (handle) => call('DELETE', `/api/auth/sessions/${encodeURIComponent(handle)}`),
  adminUsers: () => call('GET', '/api/admin/users'),
  resetScores: (id, reason) => call('DELETE', `/api/admin/users/${id}/scores`, { reason }),
  setRole: (id, role, reason) => call('PATCH', `/api/admin/users/${id}/role`, { role, reason }),
  suspend: (id, reason) => call('POST', `/api/admin/users/${id}/suspend`, { reason }),
  restore: (id, reason) => call('POST', `/api/admin/users/${id}/restore`, { reason }),
  audit: () => call('GET', '/api/admin/audit'),
  health: () => call('GET', '/api/admin/health'),
  status: () => call('GET', '/api/status', undefined, { quiet: true }),
  // The server fetches the real puzzle from the Banana API and keeps the answer secret;
  // the client only gets an image + puzzleId, and later posts the player's answer.
  puzzle: (purpose) => call('GET', `/api/puzzle?purpose=${encodeURIComponent(purpose)}`),
  answer: (puzzleId, answer) => call('POST', '/api/puzzle/answer', { puzzleId, answer }),
  saveScore: (score) => call('POST', '/api/scores', score),
  myRecord: () => call('GET', '/api/scores/me'),
  achievements: () => call('GET', '/api/achievements'),
  campaign: () => call('GET', '/api/campaign'),
  campaignResult: (r) => call('POST', '/api/campaign/result', r),
  daily: () => call('GET', '/api/daily'),
  dailyStart: () => call('POST', '/api/daily/start'),
  dailyCurrent: () => call('GET', '/api/daily/current'),
  dailyAnswer: (answer) => call('POST', '/api/daily/answer', { answer }),
  dailyBoard: () => call('GET', '/api/daily/leaderboard'),
  leaderboard: (mode, period, by = 'best', limit = 10) => call('GET', `/api/scores/leaderboard?mode=${encodeURIComponent(mode)}&period=${period}&by=${by}&limit=${limit}`),
  history: (filter = 'all', before = null) => call('GET', `/api/scores/history?filter=${encodeURIComponent(filter)}&limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  match: (matchId) => call('GET', `/api/matches/${encodeURIComponent(matchId)}`),
};
