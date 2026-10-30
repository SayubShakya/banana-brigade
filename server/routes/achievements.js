// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

function createAchievementsRouter({ puzzleController: puzzles }) {
  const router = express.Router();

  router.get('/', requireLogin, puzzles.achievements);

  return router;
}

module.exports = { createAchievementsRouter };
