// Public, read-only API for other websites: the leaderboard. CORS lets any origin
// read it; it sends no cookie and needs no login, so it can never act as a player.
// app.js mounts it before the session middleware, so no session is ever made here.
//
//   GET /api/v1/public/leaderboard?mode=quick&limit=10
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');

const PUBLIC_MODES = ['quick', 'survival', 'team', 'online', 'campaign'];

function createPublicRouter({ db }) {
  const router = express.Router();

  router.use((req, res, next) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  router.get('/leaderboard', async (req, res, next) => {
    const mode = PUBLIC_MODES.includes(req.query.mode) ? req.query.mode : 'quick';
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    try {
      const rows = await db.leaderboard(mode, limit);
      res.set('Cache-Control', 'public, max-age=30').json({
        game: 'Banana Brigade', mode, updated: new Date().toISOString(),
        rows: rows.map((r, i) => ({ rank: i + 1, username: r.username, kills: r.kills, deaths: r.deaths, wave: r.wave, puzzlesSolved: r.puzzles_solved, at: r.created_at })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createPublicRouter };
