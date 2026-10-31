// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

function createMatchesRouter({ matchesController: matches }) {
  const router = express.Router();
  router.use(requireLogin);

  router.get('/:matchId', matches.get);

  return router;
}

module.exports = { createMatchesRouter };
