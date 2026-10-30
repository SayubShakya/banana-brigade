// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

// "Forgot password" links. Only a SHA-256 hash of the token is stored, so someone
// who reads the database still cannot use a link. A link works once (usedAt) and
// MongoDB deletes it 30 minutes after it was made (TTL index on expiresAt).
const passwordResetSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, expires: 0 },
});

module.exports = { passwordResetSchema };
