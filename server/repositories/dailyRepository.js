// Repository layer: MongoDB queries for the Daily Challenge (puzzle sets and results).

const { oid } = require('./rows');

/**
 * Creates the daily challenge repository.
 * @param {object} m the Mongoose models
 */
function createDailyRepository(m) {
  return {
    /** Finds the puzzle set for a date ("YYYY-MM-DD"), or null. */
    getDaily: (date) => m.Daily.findOne({ date }).lean(),
    /**
     * Saves the puzzle set for a date. If two requests race to create the same
     * day, the second gets a duplicate key error (11000) and simply reads the winner's set.
     */
    async createDaily(date, puzzles) {
      try {
        return (await m.Daily.create({ date, puzzles })).toObject();
      } catch (err) {
        if (err.code === 11000) return m.Daily.findOne({ date }).lean();
        throw err;
      }
    },
    /**
     * Starts a player's attempt for today.
     * @returns {Promise<boolean>} false if they already started (unique index on user+date)
     */
    async startDailyAttempt(userId, date) {
      try {
        await m.DailyResult.create({ user: oid(userId), date, score: 0, solved: 0, index: 0, bonus: 1, issuedAt: new Date() });
        return true;
      } catch (err) {
        if (err.code === 11000) return false;
        throw err;
      }
    },
    /**
     * Moves the player to the next puzzle. The filter includes the current index
     * and finished:false, so two answers sent at once cannot both count (atomic update).
     */
    advanceDaily: (userId, date, fromIndex, set) => m.DailyResult.findOneAndUpdate(
      { user: oid(userId), date, index: fromIndex, finished: false },
      { $set: set, $inc: { index: 1 } },
      { returnDocument: 'after' },
    ).lean(),
    /** Gets one player's result for a date. */
    dailyResult: (userId, date) => m.DailyResult.findOne({ user: oid(userId), date }).lean(),
    /**
     * Aggregation for the daily leaderboard: today's results sorted by score
     * (earlier finishers win ties), joined to users with $lookup, guests and
     * deleted users removed, then only username/score/solved returned.
     */
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
