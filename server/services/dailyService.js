// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { AppError, badRequest, notFound, conflict } = require('../lib/errors');

const TOTAL = 5;
const SECONDS = 20;
const GRACE_MS = 2000;
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const dayBefore = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

function createDailyService({ db, pool, achievements, now = () => Date.now() }) {
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

  async function status(userId) {
    const date = today(now());
    const [result, user] = await Promise.all([db.dailyResult(userId, date), db.findUserById(userId)]);
    const running = !!result && !result.finished;
    return {
      date, total: TOTAL, seconds: SECONDS, played: !!result && !running, running,
      result: result ? { score: result.score, solved: result.solved } : null,
      streak: user.daily.lastDate === date || user.daily.lastDate === dayBefore(date) ? user.daily.streak : 0,
      best: user.daily.best,
    };
  }

  async function start(userId) {
    const date = today(now());
    let daily;
    try {
      daily = await todaysPuzzles(date);
    } catch {
      throw new AppError(502, 'The Banana API is not responding. Try again in a moment.');
    }
    if (!(await db.startDailyAttempt(userId, date))) throw conflict('You have already played today\'s challenge. Come back tomorrow!');
    return { index: 0, total: TOTAL, seconds: SECONDS, image: daily.puzzles[0].image };
  }

  async function finish(userId, date, run, unlocked) {
    const user = await db.findUserById(userId);
    const streak = user.daily.lastDate === dayBefore(date) ? user.daily.streak + 1 : 1;
    await db.setDailyStreak(userId, { lastDate: date, streak, best: Math.max(user.daily.best, run.score) });
    unlocked.push(...await achievements.emit('daily:finished', userId, { streak, solved: run.solved, total: TOTAL }));
    return streak;
  }

  async function answer(userId, given) {
    const date = today(now());
    if (!Number.isInteger(given)) throw badRequest('Send a whole-number answer');
    const current = await db.dailyResult(userId, date);
    if (!current || current.finished) throw badRequest('Start today\'s challenge first');
    const daily = await db.getDaily(date);
    const { solution } = daily.puzzles[current.index];
    const ms = now() - new Date(current.issuedAt).getTime();
    const correct = given === solution && ms <= SECONDS * 1000 + GRACE_MS;
    const score = current.score + (correct ? 100 * current.bonus : 0);
    const solved = current.solved + (correct ? 1 : 0);
    const bonus = correct ? current.bonus * 2 : 1;
    const run = await db.advanceDaily(userId, date, current.index, {
      score, solved, bonus, issuedAt: new Date(now()), finished: current.index + 1 >= TOTAL,
    });
    if (!run) throw conflict('That puzzle was already answered');
    const unlocked = await achievements.emit('puzzle:answered', userId, { purpose: 'daily', correct, ms });

    if (run.index < TOTAL) {
      return { correct, solution, score: run.score, solved: run.solved, bonus: run.bonus, unlocked, next: { index: run.index, image: daily.puzzles[run.index].image } };
    }
    const streak = await finish(userId, date, run, unlocked);
    return { correct, solution, score: run.score, solved: run.solved, finished: true, streak, unlocked };
  }

  async function current(userId) {
    const date = today(now());
    const run = await db.dailyResult(userId, date);
    if (!run || run.finished) throw notFound('No challenge running');
    const daily = await db.getDaily(date);
    const left = Math.max(1, SECONDS - Math.floor((now() - new Date(run.issuedAt).getTime()) / 1000));
    return { index: run.index, total: TOTAL, seconds: left, image: daily.puzzles[run.index].image, score: run.score, solved: run.solved, bonus: run.bonus };
  }

  async function leaderboard() {
    const date = today(now());
    return { date, rows: await db.dailyLeaderboard(date, 10) };
  }

  return { status, start, answer, current, leaderboard };
}

module.exports = { createDailyService, TOTAL, SECONDS };
