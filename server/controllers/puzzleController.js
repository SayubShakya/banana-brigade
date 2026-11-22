// Controller layer: HTTP handlers for Banana API puzzles, the status page and achievements.

const { puzzleTally } = require('../lib/httpSession');

/**
 * Creates the puzzle controller.
 * @param {object} services needs puzzleService and achievements
 */
function createPuzzleController({ puzzleService, achievements }) {
  return {
    /** GET /api/puzzle?purpose=: sends a puzzle image and id (never the answer). */
    async issue(req, res) {
      const puzzle = await puzzleService.issue(req.query.purpose);
      // no-store: every puzzle is new, so browsers and proxies must not cache it.
      res.set('Cache-Control', 'no-store');
      res.json(puzzle);
    },

    /** POST /api/puzzle/answer: checks an answer (body: puzzleId, answer). */
    async answer(req, res) {
      res.json(await puzzleService.answer(req.session.userId, req.body ?? {}, puzzleTally(req)));
    },

    /** GET /api/status: Banana API health (public). */
    status(req, res) {
      res.json(puzzleService.status());
    },

    /** GET /api/achievements: all achievements and the ones I have. */
    async achievements(req, res) {
      res.json(await achievements.forPlayer(req.session.userId));
    },
  };
}

module.exports = { createPuzzleController };
