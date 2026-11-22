// Application setup: builds the Express app and wires the layers together
// (middleware -> routes -> controllers -> services -> repositories).
// Kept separate from index.js so tests can create an app without starting a server.

const path = require('node:path');
const express = require('express');
const { createPuzzleStore } = require('./services/puzzles');
const { createPuzzlePool } = require('./services/pool');
const { createEventLog } = require('./services/eventLog');
const { createAchievements } = require('./services/achievements');
const { createSessionManager } = require('./services/sessions');
const { createServices } = require('./services');
const { createControllers } = require('./controllers');
const { apiVersion } = require('./middleware/apiVersion');
const { lastSeen } = require('./middleware/lastSeen');
const { apiNotFound, createPageNotFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');
const { createSessionMiddleware, SESSION_COOKIE, MemoryStore } = require('./middleware/session');
const { createDocsRouter } = require('./routes/docs');
const { createPublicRouter } = require('./routes/public');
const { createAuthRouter } = require('./routes/auth');
const { createScoresRouter } = require('./routes/scores');
const { createAdminRouter } = require('./routes/admin');
const { createDailyRouter } = require('./routes/daily');
const { createCampaignRouter } = require('./routes/campaign');
const { createMatchesRouter } = require('./routes/matches');
const { createAchievementsRouter } = require('./routes/achievements');
const { createPuzzleRouter } = require('./routes/puzzles');
const { createStatusRouter } = require('./routes/status');

// The built browser game (Vite output) served as static files.
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

/**
 * Creates the Express app. Every dependency can be passed in, so tests can use
 * fakes (memory session store, fake Banana API, test database).
 * @param {object} deps db (repositories), bananaApi (API client), sessionSecret, sessionStore,
 *   production, puzzleStore, pool, achievements, trustProxy, sendResetLink, appUrl, pwnedCheck, eventLog
 * @returns {import('express').Express} the configured app
 */
function createApp({
  db,
  bananaApi,
  sessionSecret,
  sessionStore = new MemoryStore(),
  production = false,
  puzzleStore = createPuzzleStore(),
  pool = createPuzzlePool({ fetchPuzzle: bananaApi.fetchPuzzle, apiStats: bananaApi.stats }),
  achievements = createAchievements({ db }),
  trustProxy = production ? 1 : false,
  sendResetLink,
  appUrl = null,
  pwnedCheck,
  eventLog = createEventLog(),
}) {
  const app = express();
  app.set('sessionCookieName', SESSION_COOKIE);
  // Behind a proxy in production (one hop), so req.ip is the real client IP for rate limiting.
  if (trustProxy) app.set('trust proxy', trustProxy);

  // Socket.io is attached later, so the session manager gets it through a function.
  const sessions = createSessionManager({ store: sessionStore, getIo: () => app.locals.io });
  const services = createServices({ db, pool, puzzleStore, achievements, sessions, eventLog, sendResetLink, appUrl, pwnedCheck });
  const controllers = createControllers(services);

  // Middleware order matters: requests pass through these from top to bottom.
  app.use(apiVersion);
  // Size limits: score/campaign bodies (with match logs) may be up to 96 KB, everything else 4 KB,
  // so huge JSON bodies cannot be used to overload the server.
  app.post(['/api/scores', '/api/campaign/result'], express.json({ limit: '96kb' }));
  app.use(express.json({ limit: '4kb' }));

  // Docs and the public API come before the session middleware, so they never set a cookie.
  app.use('/api', createDocsRouter(controllers));
  app.use('/api/public', createPublicRouter(controllers));

  // From here on every request has req.session (cookie "brigade.sid").
  const sessionMiddleware = createSessionMiddleware({ secret: sessionSecret, store: sessionStore, production });
  app.use(sessionMiddleware);
  app.use(lastSeen);
  // Shared objects that the Socket.io code (realtime/socket.js) needs.
  Object.assign(app.locals, { sessionMiddleware, puzzleStore, pool, db, achievements, eventLog });
  // Event wiring: game events from the achievements bus also feed the live activity log.
  eventLog.watchAchievements(achievements.events, db);

  // The REST API routes, one router per area.
  app.use('/api/auth', createAuthRouter(controllers));
  app.use('/api/scores', createScoresRouter(controllers));
  app.use('/api/admin', createAdminRouter(controllers));
  app.use('/api/daily', createDailyRouter(controllers));
  app.use('/api/campaign', createCampaignRouter(controllers));
  app.use('/api/matches', createMatchesRouter(controllers));
  app.use('/api/achievements', createAchievementsRouter(controllers));
  app.use('/api/puzzle', createPuzzleRouter(controllers));
  app.use('/api/status', createStatusRouter(controllers));
  // Any other /api URL is a JSON 404.
  app.use('/api', apiNotFound);

  app.use(express.static(CLIENT_DIST));
  app.use(createPageNotFound(path.join(CLIENT_DIST, 'index.html')));
  // The error handler must be last so it catches errors from every route above.
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, SESSION_COOKIE };
