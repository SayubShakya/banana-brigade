// Builds every service from its dependencies (the composition root for the business
// layer). Each service gets only what it needs, through its factory's parameters.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { createRateLimiter } = require('./rateLimiter');
const { createAuthService } = require('./authService');
const { createAccountService } = require('./accountService');

function createServices({ db, sessions, eventLog, sendResetLink, appUrl, pwnedCheck }) {
  const limiter = createRateLimiter({ db });
  return {
    authService: createAuthService({ db, limiter, sessions, sendResetLink, appUrl, pwnedCheck, eventLog }),
    accountService: createAccountService({ db, sessions, eventLog }),
  };
}

module.exports = { createServices };
