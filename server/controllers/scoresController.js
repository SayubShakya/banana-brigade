// Controller layer: HTTP handlers for scores, leaderboards and match history.

const { puzzleTally } = require('../lib/httpSession');

/**
 * Creates the scores controller.
 * @param {object} services needs scoreService and matchService
 */
function createScoresController({ scoreService, matchService }) {
  return {
    /** POST /api/scores: saves a finished game. Sends 201. */
    async save(req, res) {
      res.status(201).json(await scoreService.save(req.session.userId, req.body ?? {}, puzzleTally(req)));
    },

    /** GET /api/scores/leaderboard: public leaderboard; includes my own rank if logged in. */
    async leaderboard(req, res) {
      res.json(await scoreService.leaderboard(req.query, req.session.userId ?? null));
    },

    /** GET /api/scores/history: my match history, one page at a time. */
    async history(req, res) {
      res.json(await matchService.history(req.session.userId, req.query));
    },

    /** GET /api/scores/me: my totals and recent games. */
    async mine(req, res) {
      res.json(await scoreService.mine(req.session.userId));
    },

    /** GET /api/public/leaderboard: read-only leaderboard for other websites (CORS allowed). */
    async publicLeaderboard(req, res) {
      const { mode, rows } = await scoreService.publicLeaderboard(req.query);
      // Cache for 30 s so other sites calling this often do not load the database.
      res.set('Cache-Control', 'public, max-age=30').json({ game: 'Banana Brigade', mode, updated: new Date().toISOString(), rows });
    },
  };
}

module.exports = { createScoresController };
