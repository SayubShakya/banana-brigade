// Match results and the leaderboards.
// Kills and deaths come from the browser (the game runs there), but the Banana
// puzzle counts are taken from the server-side session tally, where every answer was
// checked. A player can therefore not fake their puzzle record.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { badRequest } = require('../lib/errors');
const { cleanPowers } = require('./achievements');

const MODES = ['quick', 'survival', 'training', 'team'];   // modes a browser may report
const BOARDS = [...MODES, 'online'];                          // online scores are written by the server
const PUBLIC_MODES = ['quick', 'survival', 'team', 'online', 'campaign'];
const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const clampLimit = (value, max, fallback) => Math.min(max, Math.max(1, Number.parseInt(value, 10) || fallback));

// A result sent by the browser, checked field by field (null marks a bad field).
function parseScore(userId, b) {
  return {
    userId,
    mode: MODES.includes(b.mode) ? b.mode : null,
    difficulty: ['easy', 'medium', 'hard'].includes(b.difficulty ?? 'medium') ? (b.difficulty ?? 'medium') : null,
    kills: int(b.kills, 500),
    deaths: int(b.deaths, 500),
    wave: int(b.wave ?? 0, 200),
    won: b.won ? 1 : 0,
    durationS: int(b.durationS, 3600),
  };
}

function createScoreService({ db, achievements }) {
  // tally: this session's puzzle results (lib/httpSession.js); they are used for this
  // match and then start again from zero.
  async function save(userId, body, tally) {
    const score = parseScore(userId, body);
    if (Object.values(score).some((v) => v === null)) throw badRequest('Send mode, kills, deaths and durationS as whole numbers');
    const p = tally.take();
    score.puzzlesSolved = p.solved;
    score.puzzlesAttempted = p.attempted;
    const id = await db.addScore(score);
    const unlocked = score.mode === 'training' ? [] : await achievements.emit('score:saved', score.userId, { ...score, won: !!score.won });
    const powers = score.mode === 'training' ? [] : cleanPowers(body.powers);   // only real power names, not in Training
    if (powers.length) unlocked.push(...await achievements.emit('power:used', score.userId, { powers }));
    return { id, puzzlesSolved: score.puzzlesSolved, puzzlesAttempted: score.puzzlesAttempted, unlocked };
  }

  // period=today shows only games since midnight UTC (the "daily leaders").
  async function leaderboard({ mode: askedMode, limit: askedLimit, period: askedPeriod }) {
    const mode = BOARDS.includes(askedMode) ? askedMode : 'quick';
    const limit = clampLimit(askedLimit, 50, 20);
    const period = askedPeriod === 'today' ? 'today' : 'all';
    const since = period === 'today' ? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) : null;
    return { mode, period, rows: await db.leaderboard(mode, limit, since) };
  }

  async function mine(userId) {
    const [totals, recent] = await Promise.all([db.totalsForUser(userId), db.scoresForUser(userId, 20)]);
    return { totals, recent };
  }

  // The read-only leaderboard for other websites (no guests, no ids).
  async function publicLeaderboard({ mode: askedMode, limit: askedLimit }) {
    const mode = PUBLIC_MODES.includes(askedMode) ? askedMode : 'quick';
    const rows = await db.leaderboard(mode, clampLimit(askedLimit, 50, 10));
    return {
      mode,
      rows: rows.map((r, i) => ({ rank: i + 1, username: r.username, kills: r.kills, deaths: r.deaths, wave: r.wave, puzzlesSolved: r.puzzles_solved, at: r.created_at })),
    };
  }

  return { save, leaderboard, mine, publicLeaderboard };
}

module.exports = { createScoreService, MODES };
