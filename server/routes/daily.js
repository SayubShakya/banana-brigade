// Routes layer: /api/daily URLs for the Daily Challenge.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

/** Builds the daily challenge router. */
function createDailyRouter({ dailyController: daily }) {
  const router = express.Router();
  // Every daily route needs a logged-in player.
  router.use(requireLogin);

  router.get('/', daily.status);
  router.post('/start', daily.start);
  router.post('/answer', daily.answer);
  router.get('/current', daily.current);
  router.get('/leaderboard', daily.leaderboard);

  return router;
}

module.exports = { createDailyRouter };
