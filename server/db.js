// MongoDB storage for players, match results, failed logins and the daily challenge.
// The rest of the server only calls the functions returned below, so it does not
// know (or care) which database is behind them. Until October 2026 this file used
// SQLite with prepared statements; the git history keeps that version for comparison.
//
// Queries are built from objects, never from strings, so user input cannot change
// a query (the NoSQL version of SQL injection); usernames are also checked against
// a strict pattern before they get here.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const mongoose = require('mongoose');
const { registerModels } = require('./models');

const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

// Shapes sent to the rest of the server (ids as strings, the same field names as before).
const userRow = (u) => u && ({
  id: String(u._id), username: u.username, role: u.role, password_hash: u.passwordHash,
  created_at: u.createdAt, last_login_at: u.lastLoginAt ?? null,
  achievements: u.achievements ?? [], daily: u.daily ?? { lastDate: '', streak: 0, best: 0 },
});
const scoreRow = (s) => ({
  id: String(s._id), username: s.username, mode: s.mode, difficulty: s.difficulty ?? 'medium', kills: s.kills, deaths: s.deaths, wave: s.wave,
  won: s.won ? 1 : 0, puzzles_solved: s.puzzlesSolved, puzzles_attempted: s.puzzlesAttempted,
  duration_s: s.durationS, created_at: s.createdAt, multiplayer: !!s.multiplayer,
});
const isId = (id) => mongoose.isValidObjectId(id);
const oid = (id) => new mongoose.Types.ObjectId(String(id));

async function openDatabase(uri) {
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const m = registerModels(conn);
  await Promise.all(Object.values(m).map((model) => model.init()));   // build indexes (unique names, TTL)

  return {
    connection: conn,
    models: m,
    close: () => conn.close(),

    // ----- players -----
    async createUser(username, passwordHash, role = 'player') {
      return userRow(await m.User.create({ username, passwordHash, role }));
    },
    async findUserByName(username) {
      return userRow(await m.User.findOne({ username: String(username) }).collation(CASE_INSENSITIVE).lean());
    },
    async findUserById(id) {
      return isId(id) ? userRow(await m.User.findById(id).lean()) : null;
    },
    setRole: (id, role) => m.User.updateOne({ _id: oid(id) }, { role }),
    setPassword: (id, hash) => m.User.updateOne({ _id: oid(id) }, { passwordHash: hash }),
    touchLogin: (id) => m.User.updateOne({ _id: oid(id) }, { lastLoginAt: new Date() }),
    async deleteUser(id) {
      if (!isId(id)) return false;
      await m.Score.deleteMany({ user: oid(id) });
      await m.DailyResult.deleteMany({ user: oid(id) });
      return (await m.User.deleteOne({ _id: oid(id) })).deletedCount === 1;
    },
    async listUsers() {
      const rows = await m.User.aggregate([
        { $sort: { createdAt: 1 } },
        { $lookup: { from: 'scores', localField: '_id', foreignField: 'user', as: 's' } },
        { $project: { username: 1, role: 1, createdAt: 1, games: { $size: '$s' }, kills: { $sum: '$s.kills' }, puzzles_solved: { $sum: '$s.puzzlesSolved' } } },
      ]);
      return rows.map((r) => ({ id: String(r._id), username: r.username, role: r.role, created_at: r.createdAt, games: r.games, kills: r.kills, puzzles_solved: r.puzzles_solved }));
    },
    // Adds an achievement once; returns true only the first time (write-once).
    async unlockAchievement(userId, id) {
      const res = await m.User.updateOne({ _id: oid(userId), 'achievements.id': { $ne: id } }, { $push: { achievements: { id, at: new Date() } } });
      return res.modifiedCount === 1;
    },
    setDailyStreak: (userId, daily) => m.User.updateOne({ _id: oid(userId) }, { daily }),
    // Updates the puzzle counters in one atomic step and returns the new values.
    async recordPuzzle(userId, { correct, crate }) {
      const update = correct
        ? { $inc: { 'counters.streak': 1, 'counters.crates': crate ? 1 : 0 } }
        : { $set: { 'counters.streak': 0 } };
      const u = await m.User.findOneAndUpdate({ _id: oid(userId) }, update, { new: true, projection: { counters: 1 } }).lean();
      return { streak: u?.counters?.streak ?? 0, crates: u?.counters?.crates ?? 0 };
    },

    // ----- Daily Banana Challenge -----
    getDaily: (date) => m.Daily.findOne({ date }).lean(),
    async createDaily(date, puzzles) {
      try {
        return (await m.Daily.create({ date, puzzles })).toObject();
      } catch (err) {
        if (err.code === 11000) return m.Daily.findOne({ date }).lean();   // someone else made today's set first
        throw err;
      }
    },
    // Registers today's single attempt; returns false if the player already started one.
    async startDailyAttempt(userId, date) {
      try {
        await m.DailyResult.create({ user: oid(userId), date, score: 0, solved: 0 });
        return true;
      } catch (err) {
        if (err.code === 11000) return false;
        throw err;
      }
    },
    finishDailyAttempt: (userId, date, score, solved) => m.DailyResult.updateOne({ user: oid(userId), date }, { score, solved }),
    dailyResult: (userId, date) => m.DailyResult.findOne({ user: oid(userId), date }).lean(),
    async dailyLeaderboard(date, limit = 10) {
      const rows = await m.DailyResult.aggregate([
        { $match: { date } }, { $sort: { score: -1, createdAt: 1 } }, { $limit: limit },
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
        { $project: { _id: 0, username: { $first: '$u.username' }, score: 1, solved: 1 } },
      ]);
      return rows;
    },

    // ----- match results -----
    async addScore(s) {
      const doc = await m.Score.create({
        user: oid(s.userId), mode: s.mode, difficulty: s.difficulty ?? 'medium', kills: s.kills, deaths: s.deaths, wave: s.wave ?? 0, won: !!s.won,
        puzzlesSolved: s.puzzlesSolved ?? 0, puzzlesAttempted: s.puzzlesAttempted ?? 0, durationS: s.durationS ?? 0,
        matchId: s.matchId, multiplayer: !!s.multiplayer,
      });
      return String(doc._id);
    },
    // since: a Date, or null for all time. Survival is ranked by wave, the rest by kills.
    async leaderboard(mode, limit = 20, since = null) {
      const main = mode === 'survival' ? 'wave' : 'kills';
      const rows = await m.Score.aggregate([
        { $match: { mode, ...(since ? { createdAt: { $gte: since } } : {}) } },
        { $sort: { [main]: -1, puzzlesSolved: -1, createdAt: 1 } },
        { $limit: limit },
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
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

    // ----- failed logins (lockout) -----
    recordFailedLogin: (username, now = Date.now()) => m.LoginAttempt.create({ username, failedAt: new Date(now) }),
    async recentFailedLogins(username, sinceMs) {
      const rows = await m.LoginAttempt.find({ username: String(username).toLowerCase(), failedAt: { $gt: new Date(sinceMs) } }).sort({ failedAt: -1 }).lean();
      return { n: rows.length, last: rows[0]?.failedAt.getTime() ?? null };
    },
    clearFailedLogins: (username) => m.LoginAttempt.deleteMany({ username: String(username).toLowerCase() }),
  };
}

module.exports = { openDatabase };
