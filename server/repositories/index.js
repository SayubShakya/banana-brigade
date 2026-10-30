// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const mongoose = require('mongoose');
const { registerModels } = require('../models');
const { createUserRepository } = require('./userRepository');
const { createScoreRepository } = require('./scoreRepository');
const { createDailyRepository } = require('./dailyRepository');
const { createRateLimitRepository } = require('./rateLimitRepository');
const { createPasswordResetRepository } = require('./passwordResetRepository');
const { createAuditRepository } = require('./auditRepository');
const { createReservePuzzleRepository } = require('./reservePuzzleRepository');

async function openDatabase(uri) {
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const m = registerModels(conn);
  await Promise.all(Object.values(m).map((model) => model.init()));

  return {
    connection: conn,
    models: m,
    close: () => conn.close(),
    ...createUserRepository(m),
    ...createScoreRepository(m),
    ...createDailyRepository(m),
    ...createRateLimitRepository(m),
    ...createPasswordResetRepository(m),
    ...createAuditRepository(m),
    ...createReservePuzzleRepository(m),
  };
}

module.exports = { openDatabase };
