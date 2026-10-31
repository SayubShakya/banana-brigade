// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

function createMatchesController({ matchService }) {
  return {
    async get(req, res) {
      res.json(await matchService.get(req.user, req.params.matchId));
    },
  };
}

module.exports = { createMatchesController };
