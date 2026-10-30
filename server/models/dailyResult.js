// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

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
dailyResultSchema.index({ user: 1, date: 1 }, { unique: true });
dailyResultSchema.index({ date: 1, score: -1 });

module.exports = { dailyResultSchema };
