// The Daily Banana Challenge: the same 5 Banana API puzzles for every player on a
// given day (UTC), 20 seconds each, one attempt per account per day. Each correct
// answer in a row doubles the points (100, 200, 400 …); a miss resets the bonus.
// Finishing on consecutive days builds a streak shown on the profile.
//
// The day's puzzles are fetched once and stored in MongoDB with their solutions;
// the browser only ever gets the pictures. Timing, scoring and the "one attempt"
// rule (a unique index on user + date) are all enforced here, not in the browser.
//
//   GET  /api/daily              -> { date, total, played, result, streak, best }
//   POST /api/daily/start        -> { index, total, image, seconds }
//   POST /api/daily/answer {answer} -> { correct, solution, score, next | finished, unlocked }
//   GET  /api/daily/leaderboard  -> { date, rows }
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

const TOTAL = 5;
const SECONDS = 20;
const GRACE_MS = 2000;                    // network delay allowance
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const dayBefore = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

function createDailyRouter({ db, pool, achievements, now = () => Date.now() }) {
  const router = express.Router();
  router.use(requireLogin);

  async function todaysPuzzles(date) {
    const existing = await db.getDaily(date);
    if (existing) return existing;
    const puzzles = [];
    for (let i = 0; i < TOTAL; i++) {
      const { image, solution } = await pool.take();
      puzzles.push({ image, solution });
    }
    return db.createDaily(date, puzzles);
  }

  router.get('/', async (req, res, next) => {
    try {
      const date = today(now());
      const [result, user] = await Promise.all([db.dailyResult(req.session.userId, date), db.findUserById(req.session.userId)]);
      const running = req.session.daily?.date === date;
      res.json({
        date, total: TOTAL, seconds: SECONDS, played: !!result && !running, running,
        result: result ? { score: result.score, solved: result.solved } : null,
        streak: user.daily.lastDate === date || user.daily.lastDate === dayBefore(date) ? user.daily.streak : 0,
        best: user.daily.best,
      });
    } catch (err) { next(err); }
  });

  router.post('/start', async (req, res, next) => {
    try {
      const date = today(now());
      if (!(await db.startDailyAttempt(req.session.userId, date))) {
        return res.status(409).json({ error: 'You have already played today\'s challenge. Come back tomorrow!' });
      }
      let daily;
      try {
        daily = await todaysPuzzles(date);
      } catch {
        return res.status(502).json({ error: 'The Banana API is not responding. Try again in a moment.' });
      }
      req.session.daily = { date, index: 0, score: 0, solved: 0, bonus: 1, issuedAt: now() };
      res.json({ index: 0, total: TOTAL, seconds: SECONDS, image: daily.puzzles[0].image });
    } catch (err) { next(err); }
  });

  router.post('/answer', async (req, res, next) => {
    try {
      const run = req.session.daily;
      const answer = req.body?.answer;
      if (!run || run.date !== today(now())) return res.status(400).json({ error: 'Start today\'s challenge first' });
      if (!Number.isInteger(answer)) return res.status(400).json({ error: 'Send a whole-number answer' });
      const daily = await db.getDaily(run.date);
      const { solution } = daily.puzzles[run.index];
      const ms = now() - run.issuedAt;
      const correct = answer === solution && ms <= SECONDS * 1000 + GRACE_MS;
      if (correct) { run.score += 100 * run.bonus; run.bonus *= 2; run.solved += 1; } else run.bonus = 1;
      run.index += 1;
      await db.finishDailyAttempt(req.session.userId, run.date, run.score, run.solved);
      const unlocked = await achievements.emit('puzzle:answered', req.session.userId, { purpose: 'daily', correct, ms });

      if (run.index < TOTAL) {
        run.issuedAt = now();
        return res.json({ correct, solution, score: run.score, solved: run.solved, bonus: run.bonus, unlocked, next: { index: run.index, image: daily.puzzles[run.index].image } });
      }
      // Finished: update the day streak.
      const user = await db.findUserById(req.session.userId);
      const streak = user.daily.lastDate === dayBefore(run.date) ? user.daily.streak + 1 : 1;
      await db.setDailyStreak(req.session.userId, { lastDate: run.date, streak, best: Math.max(user.daily.best, run.score) });
      unlocked.push(...await achievements.emit('daily:finished', req.session.userId, { streak, solved: run.solved, total: TOTAL }));
      delete req.session.daily;
      res.json({ correct, solution, score: run.score, solved: run.solved, finished: true, streak, unlocked });
    } catch (err) { next(err); }
  });

  router.get('/leaderboard', async (req, res, next) => {
    try {
      const date = today(now());
      res.json({ date, rows: await db.dailyLeaderboard(date, 10) });
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { createDailyRouter, TOTAL, SECONDS };
