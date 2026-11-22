const express = require('express');
const { requireLogin } = require('../middleware/auth');

function createCampaignRouter({ campaignController: campaign }) {
  const router = express.Router();
  router.use(requireLogin);

  router.get('/', campaign.overview);
  router.post('/result', campaign.result);

  return router;
}

module.exports = { createCampaignRouter };
