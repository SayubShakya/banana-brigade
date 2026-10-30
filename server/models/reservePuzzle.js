// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

// The puzzle pool's reserve, saved so the game still has puzzles after a restart
// while the Banana API is down (services/pool.js). Only the newest few are kept.
const reservePuzzleSchema = new Schema({
  image: { type: String, required: true },
  solution: { type: Number, required: true, min: 0, max: 9 },
}, { timestamps: { createdAt: 'at', updatedAt: false } });
reservePuzzleSchema.index({ at: -1 });

module.exports = { reservePuzzleSchema };
