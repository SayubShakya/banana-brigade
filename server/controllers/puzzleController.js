// HTTP side of /api/puzzle, /api/status and /api/achievements.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { puzzleTally } = require('../lib/httpSession');

function createPuzzleController({ puzzleService, achievements }) {
  return {
    async issue(req, res) {
      const puzzle = await puzzleService.issue(req.query.purpose);
      res.set('Cache-Control', 'no-store');
      res.json(puzzle);
    },

    async answer(req, res) {
      res.json(await puzzleService.answer(req.session.userId, req.body ?? {}, puzzleTally(req)));
    },

    status(req, res) {
      res.json(puzzleService.status());
    },

    async achievements(req, res) {
      res.json(await achievements.forPlayer(req.session.userId));
    },
  };
}

module.exports = { createPuzzleController };
