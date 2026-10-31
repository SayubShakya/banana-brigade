// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

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

const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

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
  if (trustProxy) app.set('trust proxy', trustProxy);

  const sessions = createSessionManager({ store: sessionStore, getIo: () => app.locals.io });
  const services = createServices({ db, pool, puzzleStore, achievements, sessions, eventLog, sendResetLink, appUrl, pwnedCheck });
  const controllers = createControllers(services);

  app.use(apiVersion);
  app.post(['/api/scores', '/api/campaign/result'], express.json({ limit: '96kb' }));
  app.use(express.json({ limit: '4kb' }));

  app.use('/api', createDocsRouter(controllers));
  app.use('/api/public', createPublicRouter(controllers));

  const sessionMiddleware = createSessionMiddleware({ secret: sessionSecret, store: sessionStore, production });
  app.use(sessionMiddleware);
  app.use(lastSeen);
  Object.assign(app.locals, { sessionMiddleware, puzzleStore, pool, db, achievements, eventLog });
  eventLog.watchAchievements(achievements.events, db);

  app.use('/api/auth', createAuthRouter(controllers));
  app.use('/api/scores', createScoresRouter(controllers));
  app.use('/api/admin', createAdminRouter(controllers));
  app.use('/api/daily', createDailyRouter(controllers));
  app.use('/api/campaign', createCampaignRouter(controllers));
  app.use('/api/matches', createMatchesRouter(controllers));
  app.use('/api/achievements', createAchievementsRouter(controllers));
  app.use('/api/puzzle', createPuzzleRouter(controllers));
  app.use('/api/status', createStatusRouter(controllers));
  app.use('/api', apiNotFound);

  app.use(express.static(CLIENT_DIST));
  app.use(createPageNotFound(path.join(CLIENT_DIST, 'index.html')));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, SESSION_COOKIE };
