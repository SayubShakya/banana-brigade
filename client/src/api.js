// One place for every call to our server. fetch sends the HttpOnly session cookie
// automatically; the browser never sees the session id or a token. Any achievements
// a reply says were unlocked are announced on the event bus for the toasts.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { emit } from './eventBus.js';

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Server returned ${res.status}`), { status: res.status });
  for (const a of data.unlocked ?? []) emit('achievement:unlocked', a);
  return data;
}

export const api = {
  me: () => call('GET', '/api/auth/me'),
  login: (username, password, remember = false) => call('POST', '/api/auth/login', { username, password, remember }),
  register: (username, password) => call('POST', '/api/auth/register', { username, password }),
  logout: () => call('POST', '/api/auth/logout'),
  logoutAll: () => call('POST', '/api/auth/logout-all'),
  changePassword: (current, next) => call('POST', '/api/auth/password', { current, next }),
  deleteAccount: (password) => call('DELETE', '/api/auth/account', { password }),
  available: (name) => call('GET', `/api/auth/available?u=${encodeURIComponent(name)}`),
  sessions: () => call('GET', '/api/auth/sessions'),
  adminUsers: () => call('GET', '/api/admin/users'),
  resetScores: (id) => call('DELETE', `/api/admin/users/${id}/scores`),
  setRole: (id, role) => call('PATCH', `/api/admin/users/${id}/role`, { role }),
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
  dailyAnswer: (answer) => call('POST', '/api/daily/answer', { answer }),
  dailyBoard: () => call('GET', '/api/daily/leaderboard'),
  leaderboard: (mode, period, limit = 10) => call('GET', `/api/scores/leaderboard?mode=${mode}&period=${period}&limit=${limit}`),
};
