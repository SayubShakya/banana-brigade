// MongoDB document shapes (Mongoose schemas) for players, match results, login
// limits, password reset links and the Daily Banana Challenge.
//
// Compared with the old SQLite tables, a player's achievements and daily streak
// live inside the player document itself, so one read gives the whole profile.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

const MODES = ['quick', 'survival', 'training', 'team', 'online', 'campaign'];
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
  lastLoginAt: Date,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
userSchema.index({ username: 1 }, { unique: true, collation: CASE_INSENSITIVE });

const scoreSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mode: { type: String, enum: MODES, required: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  kills: { type: Number, default: 0, min: 0 },
  deaths: { type: Number, default: 0, min: 0 },
  wave: { type: Number, default: 0, min: 0 },
  won: { type: Boolean, default: false },
  puzzlesSolved: { type: Number, default: 0 },
  puzzlesAttempted: { type: Number, default: 0 },
  durationS: { type: Number, default: 0 },
  matchId: String,          // set for online matches (one per room)
  multiplayer: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
scoreSchema.index({ mode: 1, kills: -1 });
scoreSchema.index({ user: 1, createdAt: -1 });

// MongoDB deletes these by itself 10 minutes after the failed attempt (TTL index),
// which is exactly how long a lockout lasts.
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

// "Forgot password" links. Only a SHA-256 hash of the token is stored, so someone
// who reads the database still cannot use a link. A link works once (usedAt) and
// MongoDB deletes it 30 minutes after it was made (TTL index on expiresAt).
const passwordResetSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, expires: 0 },
});

const dailySchema = new Schema({
  date: { type: String, required: true, unique: true },   // 'YYYY-MM-DD' (UTC)
  puzzles: [{ _id: false, image: String, solution: Number }],
});

const dailyResultSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  score: { type: Number, default: 0 },
  solved: { type: Number, default: 0 },
  // The run's position lives here (not in the session) so it can be advanced
  // atomically: two answers sent at once cannot both score the same puzzle.
  index: { type: Number, default: 0 },
  bonus: { type: Number, default: 1 },
  issuedAt: { type: Date, default: Date.now },
  finished: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
dailyResultSchema.index({ user: 1, date: 1 }, { unique: true });   // one attempt a day
dailyResultSchema.index({ date: 1, score: -1 });

function registerModels(conn) {
  return {
    User: conn.model('User', userSchema),
    Score: conn.model('Score', scoreSchema),
    RateLimit: conn.model('RateLimit', rateLimitSchema),
    PasswordReset: conn.model('PasswordReset', passwordResetSchema),
    Daily: conn.model('Daily', dailySchema),
    DailyResult: conn.model('DailyResult', dailyResultSchema),
  };
}

module.exports = { registerModels, MODES };
