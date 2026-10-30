// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { createRateLimiter } = require('./rateLimiter');
const { createAuthService } = require('./authService');
const { createAccountService } = require('./accountService');
const { createScoreService } = require('./scoreService');
const { createCampaignService } = require('./campaignService');
const { createDailyService } = require('./dailyService');
const { createAdminService } = require('./adminService');
const { createPuzzleService } = require('./puzzleService');

function createServices({ db, pool, puzzleStore, achievements, sessions, eventLog, sendResetLink, appUrl, pwnedCheck }) {
  const limiter = createRateLimiter({ db });
  return {
    achievements,
    authService: createAuthService({ db, limiter, sessions, sendResetLink, appUrl, pwnedCheck, eventLog }),
    accountService: createAccountService({ db, sessions, eventLog }),
    scoreService: createScoreService({ db, achievements }),
    campaignService: createCampaignService({ db, achievements }),
    dailyService: createDailyService({ db, pool, achievements }),
    adminService: createAdminService({ db, pool, sessions, eventLog }),
    puzzleService: createPuzzleService({ pool, puzzleStore, achievements }),
  };
}

module.exports = { createServices };
