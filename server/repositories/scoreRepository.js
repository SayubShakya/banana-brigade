// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { scoreRow, isId, oid } = require('./rows');

function createScoreRepository(m) {
  return {
    async addScore(s) {
      const doc = await m.Score.create({
        user: oid(s.userId), mode: s.mode, difficulty: s.difficulty ?? 'medium', kills: s.kills, deaths: s.deaths, wave: s.wave ?? 0, won: !!s.won,
        puzzlesSolved: s.puzzlesSolved ?? 0, puzzlesAttempted: s.puzzlesAttempted ?? 0, durationS: s.durationS ?? 0,
        matchId: s.matchId, multiplayer: !!s.multiplayer,
      });
      return String(doc._id);
    },
    async leaderboard(mode, limit = 20, since = null) {
      const main = mode === 'survival' ? 'wave' : 'kills';
      const rows = await m.Score.aggregate([
        { $match: { mode, ...(since ? { createdAt: { $gte: since } } : {}) } },
        { $sort: { [main]: -1, puzzlesSolved: -1, createdAt: 1 } },
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
        { $match: { 'u.0': { $exists: true }, 'u.guest': { $ne: true } } },
        { $limit: limit },
        { $set: { username: { $first: '$u.username' } } },
      ]);
      return rows.map(scoreRow);
    },
    async scoresForUser(userId, limit = 20) {
      return (await m.Score.find({ user: oid(userId) }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean()).map(scoreRow);
    },
    async totalsForUser(userId) {
      const [t] = await m.Score.aggregate([
        { $match: { user: oid(userId) } },
        { $group: {
          _id: null, games: { $sum: 1 }, kills: { $sum: '$kills' }, deaths: { $sum: '$deaths' },
          best_wave: { $max: '$wave' }, best_kills: { $max: '$kills' }, wins: { $sum: { $cond: ['$won', 1, 0] } },
          seconds_played: { $sum: '$durationS' }, puzzles_solved: { $sum: '$puzzlesSolved' }, puzzles_attempted: { $sum: '$puzzlesAttempted' },
        } },
      ]);
      const zero = { games: 0, kills: 0, deaths: 0, best_wave: 0, best_kills: 0, wins: 0, seconds_played: 0, puzzles_solved: 0, puzzles_attempted: 0 };
      if (!t) return zero;
      delete t._id;
      return { ...zero, ...t };
    },
    async deleteScoresForUser(userId) {
      return isId(userId) ? (await m.Score.deleteMany({ user: oid(userId) })).deletedCount : 0;
    },
  };
}

module.exports = { createScoreRepository };
