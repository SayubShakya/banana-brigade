// /api/scores: save a finished game, the leaderboards and my totals.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

function createScoresRouter({ scoresController: scores }) {
  const router = express.Router();

  router.post('/', requireLogin, scores.save);
  router.get('/leaderboard', scores.leaderboard);
  router.get('/me', requireLogin, scores.mine);

  return router;
}

module.exports = { createScoresRouter };
