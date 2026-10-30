// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

const CASE_INSENSITIVE = { locale: 'en', strength: 2 };   // "Sayub" and "sayub" are the same name

const userSchema = new Schema({
  username: { type: String, required: true },
  // Guests have no password until they save their account (see /api/auth/guest).
  passwordHash: { type: String, required() { return !this.guest; } },
  guest: { type: Boolean, default: false },
  guestExpiresAt: { type: Date, expires: 0 },   // MongoDB deletes an unsaved guest 7 days after it was made
  role: { type: String, enum: ['player', 'admin'], default: 'player' },
  achievements: [{ _id: false, id: String, at: { type: Date, default: Date.now } }],
  daily: {
    lastDate: { type: String, default: '' },   // 'YYYY-MM-DD' (UTC) of the last finished challenge
    streak: { type: Number, default: 0 },
    best: { type: Number, default: 0 },
  },
  counters: {
    streak: { type: Number, default: 0 },   // Banana puzzles correct in a row (any mode)
    crates: { type: Number, default: 0 },   // banana crates opened
  },
  // Campaign progress: best stars and fastest win per mission.
  campaign: [{ _id: false, mission: Number, stars: Number, bestS: Number }],
  powersUsed: [String],   // Banana Powers this player has used at least once
  // Set by an admin; a suspended player is logged out and cannot log in until restored.
  suspended: { at: Date, reason: String, by: String },
  lastLoginAt: Date,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
userSchema.index({ username: 1 }, { unique: true, collation: CASE_INSENSITIVE });

module.exports = { userSchema, CASE_INSENSITIVE };
