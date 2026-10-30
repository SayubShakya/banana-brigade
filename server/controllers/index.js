// Builds every controller from the services.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { createAuthController } = require('./authController');
const { createAccountController } = require('./accountController');

function createControllers(services) {
  return {
    authController: createAuthController(services),
    accountController: createAccountController(services),
  };
}

module.exports = { createControllers };
