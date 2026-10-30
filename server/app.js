// The Banana Brigade web server: accounts, Banana API puzzles, scores and the game files.
//
//   Every path also works as /api/v1/... (the browser uses v1). The full list is the
//   OpenAPI description (routes/openapi.js, docs/openapi.yaml, Swagger UI at /api/docs):
//   /api/auth/...      register, login, logout(-all), password, account, guest, upgrade,
//                      forgot, reset(/check), available, sessions(/:handle), export, me
//   /api/puzzle, /api/puzzle/answer   Banana puzzles (login)        /api/status   API health
//   /api/scores/..., /api/achievements, /api/campaign/..., /api/daily/...
//   /api/admin/...     users, scores, role, suspend, restore, audit, health (admin)
//   /api/public/leaderboard   read-only, CORS        /api/docs, /api/openapi.json
//
// The browser never calls the Banana API itself: the server fetches the puzzle,
// keeps the solution and only sends the picture, so the answer cannot be read in
// the browser's developer tools.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { createPuzzleStore } = require('./services/puzzles');
const { createPuzzlePool } = require('./services/pool');
const { createDocsRouter } = require('./routes/docs');
const { createPublicRouter } = require('./routes/public');
const { createEventLog } = require('./services/eventLog');
const { createAuthRouter } = require('./routes/auth');
const { createScoresRouter } = require('./routes/scores');
const { createAdminRouter } = require('./routes/admin');
const { createDailyRouter } = require('./routes/daily');
const { createCampaignRouter } = require('./routes/campaign');
const { createAchievements } = require('./services/achievements');
const { requireLogin } = require('./middleware/auth');

const PURPOSES = ['deploy', 'respawn', 'crate'];
const SESSION_COOKIE = 'brigade.sid';

function createApp({
  db,
  bananaApi,
  sessionSecret,
  sessionStore,               // MongoDB in the real server; in-memory in tests
  production = false,
  puzzleStore = createPuzzleStore(),
  pool = createPuzzlePool({ fetchPuzzle: bananaApi.fetchPuzzle, apiStats: bananaApi.stats }),
  achievements = createAchievements({ db }),
  trustProxy = production ? 1 : false,   // read the client IP from X-Forwarded-For (only behind a proxy)
  sendResetLink,                         // how reset links reach the player (default: the server log)
  appUrl = null,                         // the site address used in reset links (APP_URL)
  pwnedCheck,                            // Have I Been Pwned check for new passwords (off unless given)
  eventLog = createEventLog(),           // live event feed for the admin screen
}) {
  const app = express();
  app.set('sessionCookieName', SESSION_COOKIE);
  if (trustProxy) app.set('trust proxy', trustProxy);
  // API versioning: /api/v1/... is the current API. The old paths without /v1 keep
  // working (they are the same handlers), so an older browser tab does not break.
  app.use((req, res, next) => {
    if (req.url === '/api/v1' || req.url.startsWith('/api/v1/')) req.url = `/api${req.url.slice(7)}`;
    next();
  });
  app.use(express.json({ limit: '4kb' }));

  // The API description and the public leaderboard need no session, so they come
  // before the session middleware (routes/docs.js, routes/public.js).
  app.use('/api', createDocsRouter());
  app.use('/api/public', createPublicRouter({ db }));

  const sessionMiddleware = session({
    name: SESSION_COOKIE,
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,     // no cookie until someone logs in
    cookie: {
      httpOnly: true,             // page JavaScript cannot read it (protects against XSS stealing it)
      sameSite: 'lax',            // not sent with cross-site POSTs (CSRF protection)
      secure: production,         // HTTPS only in production
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
    },
  });
  app.use(sessionMiddleware);
  // "Last used" for the signed-in devices list, updated at most once a minute so most
  // requests do not rewrite the session.
  app.use((req, res, next) => {
    if (req.session.userId && Date.now() - Date.parse(req.session.lastSeen ?? 0) > 60_000) req.session.lastSeen = new Date().toISOString();
    next();
  });
  // The WebSocket server (realtime/) reuses the same sessions and puzzle store.
  Object.assign(app.locals, { sessionMiddleware, puzzleStore, pool, db, achievements, eventLog });
  eventLog.watchAchievements(achievements.events, db);

  app.use('/api/auth', createAuthRouter({ db, sendResetLink, appUrl, pwnedCheck, eventLog }));
  app.use('/api/scores', createScoresRouter({ db, achievements }));
  app.use('/api/admin', createAdminRouter({ db, eventLog }));
  app.use('/api/daily', createDailyRouter({ db, pool, achievements }));
  app.use('/api/campaign', createCampaignRouter({ db, achievements }));

  // Every achievement, and which ones this player has (with the date unlocked).
  app.get('/api/achievements', requireLogin, async (req, res, next) => {
    try {
      const user = await db.findUserById(req.session.userId);
      res.json({ all: achievements.list, mine: user?.achievements ?? [] });
    } catch (err) { next(err); }
  });

  app.get('/api/puzzle', requireLogin, async (req, res) => {
    const purpose = PURPOSES.includes(req.query.purpose) ? req.query.purpose : 'deploy';
    try {
      const { image, solution, source } = await pool.take();
      const puzzleId = puzzleStore.add(solution, purpose);
      res.set('Cache-Control', 'no-store');
      res.json({ puzzleId, image, purpose, source });
    } catch (err) {
      console.error('Banana API error:', err.message);
      res.status(502).json({ error: 'The Banana API is not responding. Try again in a moment.' });
    }
  });

  app.post('/api/puzzle/answer', requireLogin, async (req, res, next) => {
    const { puzzleId, answer } = req.body ?? {};
    if (typeof puzzleId !== 'string' || !Number.isInteger(answer)) {
      return res.status(400).json({ error: 'Send { puzzleId, answer } with a whole-number answer' });
    }
    const result = puzzleStore.answer(puzzleId, answer);
    if (!result) return res.status(404).json({ error: 'That puzzle has expired or was already answered' });
    // The server keeps the player's puzzle record, so it cannot be faked from the browser.
    const p = req.session.puzzles ?? { solved: 0, attempted: 0 };
    p.attempted += 1;
    if (result.correct) p.solved += 1;
    req.session.puzzles = p;
    try {
      const unlocked = await achievements.emit('puzzle:answered', req.session.userId, result);
      res.json({ correct: result.correct, solution: result.solution, purpose: result.purpose, unlocked });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/status', (req, res) => res.json(pool.status()));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // The built React app (npm run build).
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

  // Any other address is a 404. Browsers get the React page with status 404 (it shows
  // the "page not found" screen); anything else gets plain text.
  const indexHtml = path.join(__dirname, '..', 'client', 'dist', 'index.html');
  app.use((req, res) => {
    res.status(404);
    if ((req.method === 'GET' || req.method === 'HEAD') && req.accepts('html') && fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
    res.type('text').send('Not found');
  });

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}

module.exports = { createApp, SESSION_COOKIE };
