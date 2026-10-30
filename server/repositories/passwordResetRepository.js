// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { oid } = require('./rows');

function createPasswordResetRepository(m) {
  return {
    async createPasswordReset(userId, tokenHash, expiresAt) {
      await m.PasswordReset.deleteMany({ user: oid(userId) });
      await m.PasswordReset.create({ user: oid(userId), tokenHash, expiresAt });
    },
    async peekPasswordReset(tokenHash, now = Date.now()) {
      const doc = await m.PasswordReset.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date(now) } }).lean();
      return doc ? String(doc.user) : null;
    },
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
