// Controller layer: HTTP handler for /api/matches (match replays).

/**
 * Creates the matches controller.
 * @param {object} services needs matchService
 */
function createMatchesController({ matchService }) {
  return {
    /** GET /api/matches/:matchId: one replay, only if this user played in it (or is an admin). */
    async get(req, res) {
      res.json(await matchService.get(req.user, req.params.matchId));
    },
  };
}

module.exports = { createMatchesController };
