// Repository layer: the reserve pool of Banana API puzzles kept in MongoDB
// (used as a fallback when the Banana API is unavailable).

/**
 * Creates the reserve puzzle repository.
 * @param {object} m the Mongoose models
 */
function createReservePuzzleRepository(m) {
  return {
    /** Saves a puzzle, then deletes all but the newest 25 so the pool stays small. */
    async saveReservePuzzle({ image, solution }, keep = 25) {
      await m.ReservePuzzle.create({ image, solution });
      const newest = await m.ReservePuzzle.find({}, { _id: 1 }).sort({ at: -1, _id: -1 }).limit(keep).lean();
      await m.ReservePuzzle.deleteMany({ _id: { $nin: newest.map((p) => p._id) } });
    },
    /** Loads up to 25 stored puzzles, newest first, when the server starts. */
    loadReservePuzzles: async (limit = 25) => (await m.ReservePuzzle.find().sort({ at: -1, _id: -1 }).limit(limit).lean())
      .map((p) => ({ image: p.image, solution: p.solution })),
  };
}

module.exports = { createReservePuzzleRepository };
