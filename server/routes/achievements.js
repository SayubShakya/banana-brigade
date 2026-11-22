// Routes layer: maps /api/achievements URLs to controller handlers.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

/** Builds the achievements router. Login is required. */
function createAchievementsRouter({ puzzleController: puzzles }) {
  const router = express.Router();

  router.get('/', requireLogin, puzzles.achievements);

  return router;
}

module.exports = { createAchievementsRouter };
