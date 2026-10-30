// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');

function createStatusRouter({ puzzleController: puzzles }) {
  const router = express.Router();

  router.get('/', puzzles.status);

  return router;
}

module.exports = { createStatusRouter };
