// Model layer: registers every Mongoose schema on a database connection.
// Repositories receive these models and are the only code that queries them.

const { userSchema } = require('./user');
const { scoreSchema, MODES } = require('./score');
const { rateLimitSchema } = require('./rateLimit');
const { passwordResetSchema } = require('./passwordReset');
const { auditLogSchema } = require('./auditLog');
const { dailySchema } = require('./daily');
const { reservePuzzleSchema } = require('./reservePuzzle');
const { dailyResultSchema } = require('./dailyResult');
const { matchSchema } = require('./match');

/**
 * Creates the Mongoose models on the given connection.
 * @param {import('mongoose').Connection} conn an open MongoDB connection
 * @returns {object} { User, Score, RateLimit, ... } model classes
 */
function registerModels(conn) {
  return {
    User: conn.model('User', userSchema),
    Score: conn.model('Score', scoreSchema),
    RateLimit: conn.model('RateLimit', rateLimitSchema),
    PasswordReset: conn.model('PasswordReset', passwordResetSchema),
    AuditLog: conn.model('AuditLog', auditLogSchema),
    Daily: conn.model('Daily', dailySchema),
    ReservePuzzle: conn.model('ReservePuzzle', reservePuzzleSchema),
    DailyResult: conn.model('DailyResult', dailyResultSchema),
    Match: conn.model('Match', matchSchema),
  };
}

module.exports = { registerModels, MODES };
