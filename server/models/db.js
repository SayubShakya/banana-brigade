// MongoDB storage for players, match results, login limits, reset links and the daily challenge.
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
const { registerModels } = require('./index');

const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

// Shapes sent to the rest of the server (ids as strings, the same field names as before).
const userRow = (u) => u && ({
  id: String(u._id), username: u.username, role: u.role, password_hash: u.passwordHash,
  created_at: u.createdAt, last_login_at: u.lastLoginAt ?? null,
  guest: !!u.guest, suspended: u.suspended?.at ? u.suspended : null,
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
    // A temporary player with no password; MongoDB deletes it at expiresAt unless it is saved.
    async createGuest(username, expiresAt) {
      return userRow(await m.User.create({ username, guest: true, guestExpiresAt: expiresAt }));
    },
    // Turns a guest into a normal account: same _id, so scores, achievements and campaign
    // progress stay. Only works while the player is still a guest.
    async upgradeGuest(id, username, passwordHash) {
      const doc = await m.User.findOneAndUpdate(
        { _id: oid(id), guest: true },
        { $set: { username, passwordHash, guest: false }, $unset: { guestExpiresAt: 1 } },
        { returnDocument: 'after', lean: true },
      );
      return userRow(doc);
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
      await m.PasswordReset.deleteMany({ user: oid(id) });
      return (await m.User.deleteOne({ _id: oid(id) })).deletedCount === 1;
    },
    async listUsers() {
      const rows = await m.User.aggregate([
        { $sort: { createdAt: 1 } },
        { $lookup: { from: 'scores', localField: '_id', foreignField: 'user', as: 's' } },
        { $project: { username: 1, role: 1, guest: 1, suspended: 1, createdAt: 1, games: { $size: '$s' }, kills: { $sum: '$s.kills' }, puzzles_solved: { $sum: '$s.puzzlesSolved' } } },
      ]);
      return rows.map((r) => ({
        id: String(r._id), username: r.username, role: r.role, guest: !!r.guest, suspended: r.suspended?.at ? r.suspended : null,
        created_at: r.createdAt, games: r.games, kills: r.kills, puzzles_solved: r.puzzles_solved,
      }));
    },
    // Adds an achievement once; returns true only the first time (write-once).
    async unlockAchievement(userId, id) {
      const res = await m.User.updateOne({ _id: oid(userId), 'achievements.id': { $ne: id } }, { $push: { achievements: { id, at: new Date() } } });
      return res.modifiedCount === 1;
    },
    async campaignProgress(userId) {
      const u = await m.User.findById(oid(userId), { campaign: 1 }).lean();
      return Object.fromEntries((u?.campaign ?? []).map((c) => [c.mission, { stars: c.stars, bestS: c.bestS }]));
    },
    // Keeps the best stars and the fastest time for a mission.
    async saveMission(userId, mission, stars, timeS) {
      const progress = await this.campaignProgress(userId);
      const old = progress[mission];
      const entry = { mission, stars: Math.max(stars, old?.stars ?? 0), bestS: stars > 0 ? Math.min(timeS, old?.bestS ?? Infinity) : (old?.bestS ?? null) };
      await m.User.updateOne({ _id: oid(userId) }, { $pull: { campaign: { mission } } });
      await m.User.updateOne({ _id: oid(userId) }, { $push: { campaign: entry } });
      return { ...progress, [mission]: { stars: entry.stars, bestS: entry.bestS } };
    },
    // Adds Banana Powers to the player's set and returns the whole set.
    async addPowersUsed(userId, powers) {
      const u = await m.User.findOneAndUpdate({ _id: oid(userId) }, { $addToSet: { powersUsed: { $each: powers } } }, { returnDocument: 'after', projection: { powersUsed: 1 } }).lean();
      return u?.powersUsed ?? [];
    },
    setDailyStreak: (userId, daily) => m.User.updateOne({ _id: oid(userId) }, { daily }),
    // Updates the puzzle counters in one atomic step and returns the new values.
    async recordPuzzle(userId, { correct, crate }) {
      const update = correct
        ? { $inc: { 'counters.streak': 1, 'counters.crates': crate ? 1 : 0 } }
        : { $set: { 'counters.streak': 0 } };
      const u = await m.User.findOneAndUpdate({ _id: oid(userId) }, update, { returnDocument: 'after', projection: { counters: 1 } }).lean();
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
        await m.DailyResult.create({ user: oid(userId), date, score: 0, solved: 0, index: 0, bonus: 1, issuedAt: new Date() });
        return true;
      } catch (err) {
        if (err.code === 11000) return false;
        throw err;
      }
    },
    // Moves the run on by one puzzle, but only if it is still at `fromIndex`; returns
    // null when another request already answered that puzzle.
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
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
        // Guests (and accounts that no longer exist) are not on the leaderboard.
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
    // ----- the saved puzzle reserve (see services/pool.js) -----
    async saveReservePuzzle({ image, solution }, keep = 25) {
      await m.ReservePuzzle.create({ image, solution });
      // Keep only the newest `keep`.
      const newest = await m.ReservePuzzle.find({}, { _id: 1 }).sort({ at: -1, _id: -1 }).limit(keep).lean();
      await m.ReservePuzzle.deleteMany({ _id: { $nin: newest.map((p) => p._id) } });
    },
    loadReservePuzzles: async (limit = 25) => (await m.ReservePuzzle.find().sort({ at: -1, _id: -1 }).limit(limit).lean())
      .map((p) => ({ image: p.image, solution: p.solution })),

    // ----- suspensions and the admin audit log -----
    suspendUser: (id, reason, by) => m.User.updateOne({ _id: oid(id) }, { suspended: { at: new Date(), reason, by } }),
    restoreUser: (id) => m.User.updateOne({ _id: oid(id) }, { $unset: { suspended: 1 } }),
    async addAudit({ actor, actorName, action, target, targetName, reason, detail }) {
      await m.AuditLog.create({ actor: oid(actor), actorName, action, target: target ? oid(target) : undefined, targetName, reason, detail });
    },
    async listAudit(limit = 50) {
      const rows = await m.AuditLog.find().sort({ at: -1, _id: -1 }).limit(limit).lean();
      return rows.map((r) => ({ id: String(r._id), at: r.at, actor: r.actorName, action: r.action, target: r.targetName ?? null, reason: r.reason, detail: r.detail ?? null }));
    },

    // Everything stored about one player, for "download my data" (GDPR right of
    // access). The password hash is left out: it is not useful to the player and
    // should never leave the server.
    async exportUser(userId) {
      if (!isId(userId)) return null;
      const u = await m.User.findById(userId).lean();
      if (!u) return null;
      const [scores, daily] = await Promise.all([
        m.Score.find({ user: oid(userId) }).sort({ createdAt: -1 }).lean(),
        m.DailyResult.find({ user: oid(userId) }).sort({ date: -1 }).lean(),
      ]);
      const clean = ({ _id, __v, user, passwordHash, ...rest }) => rest;
      return {
        profile: { id: String(u._id), ...clean(u) },
        scores: scores.map(clean),
        dailyResults: daily.map(clean),
      };
    },
    async deleteScoresForUser(userId) {
      return isId(userId) ? (await m.Score.deleteMany({ user: oid(userId) })).deletedCount : 0;
    },

    // ----- rate limits (login lockout, reset requests) -----
    // Adds one to the counter for `key` and returns the new count and when the window
    // ends. The first hit starts a window of windowMs; later hits do not extend it.
    // A counter whose window has ended is removed first (MongoDB's TTL clean-up only
    // runs once a minute). If two first hits race, the unique key makes one fail with
    // 11000 and it simply tries again, now finding the other's document.
    async bumpCounter(key, { windowMs, now = Date.now(), username = null, ip = null }) {
      for (let attempt = 0; ; attempt++) {
        try {
          await m.RateLimit.deleteOne({ key, expiresAt: { $lte: new Date(now) } });
          const doc = await m.RateLimit.findOneAndUpdate(
            { key },
            { $inc: { n: 1 }, $setOnInsert: { username, ip, expiresAt: new Date(now + windowMs) } },
            { upsert: true, returnDocument: 'after', lean: true },
          );
          return { n: doc.n, resetAt: doc.expiresAt.getTime() };
        } catch (err) {
          if (err.code !== 11000 || attempt > 0) throw err;
        }
      }
    },
    undoCounter: (key) => m.RateLimit.updateOne({ key, n: { $gt: 0 } }, { $inc: { n: -1 } }),
    clearCounter: (key) => m.RateLimit.deleteOne({ key }),
    clearFailedLogins: (username) => m.RateLimit.deleteMany({ username: String(username).toLowerCase() }),
    countersFor: (username) => m.RateLimit.countDocuments({ username: String(username).toLowerCase() }),

    // ----- password reset links -----
    // Only the newest link for a player works: making a new one deletes the old ones.
    async createPasswordReset(userId, tokenHash, expiresAt) {
      await m.PasswordReset.deleteMany({ user: oid(userId) });
      await m.PasswordReset.create({ user: oid(userId), tokenHash, expiresAt });
    },
    // The player a reset link belongs to, if it is still valid (does not use it up).
    async peekPasswordReset(tokenHash, now = Date.now()) {
      const doc = await m.PasswordReset.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date(now) } }).lean();
      return doc ? String(doc.user) : null;
    },
    // Marks the link used and returns its player id, in one atomic step, so the same
    // link sent twice at once still works only once. Null if unknown, used or expired.
    async usePasswordReset(tokenHash, now = Date.now()) {
      const doc = await m.PasswordReset.findOneAndUpdate(
        { tokenHash, usedAt: null, expiresAt: { $gt: new Date(now) } },
        { usedAt: new Date(now) },
        { returnDocument: 'after', lean: true },
      );
      if (!doc) return null;
      await m.PasswordReset.deleteMany({ user: doc.user, _id: { $ne: doc._id } });
      return String(doc.user);
    },
  };
}

module.exports = { openDatabase };
