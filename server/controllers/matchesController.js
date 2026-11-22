function createMatchesController({ matchService }) {
  return {
    async get(req, res) {
      res.json(await matchService.get(req.user, req.params.matchId));
    },
  };
}

module.exports = { createMatchesController };
