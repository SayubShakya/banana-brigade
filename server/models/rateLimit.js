// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  username: { type: String, lowercase: true, default: null },
  ip: { type: String, default: null },
  n: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
});

module.exports = { rateLimitSchema };
