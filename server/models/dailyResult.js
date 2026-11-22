// Model layer: one player's progress and score in one day's Daily Challenge.
// index = which puzzle they are on, issuedAt = when it was handed out (for speed bonus).

const { Schema } = require('mongoose');

const dailyResultSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  score: { type: Number, default: 0 },
  solved: { type: Number, default: 0 },
  index: { type: Number, default: 0 },
  bonus: { type: Number, default: 1 },
  issuedAt: { type: Date, default: Date.now },
  finished: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
// Unique (user, date): a player can only have one result per day, enforced by MongoDB.
dailyResultSchema.index({ user: 1, date: 1 }, { unique: true });
// Used for the daily leaderboard (by date, highest score first).
dailyResultSchema.index({ date: 1, score: -1 });

module.exports = { dailyResultSchema };
