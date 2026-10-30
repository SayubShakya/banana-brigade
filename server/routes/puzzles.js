// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

function createPuzzleRouter({ puzzleController: puzzles }) {
  const router = express.Router();

  router.get('/', requireLogin, puzzles.issue);
  router.post('/answer', requireLogin, puzzles.answer);

  return router;
}

module.exports = { createPuzzleRouter };
