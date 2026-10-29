// One place for every call to our server. fetch sends the HttpOnly session cookie
// automatically; the browser never sees the session id or a token. Any achievements
// a reply says were unlocked are announced on the event bus for the toasts.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { emit } from './eventBus.js';

// Every call goes to version 1 of our API (/api/v1/...); see /api/docs.
const API = '/api/v1';

// fetch only throws when the server cannot be reached at all; that error is marked
// `offline` so the app can show the "Server down" screen instead of a message.
async function call(method, path, body) {
  let res;
  try {
    res = await fetch(path.replace(/^\/api\//, `${API}/`), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the game server'), { offline: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Server returned ${res.status}`), { status: res.status });
  for (const a of data.unlocked ?? []) emit('achievement:unlocked', a);
  return data;
}

export const api = {
  me: () => call('GET', '/api/auth/me'),
  login: (username, password, remember = false) => call('POST', '/api/auth/login', { username, password, remember }),
  register: (username, password) => call('POST', '/api/auth/register', { username, password }),
  forgot: (username) => call('POST', '/api/auth/forgot', { username }),
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
  status: () => call('GET', '/api/status'),
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
  leaderboard: (mode, period, limit = 10) => call('GET', `/api/scores/leaderboard?mode=${mode}&period=${period}&limit=${limit}`),
};
