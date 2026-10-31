// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { puzzleTally } = require('../lib/httpSession');

function createScoresController({ scoreService, matchService }) {
  return {
    async save(req, res) {
      res.status(201).json(await scoreService.save(req.session.userId, req.body ?? {}, puzzleTally(req)));
    },

    async leaderboard(req, res) {
      res.json(await scoreService.leaderboard(req.query, req.session.userId ?? null));
    },

    async history(req, res) {
      res.json(await matchService.history(req.session.userId, req.query));
    },

    async mine(req, res) {
      res.json(await scoreService.mine(req.session.userId));
    },

    async publicLeaderboard(req, res) {
      const { mode, rows } = await scoreService.publicLeaderboard(req.query);
      res.set('Cache-Control', 'public, max-age=30').json({ game: 'Banana Brigade', mode, updated: new Date().toISOString(), rows });
    },
  };
}

module.exports = { createScoresController };
