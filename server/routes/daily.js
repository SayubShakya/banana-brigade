// /api/daily: the Daily Banana Challenge (login needed for every route).
//
//   GET  /api/daily              -> { date, total, played, result, streak, best }
//   POST /api/daily/start        -> { index, total, image, seconds }
//   POST /api/daily/answer {answer} -> { correct, solution, score, next | finished, unlocked }
//   GET  /api/daily/current      -> the running puzzle (after a reload)
//   GET  /api/daily/leaderboard  -> { date, rows }
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

function createDailyRouter({ dailyController: daily }) {
  const router = express.Router();
  router.use(requireLogin);

  router.get('/', daily.status);
  router.post('/start', daily.start);
  router.post('/answer', daily.answer);
  router.get('/current', daily.current);
  router.get('/leaderboard', daily.leaderboard);

  return router;
}

module.exports = { createDailyRouter };
