// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

const reservePuzzleSchema = new Schema({
  image: { type: String, required: true },
  solution: { type: Number, required: true, min: 0, max: 9 },
}, { timestamps: { createdAt: 'at', updatedAt: false } });
reservePuzzleSchema.index({ at: -1 });

module.exports = { reservePuzzleSchema };
