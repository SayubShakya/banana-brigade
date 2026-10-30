// Builds every controller from the services.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { createAuthController } = require('./authController');
const { createAccountController } = require('./accountController');
const { createScoresController } = require('./scoresController');
const { createCampaignController } = require('./campaignController');
const { createDailyController } = require('./dailyController');

function createControllers(services) {
  return {
    authController: createAuthController(services),
    accountController: createAccountController(services),
    scoresController: createScoresController(services),
    campaignController: createCampaignController(services),
    dailyController: createDailyController(services),
  };
}

module.exports = { createControllers };
