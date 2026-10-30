// /api/achievements: every achievement and the ones this player has (login needed).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

function createAchievementsRouter({ puzzleController: puzzles }) {
  const router = express.Router();

  router.get('/', requireLogin, puzzles.achievements);

  return router;
}

module.exports = { createAchievementsRouter };
