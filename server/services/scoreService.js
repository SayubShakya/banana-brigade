// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { badRequest } = require('../lib/errors');
const { cleanPowers } = require('./achievements');
const { parseMatchInput } = require('./matchService');

const MODES = ['quick', 'survival', 'training', 'team'];
const BOARDS = [...MODES, 'online', 'campaign'];
const PUBLIC_MODES = ['quick', 'survival', 'team', 'online', 'campaign'];
const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const clampLimit = (value, max, fallback) => Math.min(max, Math.max(1, Number.parseInt(value, 10) || fallback));

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

function createScoreService({ db, achievements, matchService }) {
  async function save(userId, body, tally) {
    const score = parseScore(userId, body);
    if (Object.values(score).some((v) => v === null)) throw badRequest('Send mode, kills, deaths and durationS as whole numbers');
    const input = parseMatchInput(body);
    if (input.draw) score.won = 0;
    const p = tally.take();
    score.puzzlesSolved = p.solved;
    score.puzzlesAttempted = p.attempted;
    const matchId = score.mode === 'training' ? null : await matchService.saveSolo(userId, score, input);
    const id = await db.addScore({ ...score, map: input.map, draw: input.draw, ...(matchId ? { matchId } : {}) });
    const unlocked = score.mode === 'training' ? [] : await achievements.emit('score:saved', score.userId, { ...score, won: !!score.won });
    const powers = score.mode === 'training' ? [] : cleanPowers(body.powers);
    if (powers.length) unlocked.push(...await achievements.emit('power:used', score.userId, { powers }));
    return { id, matchId, puzzlesSolved: score.puzzlesSolved, puzzlesAttempted: score.puzzlesAttempted, unlocked };
  }

  async function leaderboard({ mode: askedMode, limit: askedLimit, period: askedPeriod, by: askedBy }, userId = null) {
    const by = askedBy === 'career' ? 'career' : 'best';
    const mode = BOARDS.includes(askedMode) || (by === 'career' && askedMode === 'all') ? askedMode : 'quick';
    const limit = clampLimit(askedLimit, 50, 20);
    const period = askedPeriod === 'today' ? 'today' : 'all';
    const since = period === 'today' ? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) : null;
    const { rows, me } = await db.leaderboard(mode, limit, since, { by, userId });
    return { mode, period, by, rows, me };
  }

  async function mine(userId) {
    const [totals, recent] = await Promise.all([db.totalsForUser(userId), db.scoresForUser(userId, 20)]);
    return { totals, recent };
  }

  async function publicLeaderboard({ mode: askedMode, limit: askedLimit }) {
    const mode = PUBLIC_MODES.includes(askedMode) ? askedMode : 'quick';
    const { rows } = await db.leaderboard(mode, clampLimit(askedLimit, 50, 10));
    return {
      mode,
      rows: rows.map((r) => ({ rank: r.rank, username: r.username, kills: r.kills, deaths: r.deaths, wave: r.wave, puzzlesSolved: r.puzzles_solved, at: r.created_at })),
    };
  }

  return { save, leaderboard, mine, publicLeaderboard };
}

module.exports = { createScoreService, MODES };
