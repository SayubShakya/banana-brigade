// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

const dailySchema = new Schema({
  date: { type: String, required: true, unique: true },   // 'YYYY-MM-DD' (UTC)
  puzzles: [{ _id: false, image: String, solution: Number }],
});

module.exports = { dailySchema };
