// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

function createDailyController({ dailyService }) {
  return {
    async status(req, res) {
      res.json(await dailyService.status(req.session.userId));
    },

    async start(req, res) {
      res.json(await dailyService.start(req.session.userId));
    },

    async answer(req, res) {
      res.json(await dailyService.answer(req.session.userId, req.body?.answer));
    },

    async current(req, res) {
      res.json(await dailyService.current(req.session.userId));
    },

    async leaderboard(req, res) {
      res.json(await dailyService.leaderboard());
    },
  };
}

module.exports = { createDailyController };
