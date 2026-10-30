// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { publicCors } = require('../middleware/cors');

function createPublicRouter({ scoresController: scores }) {
  const router = express.Router();
  router.use(publicCors);

  router.get('/leaderboard', scores.publicLeaderboard);

  return router;
}

module.exports = { createPublicRouter };
