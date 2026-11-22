// Service layer: the Daily Challenge. Five Banana API puzzles, the same for everyone
// each day, 20 seconds each, with a doubling bonus for answers in a row.

const { AppError, badRequest, notFound, conflict } = require('../lib/errors');

const TOTAL = 5;
const SECONDS = 20;
// Extra 2 s allowed for network delay before an answer counts as too late.
const GRACE_MS = 2000;
// Dates are "YYYY-MM-DD" in UTC, so everyone shares the same day.
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const dayBefore = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/**
 * Creates the daily challenge service.
 * @param {object} deps db, pool (Banana API puzzle pool), achievements, now (clock for tests)
 */
function createDailyService({ db, pool, achievements, now = () => Date.now() }) {
  /** Gets today's puzzle set, or builds and saves it from the Banana API the first time. */
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

  /** Today's status for the player: played or not, score, streak and best. */
  async function status(userId) {
    const date = today(now());
    const [result, user] = await Promise.all([db.dailyResult(userId, date), db.findUserById(userId)]);
    const running = !!result && !result.finished;
    return {
      date, total: TOTAL, seconds: SECONDS, played: !!result && !running, running,
      result: result ? { score: result.score, solved: result.solved } : null,
      // The streak only counts if they played today or yesterday.
      streak: user.daily.lastDate === date || user.daily.lastDate === dayBefore(date) ? user.daily.streak : 0,
      best: user.daily.best,
    };
  }

  /**
   * Starts today's challenge and returns the first image (never the solution).
   * @throws 502 if the Banana API fails; 409 if the player already played today
   */
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

  // Ends the run: updates the daily streak and best score, and fires 'daily:finished'.
  async function finish(userId, date, run, unlocked) {
    const user = await db.findUserById(userId);
    const streak = user.daily.lastDate === dayBefore(date) ? user.daily.streak + 1 : 1;
    await db.setDailyStreak(userId, { lastDate: date, streak, best: Math.max(user.daily.best, run.score) });
    unlocked.push(...await achievements.emit('daily:finished', userId, { streak, solved: run.solved, total: TOTAL }));
    return streak;
  }

  /**
   * Checks the answer to the current puzzle. The server times the answer from issuedAt,
   * so a late answer is wrong even if the number is right.
   * @returns {Promise<object>} result and the next image, or the final score
   * @throws 400 for bad input or no running challenge; 409 if this puzzle was already answered
   */
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
    // Bonus doubles after each correct answer and resets to 1 after a wrong one.
    const bonus = correct ? current.bonus * 2 : 1;
    // Atomic update keyed on the current index: a double submit only counts once.
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

  /** Resumes a running challenge (e.g. after a page reload) with the seconds left. */
  async function current(userId) {
    const date = today(now());
    const run = await db.dailyResult(userId, date);
    if (!run || run.finished) throw notFound('No challenge running');
    const daily = await db.getDaily(date);
    const left = Math.max(1, SECONDS - Math.floor((now() - new Date(run.issuedAt).getTime()) / 1000));
    return { index: run.index, total: TOTAL, seconds: left, image: daily.puzzles[run.index].image, score: run.score, solved: run.solved, bonus: run.bonus };
  }

  /** Today's top 10. */
  async function leaderboard() {
    const date = today(now());
    return { date, rows: await db.dailyLeaderboard(date, 10) };
  }

  return { status, start, answer, current, leaderboard };
}

module.exports = { createDailyService, TOTAL, SECONDS };
