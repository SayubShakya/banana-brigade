// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

// One counter per key and time window, for login limits and reset requests. Keys look
// like "login:sayub|1.2.3.4" (this name from this IP) or "login-ip:1.2.3.4" (this IP,
// any name). The counter goes up with an atomic $inc, so many requests sent at the
// same moment each get their own number and none can slip past the limit.
// MongoDB deletes the document once expiresAt has passed (TTL index).
const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  username: { type: String, lowercase: true, default: null },   // so deleting an account can clear its counters
  ip: { type: String, default: null },
  n: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
});

module.exports = { rateLimitSchema };
