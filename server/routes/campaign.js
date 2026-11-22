// Routes layer: /api/campaign URLs.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

/** Builds the campaign router. */
function createCampaignRouter({ campaignController: campaign }) {
  const router = express.Router();
  // Every campaign route needs a logged-in player.
  router.use(requireLogin);

  router.get('/', campaign.overview);
  router.post('/result', campaign.result);

  return router;
}

module.exports = { createCampaignRouter };
