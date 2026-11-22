// Repository layer: password reset tokens (virtual identity theme).
// Only token hashes are stored; the real token is only in the reset link.

const { oid } = require('./rows');

/**
 * Creates the password reset repository.
 * @param {object} m the Mongoose models
 */
function createPasswordResetRepository(m) {
  return {
    /** Saves a new reset token hash. Older tokens for the same user are deleted first, so only the newest link works. */
    async createPasswordReset(userId, tokenHash, expiresAt) {
      await m.PasswordReset.deleteMany({ user: oid(userId) });
      await m.PasswordReset.create({ user: oid(userId), tokenHash, expiresAt });
    },
    /** Checks a token is valid (unused and not expired) without using it up. @returns user id or null */
    async peekPasswordReset(tokenHash, now = Date.now()) {
      const doc = await m.PasswordReset.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date(now) } }).lean();
      return doc ? String(doc.user) : null;
    },
    /**
     * Uses a token once: the find-and-mark-used is one atomic update, so the same
     * link cannot be used twice even if clicked twice at the same moment.
     * @returns {Promise<string|null>} the user id, or null if invalid/expired/used
     */
    async usePasswordReset(tokenHash, now = Date.now()) {
      const doc = await m.PasswordReset.findOneAndUpdate(
        { tokenHash, usedAt: null, expiresAt: { $gt: new Date(now) } },
        { usedAt: new Date(now) },
        { returnDocument: 'after', lean: true },
      );
      if (!doc) return null;
      // Any other outstanding reset links for this user stop working.
      await m.PasswordReset.deleteMany({ user: doc.user, _id: { $ne: doc._id } });
      return String(doc.user);
    },
  };
}

module.exports = { createPasswordResetRepository };
