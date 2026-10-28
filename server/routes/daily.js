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
//   GET  /api/daily/current      -> the running puzzle (after a reload)
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
      const running = !!result && !result.finished;
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
      // Get today's puzzles before using up the attempt, so an API outage does not
      // cost the player their one go for the day.
      let daily;
      try {
        daily = await todaysPuzzles(date);
      } catch {
        return res.status(502).json({ error: 'The Banana API is not responding. Try again in a moment.' });
      }
      if (!(await db.startDailyAttempt(req.session.userId, date))) {
        return res.status(409).json({ error: 'You have already played today\'s challenge. Come back tomorrow!' });
      }
      res.json({ index: 0, total: TOTAL, seconds: SECONDS, image: daily.puzzles[0].image });
    } catch (err) { next(err); }
  });

  router.post('/answer', async (req, res, next) => {
    try {
      const date = today(now());
      const answer = req.body?.answer;
      if (!Number.isInteger(answer)) return res.status(400).json({ error: 'Send a whole-number answer' });
      const current = await db.dailyResult(req.session.userId, date);
      if (!current || current.finished) return res.status(400).json({ error: 'Start today\'s challenge first' });
      const daily = await db.getDaily(date);
      const { solution } = daily.puzzles[current.index];
      const ms = now() - new Date(current.issuedAt).getTime();
      const correct = answer === solution && ms <= SECONDS * 1000 + GRACE_MS;
      const score = current.score + (correct ? 100 * current.bonus : 0);
      const solved = current.solved + (correct ? 1 : 0);
      const bonus = correct ? current.bonus * 2 : 1;
      const run = await db.advanceDaily(req.session.userId, date, current.index, {
        score, solved, bonus, issuedAt: new Date(now()), finished: current.index + 1 >= TOTAL,
      });
      if (!run) return res.status(409).json({ error: 'That puzzle was already answered' });
      const unlocked = await achievements.emit('puzzle:answered', req.session.userId, { purpose: 'daily', correct, ms });

      if (run.index < TOTAL) {
        return res.json({ correct, solution, score: run.score, solved: run.solved, bonus: run.bonus, unlocked, next: { index: run.index, image: daily.puzzles[run.index].image } });
      }
      // Finished: update the day streak.
      const user = await db.findUserById(req.session.userId);
      const streak = user.daily.lastDate === dayBefore(date) ? user.daily.streak + 1 : 1;
      await db.setDailyStreak(req.session.userId, { lastDate: date, streak, best: Math.max(user.daily.best, run.score) });
      unlocked.push(...await achievements.emit('daily:finished', req.session.userId, { streak, solved: run.solved, total: TOTAL }));
      res.json({ correct, solution, score: run.score, solved: run.solved, finished: true, streak, unlocked });
    } catch (err) { next(err); }
  });

  // Resume a run after a page reload: the current puzzle and the time already used.
  router.get('/current', async (req, res, next) => {
    try {
      const date = today(now());
      const run = await db.dailyResult(req.session.userId, date);
      if (!run || run.finished) return res.status(404).json({ error: 'No challenge running' });
      const daily = await db.getDaily(date);
      const left = Math.max(1, SECONDS - Math.floor((now() - new Date(run.issuedAt).getTime()) / 1000));
      res.json({ index: run.index, total: TOTAL, seconds: left, image: daily.puzzles[run.index].image, score: run.score, solved: run.solved, bonus: run.bonus });
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
