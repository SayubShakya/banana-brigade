// Model layer: the Daily Challenge puzzle set for one date.
// Everyone gets the same Banana API puzzles on the same day (date is unique).

const { Schema } = require('mongoose');

const dailySchema = new Schema({
  date: { type: String, required: true, unique: true },
  puzzles: [{ _id: false, image: String, solution: Number }],
});

module.exports = { dailySchema };
