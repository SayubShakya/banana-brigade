// Routes layer: /api/scores URLs.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

/** Builds the scores router. The leaderboard is public; the rest need login. */
function createScoresRouter({ scoresController: scores }) {
  const router = express.Router();

  router.post('/', requireLogin, scores.save);
  router.get('/leaderboard', scores.leaderboard);
  router.get('/me', requireLogin, scores.mine);
  router.get('/history', requireLogin, scores.history);

  return router;
}

module.exports = { createScoresRouter };
