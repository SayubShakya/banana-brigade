// Routes layer: /api/matches URLs for match replays.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

/** Builds the matches router. */
function createMatchesRouter({ matchesController: matches }) {
  const router = express.Router();
  // Login required; the service also checks the user took part in the match.
  router.use(requireLogin);

  router.get('/:matchId', matches.get);

  return router;
}

module.exports = { createMatchesRouter };
