// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

const passwordResetSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, expires: 0 },
});

module.exports = { passwordResetSchema };
