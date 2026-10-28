// Match results and the leaderboard.
// Kills and deaths come from the browser (the game runs there), but the Banana
// puzzle counts are taken from the server-side session, where every answer was
// checked. A player can therefore not fake their puzzle record.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

const MODES = ['quick', 'survival', 'training', 'team'];   // modes a browser may report
const BOARDS = [...MODES, 'online'];                          // online scores are written by the server
const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);

function createScoresRouter({ db, achievements }) {
  const router = express.Router();

  router.post('/', requireLogin, async (req, res, next) => {
    const b = req.body ?? {};
    const score = {
      userId: req.session.userId,
      mode: MODES.includes(b.mode) ? b.mode : null,
      difficulty: ['easy', 'medium', 'hard'].includes(b.difficulty ?? 'medium') ? (b.difficulty ?? 'medium') : null,
      kills: int(b.kills, 500),
      deaths: int(b.deaths, 500),
      wave: int(b.wave ?? 0, 200),
      won: b.won ? 1 : 0,
      durationS: int(b.durationS, 3600),
    };
    if (Object.values(score).some((v) => v === null)) {
      return res.status(400).json({ error: 'Send mode, kills, deaths and durationS as whole numbers' });
    }
    // Puzzle results for this match are counted by the server, then reset.
    const p = req.session.puzzles ?? { solved: 0, attempted: 0 };
    score.puzzlesSolved = p.solved;
    score.puzzlesAttempted = p.attempted;
    req.session.puzzles = { solved: 0, attempted: 0 };
    try {
      const id = await db.addScore(score);
      const unlocked = score.mode === 'training' ? [] : await achievements.emit('score:saved', score.userId, { ...score, won: !!score.won });
      res.status(201).json({ id, puzzlesSolved: score.puzzlesSolved, puzzlesAttempted: score.puzzlesAttempted, unlocked });
    } catch (err) {
      next(err);
    }
  });

  router.get('/leaderboard', async (req, res, next) => {
    const mode = BOARDS.includes(req.query.mode) ? req.query.mode : 'quick';
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    // period=today shows only games since midnight UTC (the "daily leaders").
    const period = req.query.period === 'today' ? 'today' : 'all';
    const since = period === 'today' ? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) : null;
    try {
      res.json({ mode, period, rows: await db.leaderboard(mode, limit, since) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireLogin, async (req, res, next) => {
    try {
      const [totals, recent] = await Promise.all([db.totalsForUser(req.session.userId), db.scoresForUser(req.session.userId, 20)]);
      res.json({ totals, recent });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createScoresRouter, MODES };
