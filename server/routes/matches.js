const express = require('express');
const { requireLogin } = require('../middleware/auth');

function createMatchesRouter({ matchesController: matches }) {
  const router = express.Router();
  router.use(requireLogin);

  router.get('/:matchId', matches.get);

  return router;
}

module.exports = { createMatchesRouter };
