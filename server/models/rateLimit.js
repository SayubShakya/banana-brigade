// Model layer: counters for login rate limiting and account lockout.
// key is e.g. a username or IP; n is how many failed attempts so far.

const { Schema } = require('mongoose');

const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  username: { type: String, lowercase: true, default: null },
  ip: { type: String, default: null },
  n: { type: Number, default: 0 },
  // TTL index: the counter deletes itself when its time window ends.
  expiresAt: { type: Date, required: true, expires: 0 },
});

module.exports = { rateLimitSchema };
