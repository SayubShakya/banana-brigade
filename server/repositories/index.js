// Repository layer entry point: connects to MongoDB and combines every
// repository into one "db" object that the services use.

const mongoose = require('mongoose');
const { registerModels } = require('../models');
const { createUserRepository } = require('./userRepository');
const { createScoreRepository } = require('./scoreRepository');
const { createDailyRepository } = require('./dailyRepository');
const { createRateLimitRepository } = require('./rateLimitRepository');
const { createPasswordResetRepository } = require('./passwordResetRepository');
const { createAuditRepository } = require('./auditRepository');
const { createReservePuzzleRepository } = require('./reservePuzzleRepository');
const { createMatchRepository } = require('./matchRepository');

/**
 * Opens the MongoDB connection, registers the models and builds the indexes.
 * @param {string} uri MongoDB connection string
 * @returns {Promise<object>} db object with all repository functions plus close()
 * @throws if MongoDB cannot be reached within 5 seconds
 */
async function openDatabase(uri) {
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const m = registerModels(conn);
  // init() makes sure the unique/TTL indexes exist before the app uses them.
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
    ...createMatchRepository(m),
  };
}

module.exports = { openDatabase };
