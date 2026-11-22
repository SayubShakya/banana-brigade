// Model layer: the reserve pool of Banana API puzzles saved in MongoDB.
// If the Banana API is down, the game can still serve these stored puzzles.

const { Schema } = require('mongoose');

const reservePuzzleSchema = new Schema({
  image: { type: String, required: true },
  solution: { type: Number, required: true, min: 0, max: 9 },
}, { timestamps: { createdAt: 'at', updatedAt: false } });
reservePuzzleSchema.index({ at: -1 });

module.exports = { reservePuzzleSchema };
