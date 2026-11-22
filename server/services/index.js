// Service layer entry point: builds every service and gives each one only the
// dependencies it needs (dependency injection), so services are easy to test.

const { createRateLimiter } = require('./rateLimiter');
const { createAuthService } = require('./authService');
const { createAccountService } = require('./accountService');
const { createScoreService } = require('./scoreService');
const { createCampaignService } = require('./campaignService');
const { createDailyService } = require('./dailyService');
const { createAdminService } = require('./adminService');
const { createPuzzleService } = require('./puzzleService');
const { createMatchService } = require('./matchService');

/**
 * Creates all services.
 * @param {object} deps db (repositories), pool (Banana API puzzles), puzzleStore,
 *   achievements (event bus), sessions, eventLog, sendResetLink, appUrl, pwnedCheck
 * @returns {object} authService, scoreService, puzzleService, and the rest
 */
function createServices({ db, pool, puzzleStore, achievements, sessions, eventLog, sendResetLink, appUrl, pwnedCheck }) {
  const limiter = createRateLimiter({ db });
  const matchService = createMatchService({ db });
  return {
    achievements,
    matchService,
    authService: createAuthService({ db, limiter, sessions, sendResetLink, appUrl, pwnedCheck, eventLog }),
    accountService: createAccountService({ db, sessions, eventLog }),
    scoreService: createScoreService({ db, achievements, matchService }),
    campaignService: createCampaignService({ db, achievements, matchService }),
    dailyService: createDailyService({ db, pool, achievements }),
    adminService: createAdminService({ db, pool, sessions, eventLog }),
    puzzleService: createPuzzleService({ pool, puzzleStore, achievements }),
  };
}

module.exports = { createServices };
