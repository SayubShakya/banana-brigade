// The saved puzzle reserve (see services/pool.js).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

function createReservePuzzleRepository(m) {
  return {
    async saveReservePuzzle({ image, solution }, keep = 25) {
      await m.ReservePuzzle.create({ image, solution });
      // Keep only the newest `keep`.
      const newest = await m.ReservePuzzle.find({}, { _id: 1 }).sort({ at: -1, _id: -1 }).limit(keep).lean();
      await m.ReservePuzzle.deleteMany({ _id: { $nin: newest.map((p) => p._id) } });
    },
    loadReservePuzzles: async (limit = 25) => (await m.ReservePuzzle.find().sort({ at: -1, _id: -1 }).limit(limit).lean())
      .map((p) => ({ image: p.image, solution: p.solution })),
  };
}

module.exports = { createReservePuzzleRepository };
