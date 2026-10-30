// MongoDB storage for players, match results, login limits, reset links and the daily challenge.
// openDatabase() returns one object that combines every repository (a facade), so the
// rest of the server only calls these functions and does not know (or care) which
// database is behind them. Until October 2026 this used SQLite with prepared
// statements; the git history keeps that version for comparison.
//
// Queries are built from objects, never from strings, so user input cannot change
// a query (the NoSQL version of SQL injection); usernames are also checked against
// a strict pattern before they get here.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

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
  await Promise.all(Object.values(m).map((model) => model.init()));   // build indexes (unique names, TTL)

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
