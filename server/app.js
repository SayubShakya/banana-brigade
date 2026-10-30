// The Banana Brigade web server: accounts, Banana API puzzles, scores and the game files.
// This file only puts the pieces together: middleware order, the routers (routes/),
// the static React app, 404s and the error handler. The work is done in
// controllers/ (HTTP), services/ (rules) and repositories/ (MongoDB).
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
const { createAchievementsRouter } = require('./routes/achievements');
const { createPuzzleRouter } = require('./routes/puzzles');
const { createStatusRouter } = require('./routes/status');

const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

function createApp({
  db,
  bananaApi,
  sessionSecret,
  sessionStore = new MemoryStore(),   // MongoDB in the real server; in-memory in tests
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

  // Services and controllers. The session manager asks app.locals for the Socket.io
  // server, which realtime/socket.js attaches after the app is built.
  const sessions = createSessionManager({ store: sessionStore, getIo: () => app.locals.io });
  const services = createServices({ db, pool, puzzleStore, achievements, sessions, eventLog, sendResetLink, appUrl, pwnedCheck });
  const controllers = createControllers(services);

  app.use(apiVersion);
  app.use(express.json({ limit: '4kb' }));

  // The API description and the public leaderboard need no session, so they come
  // before the session middleware.
  app.use('/api', createDocsRouter(controllers));
  app.use('/api/public', createPublicRouter(controllers));

  const sessionMiddleware = createSessionMiddleware({ secret: sessionSecret, store: sessionStore, production });
  app.use(sessionMiddleware);
  app.use(lastSeen);
  // The WebSocket server (realtime/) reuses the same sessions and puzzle store.
  Object.assign(app.locals, { sessionMiddleware, puzzleStore, pool, db, achievements, eventLog });
  eventLog.watchAchievements(achievements.events, db);

  app.use('/api/auth', createAuthRouter(controllers));
  app.use('/api/scores', createScoresRouter(controllers));
  app.use('/api/admin', createAdminRouter(controllers));
  app.use('/api/daily', createDailyRouter(controllers));
  app.use('/api/campaign', createCampaignRouter(controllers));
  app.use('/api/achievements', createAchievementsRouter(controllers));
  app.use('/api/puzzle', createPuzzleRouter(controllers));
  app.use('/api/status', createStatusRouter(controllers));
  app.use('/api', apiNotFound);

  // The built React app (npm run build), then 404 for anything else.
  app.use(express.static(CLIENT_DIST));
  app.use(createPageNotFound(path.join(CLIENT_DIST, 'index.html')));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, SESSION_COOKIE };
