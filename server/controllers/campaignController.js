// Controller layer: HTTP handlers for /api/campaign (login required by the router).

const { puzzleTally } = require('../lib/httpSession');

/**
 * Creates the campaign controller.
 * @param {object} services needs campaignService
 */
function createCampaignController({ campaignService }) {
  return {
    /** GET /api/campaign: chapters, missions and my stars. */
    async overview(req, res) {
      res.json(await campaignService.overview(req.session.userId));
    },

    /** POST /api/campaign/result: saves a mission result; puzzle counts come from the session tally. */
    async result(req, res) {
      res.json(await campaignService.finishMission(req.session.userId, req.body ?? {}, puzzleTally(req)));
    },
  };
}

module.exports = { createCampaignController };
