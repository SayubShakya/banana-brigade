// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

const userSchema = new Schema({
  username: { type: String, required: true },
  passwordHash: { type: String, required() { return !this.guest; } },
  guest: { type: Boolean, default: false },
  guestExpiresAt: { type: Date, expires: 0 },
  role: { type: String, enum: ['player', 'admin'], default: 'player' },
  achievements: [{ _id: false, id: String, at: { type: Date, default: Date.now } }],
  daily: {
    lastDate: { type: String, default: '' },
    streak: { type: Number, default: 0 },
    best: { type: Number, default: 0 },
  },
  counters: {
    streak: { type: Number, default: 0 },
    crates: { type: Number, default: 0 },
  },
  campaign: [{ _id: false, mission: Number, stars: Number, bestS: Number }],
  powersUsed: [String],
  suspended: { at: Date, reason: String, by: String },
  lastLoginAt: Date,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
userSchema.index({ username: 1 }, { unique: true, collation: CASE_INSENSITIVE });

module.exports = { userSchema, CASE_INSENSITIVE };
