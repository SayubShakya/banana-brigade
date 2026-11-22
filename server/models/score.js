// Model layer: one finished game's score for one player.
// MODES lists the game modes; other files import it so the list lives in one place.

const { Schema } = require('mongoose');

const MODES = ['quick', 'survival', 'training', 'team', 'online', 'campaign'];

const scoreSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mode: { type: String, enum: MODES, required: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  kills: { type: Number, default: 0, min: 0 },
  deaths: { type: Number, default: 0, min: 0 },
  wave: { type: Number, default: 0, min: 0 },
  won: { type: Boolean, default: false },
  draw: { type: Boolean, default: false },
  map: { type: String, default: '' },
  puzzlesSolved: { type: Number, default: 0 },
  puzzlesAttempted: { type: Number, default: 0 },
  durationS: { type: Number, default: 0 },
  matchId: String,
  multiplayer: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
// Indexes for the leaderboard (per mode by kills), a player's history (newest first)
// and checking whether a match already has a score from this user.
scoreSchema.index({ mode: 1, kills: -1 });
scoreSchema.index({ user: 1, createdAt: -1 });
scoreSchema.index({ matchId: 1, user: 1 });

module.exports = { scoreSchema, MODES };
