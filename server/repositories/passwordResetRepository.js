// "Forgot password" links (only the token's hash is stored).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { oid } = require('./rows');

function createPasswordResetRepository(m) {
  return {
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

module.exports = { createPasswordResetRepository };
