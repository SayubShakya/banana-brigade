const { Schema } = require('mongoose');

const dailySchema = new Schema({
  date: { type: String, required: true, unique: true },
  puzzles: [{ _id: false, image: String, solution: Number }],
});

module.exports = { dailySchema };
