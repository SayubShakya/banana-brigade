// /api/campaign (login needed for every route).
//
//   GET  /api/campaign          -> { chapters, missions, progress, stars }
//   POST /api/campaign/result   { mission, won, kills, deaths, continues, timeS }
//                               -> { stars, best, progress, unlockedNext, unlocked }
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

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
