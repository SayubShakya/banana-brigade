// Model layer: the player account (virtual identity theme).
// Stores a bcrypt passwordHash, never the password itself, plus role, progress and suspension.

const { Schema } = require('mongoose');

// Collation strength 2 = compare ignoring upper/lower case, so "Sayub" and "sayub" are the same name.
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

const userSchema = new Schema({
  username: { type: String, required: true },
  // Guests have no password; everyone else must have a hash.
  passwordHash: { type: String, required() { return !this.guest; } },
  guest: { type: Boolean, default: false },
  // TTL index: guest accounts are deleted automatically when they expire.
  guestExpiresAt: { type: Date, expires: 0 },
  // Role-based access: only "player" or "admin" are allowed.
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
// Unique, case-insensitive username index: two users cannot pick "Bob" and "bob".
userSchema.index({ username: 1 }, { unique: true, collation: CASE_INSENSITIVE });

module.exports = { userSchema, CASE_INSENSITIVE };
