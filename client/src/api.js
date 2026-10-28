// One place for every call to our server. fetch sends the HttpOnly session cookie
// automatically; the browser never sees the session id or a token.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Server returned ${res.status}`), { status: res.status });
  return data;
}

export const api = {
  me: () => call('GET', '/api/auth/me'),
  login: (username, password) => call('POST', '/api/auth/login', { username, password }),
  register: (username, password) => call('POST', '/api/auth/register', { username, password }),
  logout: () => call('POST', '/api/auth/logout'),
  status: () => call('GET', '/api/status'),
  puzzle: (purpose) => call('GET', `/api/puzzle?purpose=${encodeURIComponent(purpose)}`),
  answer: (puzzleId, answer) => call('POST', '/api/puzzle/answer', { puzzleId, answer }),
  saveScore: (score) => call('POST', '/api/scores', score),
  myRecord: () => call('GET', '/api/scores/me'),
  leaderboard: (mode, period, limit = 10) => call('GET', `/api/scores/leaderboard?mode=${mode}&period=${period}&limit=${limit}`),
};
