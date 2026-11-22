// Routes layer: /api/puzzle URLs for Banana API puzzles.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

/** Builds the puzzle router. Both routes need a logged-in player. */
function createPuzzleRouter({ puzzleController: puzzles }) {
  const router = express.Router();

  router.get('/', requireLogin, puzzles.issue);
  router.post('/answer', requireLogin, puzzles.answer);

  return router;
}

module.exports = { createPuzzleRouter };
