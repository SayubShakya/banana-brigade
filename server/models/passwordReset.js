// Model layer: password reset tokens (virtual identity theme).
// Only a SHA-256 hash of the token is stored, so a database leak cannot be used to reset passwords.

const { Schema } = require('mongoose');

const passwordResetSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  usedAt: { type: Date, default: null },
  // TTL index: MongoDB deletes the document automatically when expiresAt passes.
  expiresAt: { type: Date, required: true, expires: 0 },
});

module.exports = { passwordResetSchema };
