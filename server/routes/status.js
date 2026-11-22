const express = require('express');

function createStatusRouter({ puzzleController: puzzles }) {
  const router = express.Router();

  router.get('/', puzzles.status);

  return router;
}

module.exports = { createStatusRouter };
