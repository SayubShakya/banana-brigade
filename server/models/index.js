// MongoDB document shapes (Mongoose schemas), one file per schema, registered on a
// connection here.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { userSchema } = require('./user');
const { scoreSchema, MODES } = require('./score');
const { rateLimitSchema } = require('./rateLimit');
const { passwordResetSchema } = require('./passwordReset');
const { auditLogSchema } = require('./auditLog');
const { dailySchema } = require('./daily');
const { reservePuzzleSchema } = require('./reservePuzzle');
const { dailyResultSchema } = require('./dailyResult');

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
  };
}

module.exports = { registerModels, MODES };
