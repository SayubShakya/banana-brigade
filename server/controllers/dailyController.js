// Controller layer: HTTP handlers for /api/daily, the Daily Challenge (login required by the router).

/**
 * Creates the daily challenge controller.
 * @param {object} services needs dailyService
 */
function createDailyController({ dailyService }) {
  return {
    /** GET /api/daily: today's status and my result. */
    async status(req, res) {
      res.json(await dailyService.status(req.session.userId));
    },

    /** POST /api/daily/start: starts today's single attempt. */
    async start(req, res) {
      res.json(await dailyService.start(req.session.userId));
    },

    /** POST /api/daily/answer: answers the current puzzle (body: answer). */
    async answer(req, res) {
      res.json(await dailyService.answer(req.session.userId, req.body?.answer));
    },

    /** GET /api/daily/current: the running puzzle after a page reload. */
    async current(req, res) {
      res.json(await dailyService.current(req.session.userId));
    },

    /** GET /api/daily/leaderboard: today's top 10. */
    async leaderboard(req, res) {
      res.json(await dailyService.leaderboard());
    },
  };
}

module.exports = { createDailyController };
