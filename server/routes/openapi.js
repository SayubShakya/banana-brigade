// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { version } = require('../../package.json');

const json = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });
const str = { type: 'string' };
const int = { type: 'integer' };
const bool = { type: 'boolean' };
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const err = (description) => json(ref('Error'), description);
const body = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const login = [{ session: [] }];

function op(tag, summary, { req, ok = json(obj({ ok: bool })), status = 200, errors = {}, auth = true, params } = {}) {
  return {
    tags: [tag], summary,
    ...(auth ? { security: login } : { security: [] }),
    ...(params ? { parameters: params } : {}),
    ...(req ? { requestBody: body(req) } : {}),
    responses: { [status]: ok, ...(auth ? { 401: err('Not logged in') } : {}), ...errors },
  };
}
const q = (name, schema, description) => ({ name, in: 'query', schema, description });
const p = (name, description) => ({ name, in: 'path', required: true, schema: str, description });
const credentials = obj({ username: { type: 'string', pattern: '^[A-Za-z0-9_]{3,16}$' }, password: { type: 'string', minLength: 8, maxLength: 72 } }, ['username', 'password']);
const userReply = json(obj({ user: ref('User') }));
const reasonBody = obj({ reason: { type: 'string', minLength: 3, maxLength: 200 } }, ['reason']);

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Banana Brigade API',
    version,
    description: 'The REST API between the Banana Brigade browser app and its server. Every path also works '
      + 'without the /v1 prefix (the old paths). Login uses the HttpOnly session cookie brigade.sid; '
      + 'online matches use Socket.io (see docs/api.md). Puzzle pictures come from the Banana API by Marc Conrad.',
  },
  servers: [{ url: '/api/v1', description: 'Version 1' }],
  tags: ['auth', 'puzzles', 'scores', 'campaign', 'daily', 'admin', 'status', 'public'].map((name) => ({ name })),
  components: {
    securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'brigade.sid', description: 'Set by /auth/login, /auth/register or /auth/guest' } },
    schemas: {
      Error: obj({ error: str }, ['error']),
      User: obj({ id: str, username: str, role: { type: 'string', enum: ['player', 'admin'] }, guest: bool }),
      Puzzle: obj({ puzzleId: str, image: { type: 'string', description: 'data: URL of a PNG (base64)' }, purpose: str, source: { type: 'string', enum: ['live', 'reserve'] } }),
      Score: obj({ mode: { type: 'string', enum: ['quick', 'survival', 'training', 'team', 'online', 'campaign'] }, difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }, kills: int, deaths: int, wave: int, won: bool, draw: bool, durationS: int, powers: { type: 'array', items: str }, map: { type: 'string', maxLength: 40 }, roster: ref('Roster'), log: ref('Log') }, ['mode', 'kills', 'deaths', 'durationS']),
      Roster: { type: 'array', maxItems: 12, description: 'Final scoreboard; extra rows are dropped, names cut to 40 characters, numbers clamped to 0-999', items: obj({ name: { type: 'string', maxLength: 40 }, team: { type: 'string', enum: ['blue', 'red'] }, kills: int, deaths: int, bot: bool, me: bool }, ['name']) },
      Log: { type: 'array', maxItems: 300, description: 'Battle log; unknown types are dropped, text cut to 40 characters, t clamped to 0-3600 s', items: obj({ t: { type: 'number', description: 'Seconds since the start, 1 decimal' }, type: { type: 'string', enum: ['kill', 'puzzle', 'crate', 'power', 'drop', 'respawn', 'wave', 'join', 'leave', 'end'] }, by: str, target: str, weapon: str, ok: bool, detail: str }, ['t', 'type']) },
      Match: obj({ matchId: str, mode: str, multiplayer: bool, map: str, difficulty: str, durationS: int, teamMode: bool, winner: { type: 'string', nullable: true }, createdAt: str, roster: ref('Roster'), log: ref('Log') }),
      HistoryRow: obj({ id: str, matchId: { type: 'string', nullable: true }, mode: str, difficulty: str, map: str, kills: int, deaths: int, wave: int, won: int, draw: bool, puzzles_solved: int, puzzles_attempted: int, duration_s: int, created_at: str, multiplayer: bool, hasLog: bool }),
      BoardRow: obj({ rank: int, username: str, kills: int, deaths: int, wave: int, wins: int, games: int, puzzles_solved: int, puzzles_attempted: int }),
      Status: obj({ online: bool, ready: int, reserve: int, calls: int, lastLatencyMs: int, p50LatencyMs: int, avgLatencyMs: int, successRate: int, retriesUsed: int, circuit: obj({ state: { type: 'string', enum: ['closed', 'open', 'half-open'] }, failuresInRow: int, retryInMs: int }) }),
      Unlocked: { type: 'array', items: obj({ id: str, name: str, text: str }) },
    },
  },
  paths: {
    '/auth/register': { post: op('auth', 'Create an account and log in', { req: credentials, status: 201, ok: userReply, auth: false, errors: { 400: err('Bad name, short or breached password'), 409: err('Name taken') } }) },
    '/auth/login': { post: op('auth', 'Log in (5 tries per name per IP, 20 per IP, in 10 min)', { req: obj({ ...credentials.properties, remember: bool }, ['username', 'password']), ok: userReply, auth: false, errors: { 401: err('Wrong name or password'), 429: err('Too many tries') } }) },
    '/auth/logout': { post: op('auth', 'Log out this device', { auth: false }) },
    '/auth/logout-all': { post: op('auth', 'Log out every device', { ok: json(obj({ ok: bool, ended: int })) }) },
    '/auth/password': { post: op('auth', 'Change password (ends the other sessions)', { req: obj({ current: str, next: str }, ['current', 'next']), ok: json(obj({ ok: bool, ended: int })), errors: { 400: err('Too short or breached'), 403: err('Current password wrong') } }) },
    '/auth/account': { delete: op('auth', 'Delete the account and all its data', { req: obj({ password: str }), errors: { 403: err('Password wrong') } }) },
    '/auth/guest': { post: op('auth', 'Start playing as a guest (7 days)', { status: 201, ok: userReply, auth: false, errors: { 429: err('Too many guests from this IP') } }) },
    '/auth/upgrade': { post: op('auth', 'Save a guest as a full account (keeps progress)', { req: credentials, ok: userReply, errors: { 400: err('Not a guest, bad name or password'), 409: err('Name taken') } }) },
    '/auth/forgot': { post: op('auth', 'Ask for a password reset link (same reply for unknown names)', { req: obj({ username: str }, ['username']), ok: json(obj({ ok: bool, message: str })), auth: false, errors: { 429: err('Too many requests') } }) },
    '/auth/reset': { post: op('auth', 'Set a new password with a reset link token (single use, 30 min)', { req: obj({ token: str, password: str }, ['token', 'password']), ok: json(obj({ ok: bool, username: str, ended: int })), auth: false, errors: { 400: err('Link not valid, or bad password') } }) },
    '/auth/reset/check': { post: op('auth', 'Is a reset link still valid, and for which account? (does not use it up)', { req: obj({ token: str }, ['token']), ok: json(obj({ ok: bool, username: str })), auth: false, errors: { 400: err('Link not valid') } }) },
    '/auth/available': { get: op('auth', 'Is this username free? (20 checks a minute)', { params: [q('u', str, 'Username')], ok: json(obj({ available: bool, valid: bool })), auth: false, errors: { 429: err('Too many checks') } }) },
    '/auth/sessions': { get: op('auth', 'Signed-in devices, this session and account dates', { ok: json(obj({ count: int, list: { type: 'array', items: obj({ handle: str, device: str, createdAt: str, lastSeen: str, expires: str, current: bool }) }, current: obj({ createdAt: str, expires: str }), memberSince: str, lastLogin: str })) }) },
    '/auth/sessions/{handle}': { delete: op('auth', 'Sign out one other device (handle from /auth/sessions)', { params: [p('handle', 'Session handle (a hash, never the session id)')], errors: { 400: err('That is this session'), 404: err('Already ended') } }) },
    '/auth/export': { get: op('auth', 'Download my data: profile, scores, match history, battle logs, daily results, sessions (JSON file, no password hash)', { ok: json({ type: 'object' }) }) },
    '/auth/me': { get: op('auth', 'Who is logged in (user is null if nobody)', { ok: json(obj({ user: { ...ref('User'), nullable: true }, puzzles: obj({ solved: int, attempted: int }) })), auth: false }) },
    '/puzzle': { get: op('puzzles', 'Get a Banana puzzle (the answer stays on the server)', { params: [q('purpose', { type: 'string', enum: ['deploy', 'respawn', 'crate'] })], ok: json(ref('Puzzle')), errors: { 502: err('Banana API down and no reserve') } }) },
    '/puzzle/answer': { post: op('puzzles', 'Answer a puzzle once', { req: obj({ puzzleId: str, answer: { type: 'integer', minimum: 0, maximum: 9 } }, ['puzzleId', 'answer']), ok: json(obj({ correct: bool, solution: int, purpose: str, ms: { type: 'integer', description: 'Server-timed milliseconds from issue to answer' }, grade: { type: 'string', enum: ['gold', 'silver', 'bronze'], nullable: true, description: 'gold under 5 s, silver under 10 s, bronze slower, null when wrong' }, unlocked: ref('Unlocked') })), errors: { 404: err('Expired or already answered') } }) },
    '/achievements': { get: op('scores', 'All achievements and the ones this player has', { ok: json(obj({ all: ref('Unlocked'), mine: { type: 'array', items: obj({ id: str, at: str }) } })) }) },
    '/scores': { post: op('scores', 'Save a finished game (puzzle counts come from the session; a roster or log also saves a battle log; body up to 96 KB)', { req: ref('Score'), status: 201, ok: json(obj({ id: str, matchId: { type: 'string', nullable: true }, puzzlesSolved: int, puzzlesAttempted: int, unlocked: ref('Unlocked') })), errors: { 400: err('Invalid score, roster or log'), 413: err('Body too large') } }) },
    '/scores/leaderboard': { get: op('scores', 'Leaderboard: one row per player (best game; survival by wave) or career totals (wins, then kills); guests left out', { params: [q('mode', str, 'quick, survival, training, team, online, campaign (or all with by=career)'), q('period', { type: 'string', enum: ['all', 'today'] }), q('by', { type: 'string', enum: ['best', 'career'] }), q('limit', int)], ok: json(obj({ mode: str, period: str, by: str, rows: { type: 'array', items: ref('BoardRow') }, me: { ...ref('BoardRow'), nullable: true, description: 'My own row and rank when logged in, even outside the top list' } })), auth: false }) },
    '/scores/me': { get: op('scores', 'My totals and recent games', { ok: json(obj({ totals: { type: 'object' }, recent: { type: 'array', items: { type: 'object' } } })) }) },
    '/scores/history': { get: op('scores', 'My match history, newest first (training not included)', { params: [q('filter', { type: 'string', enum: ['all', 'solo', 'online', 'quick', 'survival', 'team', 'campaign'] }), q('before', str, 'Cursor from the previous page (next)'), q('limit', { type: 'integer', minimum: 1, maximum: 50 })], ok: json(obj({ rows: { type: 'array', items: ref('HistoryRow') }, next: { type: 'string', nullable: true } })) }) },
    '/matches/{matchId}': { get: op('scores', 'One match with its scoreboard and battle log (only for players in it, or admins); my roster row has me: true', { params: [p('matchId', 'Match id from the history')], ok: json(obj({ match: ref('Match') })), errors: { 404: err('No such match, or not yours') } }) },
    '/campaign': { get: op('campaign', 'Chapters, missions and my stars', { ok: json({ type: 'object' }) }) },
    '/campaign/result': { post: op('campaign', 'Report a mission result (stars worked out on the server; a roster or log also saves a battle log)', { req: obj({ mission: int, kills: int, deaths: int, continues: int, timeS: int, won: bool, map: { type: 'string', maxLength: 40 }, roster: ref('Roster'), log: ref('Log') }), ok: json(obj({ matchId: { type: 'string', nullable: true }, stars: int, best: int, progress: { type: 'object' }, totalStars: int, unlockedNext: bool, unlocked: ref('Unlocked') })), errors: { 400: err('Bad result, roster or log'), 403: err('Mission locked') } }) },
    '/daily': { get: op('daily', 'Today\'s challenge and my result', { ok: json({ type: 'object' }) }) },
    '/daily/start': { post: op('daily', 'Start today\'s one attempt', { ok: json(obj({ index: int, total: int, image: str, seconds: int })), errors: { 409: err('Already played today') } }) },
    '/daily/answer': { post: op('daily', 'Answer the current daily puzzle', { req: obj({ answer: int }, ['answer']), ok: json({ type: 'object' }) }) },
    '/daily/current': { get: op('daily', 'The running daily puzzle (after a reload)', { ok: json({ type: 'object' }) }) },
    '/daily/leaderboard': { get: op('daily', 'Today\'s daily leaderboard', { ok: json(obj({ date: str, rows: { type: 'array', items: { type: 'object' } } })) }) },
    '/admin/users': { get: op('admin', 'Every account with games, kills and puzzles (admins)', { ok: json(obj({ users: { type: 'array', items: { type: 'object' } } })), errors: { 403: err('Admins only') } }) },
    '/admin/users/{id}/scores': { delete: op('admin', 'Reset a player\'s scores (admins, reason logged)', { params: [p('id', 'User id')], req: reasonBody, ok: json(obj({ deleted: int })), errors: { 400: err('No reason'), 403: err('Admins only') } }) },
    '/admin/users/{id}/suspend': { post: op('admin', 'Suspend a player: signed out at once, cannot log in (admins, reason logged)', { params: [p('id', 'User id')], req: reasonBody, ok: json(obj({ ok: bool, ended: int })), errors: { 400: err('No reason, yourself or an admin'), 403: err('Admins only'), 409: err('Already suspended') } }) },
    '/admin/users/{id}/restore': { post: op('admin', 'Restore a suspended player (admins, reason logged)', { params: [p('id', 'User id')], req: reasonBody, errors: { 400: err('No reason'), 403: err('Admins only'), 409: err('Not suspended') } }) },
    '/admin/audit': { get: op('admin', 'The audit log: who did what to whom, when and why (admins)', { params: [q('limit', int)], ok: json(obj({ rows: { type: 'array', items: obj({ id: str, at: str, actor: str, action: str, target: str, reason: str, detail: str }) } })), errors: { 403: err('Admins only') } }) },
    '/admin/health': { get: op('admin', 'Banana API health now and every 30 s for the last hour (admins)', { ok: json(obj({ now: ref('Status'), history: { type: 'array', items: obj({ at: str, online: bool, ready: int, reserve: int, p50LatencyMs: int, successRate: int, circuit: str }) } })), errors: { 403: err('Admins only') } }) },
    '/admin/users/{id}/role': { patch: op('admin', 'Promote or demote (admins)', { params: [p('id', 'User id')], req: obj({ role: { type: 'string', enum: ['player', 'admin'] }, reason: str }, ['role', 'reason']), ok: json(obj({ user: ref('User') })), errors: { 400: err('Bad role or self-demotion'), 403: err('Admins only') } }) },
    '/status': { get: op('status', 'Banana API health: puzzles ready, latency, success rate, circuit breaker', { ok: json(ref('Status')), auth: false }) },
    '/public/leaderboard': {
      get: {
        ...op('public', 'Public read-only leaderboard for other sites (CORS: any origin, no cookie)', {
          params: [q('mode', { type: 'string', enum: ['quick', 'survival', 'team', 'online', 'campaign'] }), q('limit', { type: 'integer', minimum: 1, maximum: 50 })],
          ok: json(obj({ game: str, mode: str, updated: str, rows: { type: 'array', items: obj({ rank: int, username: str, kills: int, deaths: int, wave: int, puzzlesSolved: int, at: str }) } })),
          auth: false,
        }),
      },
    },
  },
};

module.exports = { spec };
