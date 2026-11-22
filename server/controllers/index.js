// Controller layer entry point: builds every controller from the services.

const { createAuthController } = require('./authController');
const { createAccountController } = require('./accountController');
const { createScoresController } = require('./scoresController');
const { createCampaignController } = require('./campaignController');
const { createDailyController } = require('./dailyController');
const { createAdminController } = require('./adminController');
const { createPuzzleController } = require('./puzzleController');
const { createDocsController } = require('./docsController');
const { createMatchesController } = require('./matchesController');

/**
 * Creates all controllers.
 * @param {object} services the object from createServices()
 * @returns {object} one controller per area (auth, scores, admin...)
 */
function createControllers(services) {
  return {
    authController: createAuthController(services),
    accountController: createAccountController(services),
    scoresController: createScoresController(services),
    campaignController: createCampaignController(services),
    dailyController: createDailyController(services),
    adminController: createAdminController(services),
    puzzleController: createPuzzleController(services),
    matchesController: createMatchesController(services),
    docsController: createDocsController(),
  };
}

module.exports = { createControllers };
