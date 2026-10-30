// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { oid } = require('./rows');

function createDailyRepository(m) {
  return {
    getDaily: (date) => m.Daily.findOne({ date }).lean(),
    async createDaily(date, puzzles) {
      try {
        return (await m.Daily.create({ date, puzzles })).toObject();
      } catch (err) {
        if (err.code === 11000) return m.Daily.findOne({ date }).lean();
        throw err;
      }
    },
    async startDailyAttempt(userId, date) {
      try {
        await m.DailyResult.create({ user: oid(userId), date, score: 0, solved: 0, index: 0, bonus: 1, issuedAt: new Date() });
        return true;
      } catch (err) {
        if (err.code === 11000) return false;
        throw err;
      }
    },
    advanceDaily: (userId, date, fromIndex, set) => m.DailyResult.findOneAndUpdate(
      { user: oid(userId), date, index: fromIndex, finished: false },
      { $set: set, $inc: { index: 1 } },
      { returnDocument: 'after' },
    ).lean(),
    dailyResult: (userId, date) => m.DailyResult.findOne({ user: oid(userId), date }).lean(),
    async dailyLeaderboard(date, limit = 10) {
      const rows = await m.DailyResult.aggregate([
        { $match: { date } }, { $sort: { score: -1, createdAt: 1 } },
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
        { $match: { 'u.0': { $exists: true }, 'u.guest': { $ne: true } } },
        { $limit: limit },
        { $project: { _id: 0, username: { $first: '$u.username' }, score: 1, solved: 1 } },
      ]);
      return rows;
    },
  };
}

module.exports = { createDailyRepository };
