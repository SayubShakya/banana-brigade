// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

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

module.exports = { dailyResultSchema };
