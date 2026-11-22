// Repository layer: MongoDB queries for user accounts (virtual identity theme)
// and per-player progress such as achievements, campaign and streaks.

const { CASE_INSENSITIVE } = require('../models/user');
const { userRow, scoreRow, isId, oid } = require('./rows');
const { createMatchRepository } = require('./matchRepository');

/**
 * Creates the user repository.
 * @param {object} m the Mongoose models
 */
function createUserRepository(m) {
  const { forgetPlayerInMatches, matchesForUser } = createMatchRepository(m);

  /** Returns campaign progress as { missionNumber: { stars, bestS } }. */
  async function campaignProgress(userId) {
    const u = await m.User.findById(oid(userId), { campaign: 1 }).lean();
    return Object.fromEntries((u?.campaign ?? []).map((c) => [c.mission, { stars: c.stars, bestS: c.bestS }]));
  }

  return {
    /** Creates a normal account. Only the bcrypt hash is stored, never the password. */
    async createUser(username, passwordHash, role = 'player') {
      return userRow(await m.User.create({ username, passwordHash, role }));
    },
    /** Creates a guest account that MongoDB deletes automatically at expiresAt (TTL index). */
    async createGuest(username, expiresAt) {
      return userRow(await m.User.create({ username, guest: true, guestExpiresAt: expiresAt }));
    },
    /**
     * Turns a guest into a full account with a username and password.
     * The filter guest:true makes sure only real guest accounts can be upgraded.
     */
    async upgradeGuest(id, username, passwordHash) {
      const doc = await m.User.findOneAndUpdate(
        { _id: oid(id), guest: true },
        { $set: { username, passwordHash, guest: false }, $unset: { guestExpiresAt: 1 } },
        { returnDocument: 'after', lean: true },
      );
      return userRow(doc);
    },
    /** Finds a user by name, ignoring upper/lower case (collation). */
    async findUserByName(username) {
      return userRow(await m.User.findOne({ username: String(username) }).collation(CASE_INSENSITIVE).lean());
    },
    /** Finds a user by id; invalid ids return null instead of throwing. */
    async findUserById(id) {
      return isId(id) ? userRow(await m.User.findById(id).lean()) : null;
    },
    setRole: (id, role) => m.User.updateOne({ _id: oid(id) }, { role }),
    setPassword: (id, hash) => m.User.updateOne({ _id: oid(id) }, { passwordHash: hash }),
    touchLogin: (id) => m.User.updateOne({ _id: oid(id) }, { lastLoginAt: new Date() }),
    /**
     * Deletes an account and its personal data: scores, daily results, reset
     * tokens, and their name in matches (replaced with "Deleted soldier").
     */
    async deleteUser(id) {
      if (!isId(id)) return false;
      const u = await m.User.findById(oid(id), { username: 1 }).lean();
      await forgetPlayerInMatches(id, u?.username);
      await m.Score.deleteMany({ user: oid(id) });
      await m.DailyResult.deleteMany({ user: oid(id) });
      await m.PasswordReset.deleteMany({ user: oid(id) });
      return (await m.User.deleteOne({ _id: oid(id) })).deletedCount === 1;
    },
    /** Admin list of users with game counts and totals, joined from scores with $lookup. */
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
    /**
     * Gives an achievement once. The $ne filter means a second unlock does nothing,
     * even if two requests arrive together.
     * @returns {Promise<boolean>} true only the first time
     */
    async unlockAchievement(userId, id) {
      const res = await m.User.updateOne({ _id: oid(userId), 'achievements.id': { $ne: id } }, { $push: { achievements: { id, at: new Date() } } });
      return res.modifiedCount === 1;
    },
    campaignProgress,
    /** Saves a campaign mission result, keeping the best stars and fastest time. */
    async saveMission(userId, mission, stars, timeS) {
      const progress = await campaignProgress(userId);
      const old = progress[mission];
      const entry = { mission, stars: Math.max(stars, old?.stars ?? 0), bestS: stars > 0 ? Math.min(timeS, old?.bestS ?? Infinity) : (old?.bestS ?? null) };
      await m.User.updateOne({ _id: oid(userId) }, { $pull: { campaign: { mission } } });
      await m.User.updateOne({ _id: oid(userId) }, { $push: { campaign: entry } });
      return { ...progress, [mission]: { stars: entry.stars, bestS: entry.bestS } };
    },
    /** Remembers which power-ups the player has used ($addToSet avoids duplicates). */
    async addPowersUsed(userId, powers) {
      const u = await m.User.findOneAndUpdate({ _id: oid(userId) }, { $addToSet: { powersUsed: { $each: powers } } }, { returnDocument: 'after', projection: { powersUsed: 1 } }).lean();
      return u?.powersUsed ?? [];
    },
    setDailyStreak: (userId, daily) => m.User.updateOne({ _id: oid(userId) }, { daily }),
    /** Updates the correct-answer streak and crate count after each puzzle (atomic $inc). */
    async recordPuzzle(userId, { correct, crate }) {
      const update = correct
        ? { $inc: { 'counters.streak': 1, 'counters.crates': crate ? 1 : 0 } }
        : { $set: { 'counters.streak': 0 } };
      const u = await m.User.findOneAndUpdate({ _id: oid(userId) }, update, { returnDocument: 'after', projection: { counters: 1 } }).lean();
      return { streak: u?.counters?.streak ?? 0, crates: u?.counters?.crates ?? 0 };
    },
    // Admin suspension: stores when, why and by whom; restoreUser removes it.
    suspendUser: (id, reason, by) => m.User.updateOne({ _id: oid(id) }, { suspended: { at: new Date(), reason, by } }),
    restoreUser: (id) => m.User.updateOne({ _id: oid(id) }, { $unset: { suspended: 1 } }),

    /**
     * Data export for the player (their right to see their data): profile,
     * scores, history, matches and daily results. The password hash is removed.
     */
    async exportUser(userId) {
      if (!isId(userId)) return null;
      const u = await m.User.findById(userId).lean();
      if (!u) return null;
      const [scores, daily, matches] = await Promise.all([
        m.Score.find({ user: oid(userId) }).sort({ createdAt: -1, _id: -1 }).lean(),
        m.DailyResult.find({ user: oid(userId) }).sort({ date: -1 }).lean(),
        matchesForUser(userId),
      ]);
      // Strip internal fields and the password hash from every exported document.
      const clean = ({ _id, __v, user, passwordHash, ...rest }) => rest;
      return {
        profile: { id: String(u._id), ...clean(u) },
        scores: scores.map(clean),
        history: scores.filter((s) => s.mode !== 'training').map((s) => {
          const { username, ...row } = scoreRow(s);
          return row;
        }),
        matches,
        dailyResults: daily.map(clean),
      };
    },
  };
}

module.exports = { createUserRepository };
