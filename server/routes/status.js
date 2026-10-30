// /api/status: Banana API health (no login needed).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');

function createStatusRouter({ puzzleController: puzzles }) {
  const router = express.Router();

  router.get('/', puzzles.status);

  return router;
}

module.exports = { createStatusRouter };
