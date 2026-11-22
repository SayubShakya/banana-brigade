// Routes layer: /api/public URLs, a small read-only API other websites may call.

const express = require('express');
const { publicCors } = require('../middleware/cors');

/** Builds the public router. */
function createPublicRouter({ scoresController: scores }) {
  const router = express.Router();
  // CORS for any origin, GET only (see middleware/cors.js).
  router.use(publicCors);

  router.get('/leaderboard', scores.publicLeaderboard);

  return router;
}

module.exports = { createPublicRouter };
