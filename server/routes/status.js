// Routes layer: /api/status, the public Banana API health check.

const express = require('express');

/** Builds the status router. */
function createStatusRouter({ puzzleController: puzzles }) {
  const router = express.Router();

  router.get('/', puzzles.status);

  return router;
}

module.exports = { createStatusRouter };
