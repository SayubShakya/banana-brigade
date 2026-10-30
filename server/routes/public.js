// Public, read-only API for other websites: the leaderboard. CORS lets any origin
// read it; it sends no cookie and needs no login, so it can never act as a player.
// app.js mounts it before the session middleware, so no session is ever made here.
//
//   GET /api/v1/public/leaderboard?mode=quick&limit=10
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { publicCors } = require('../middleware/cors');

function createPublicRouter({ scoresController: scores }) {
  const router = express.Router();
  router.use(publicCors);

  router.get('/leaderboard', scores.publicLeaderboard);

  return router;
}

module.exports = { createPublicRouter };
