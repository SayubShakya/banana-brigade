// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

function createDailyRouter({ dailyController: daily }) {
  const router = express.Router();
  router.use(requireLogin);

  router.get('/', daily.status);
  router.post('/start', daily.start);
  router.post('/answer', daily.answer);
  router.get('/current', daily.current);
  router.get('/leaderboard', daily.leaderboard);

  return router;
}

module.exports = { createDailyRouter };
