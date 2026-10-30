// HTTP side of /api/campaign.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { puzzleTally } = require('../lib/httpSession');

function createCampaignController({ campaignService }) {
  return {
    async overview(req, res) {
      res.json(await campaignService.overview(req.session.userId));
    },

    async result(req, res) {
      res.json(await campaignService.finishMission(req.session.userId, req.body ?? {}, puzzleTally(req)));
    },
  };
}

module.exports = { createCampaignController };
