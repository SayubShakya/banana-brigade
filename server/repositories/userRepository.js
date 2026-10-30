// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { CASE_INSENSITIVE } = require('../models/user');
const { userRow, isId, oid } = require('./rows');

function createUserRepository(m) {
  async function campaignProgress(userId) {
    const u = await m.User.findById(oid(userId), { campaign: 1 }).lean();
    return Object.fromEntries((u?.campaign ?? []).map((c) => [c.mission, { stars: c.stars, bestS: c.bestS }]));
  }

  return {
    async createUser(username, passwordHash, role = 'player') {
      return userRow(await m.User.create({ username, passwordHash, role }));
    },
    async createGuest(username, expiresAt) {
      return userRow(await m.User.create({ username, guest: true, guestExpiresAt: expiresAt }));
    },
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
    async unlockAchievement(userId, id) {
      const res = await m.User.updateOne({ _id: oid(userId), 'achievements.id': { $ne: id } }, { $push: { achievements: { id, at: new Date() } } });
      return res.modifiedCount === 1;
    },
    campaignProgress,
    async saveMission(userId, mission, stars, timeS) {
      const progress = await campaignProgress(userId);
      const old = progress[mission];
      const entry = { mission, stars: Math.max(stars, old?.stars ?? 0), bestS: stars > 0 ? Math.min(timeS, old?.bestS ?? Infinity) : (old?.bestS ?? null) };
      await m.User.updateOne({ _id: oid(userId) }, { $pull: { campaign: { mission } } });
      await m.User.updateOne({ _id: oid(userId) }, { $push: { campaign: entry } });
      return { ...progress, [mission]: { stars: entry.stars, bestS: entry.bestS } };
    },
    async addPowersUsed(userId, powers) {
      const u = await m.User.findOneAndUpdate({ _id: oid(userId) }, { $addToSet: { powersUsed: { $each: powers } } }, { returnDocument: 'after', projection: { powersUsed: 1 } }).lean();
      return u?.powersUsed ?? [];
    },
    setDailyStreak: (userId, daily) => m.User.updateOne({ _id: oid(userId) }, { daily }),
    async recordPuzzle(userId, { correct, crate }) {
      const update = correct
        ? { $inc: { 'counters.streak': 1, 'counters.crates': crate ? 1 : 0 } }
        : { $set: { 'counters.streak': 0 } };
      const u = await m.User.findOneAndUpdate({ _id: oid(userId) }, update, { returnDocument: 'after', projection: { counters: 1 } }).lean();
      return { streak: u?.counters?.streak ?? 0, crates: u?.counters?.crates ?? 0 };
    },
    suspendUser: (id, reason, by) => m.User.updateOne({ _id: oid(id) }, { suspended: { at: new Date(), reason, by } }),
    restoreUser: (id) => m.User.updateOne({ _id: oid(id) }, { $unset: { suspended: 1 } }),

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
  };
}

module.exports = { createUserRepository };
