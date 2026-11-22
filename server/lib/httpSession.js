// Helper library: small wrappers around express-session used by controllers.
// They let services start/end sessions and count puzzles without knowing about Express.
const { describeDevice } = require('./device');

// "Remember me" keeps the cookie for 30 days instead of 2 hours.
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Logs a user in by creating a brand new session.
 * regenerate() throws away the old session ID first. This stops "session
 * fixation", where an attacker plants a known ID before the victim logs in.
 * @param {object} req Express request
 * @param {object} user the user who just logged in
 * @param {object} [options] remember: 30-day cookie; maxAge: custom lifetime in ms
 * @returns {Promise<void>} resolves once the session is saved in the store
 */
function startSession(req, user, { remember = false, maxAge = null } = {}) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      req.session.puzzles = { solved: 0, attempted: 0 };
      req.session.createdAt = new Date().toISOString();
      req.session.lastSeen = req.session.createdAt;
      req.session.device = describeDevice(req.get('user-agent'));
      if (remember) req.session.cookie.maxAge = REMEMBER_MS;
      if (maxAge) req.session.cookie.maxAge = maxAge;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

/**
 * Logs out the current browser: deletes the session from the store and
 * clears the cookie.
 * @returns {Promise<void>}
 */
function endThisSession(req, res) {
  const cookieName = req.app.get('sessionCookieName');
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) return reject(err);
      res.clearCookie(cookieName, { path: '/' });
      resolve();
    });
  });
}

/**
 * A small "port" object the services can use to start or end the session
 * without touching req/res directly (keeps services easy to test).
 */
function sessionPort(req, res) {
  return {
    id: req.sessionID,
    start: (user, options) => startSession(req, user, options),
    end: () => endThisSession(req, res),
  };
}

/**
 * Counts solved/attempted Banana puzzles inside the session, so the server
 * (not the browser) knows how many puzzles the player really solved.
 * peek(): read the tally; record(correct, purpose): add one attempt;
 * take(): read the tally and reset it (used when a score is submitted).
 */
const EMPTY = () => ({ solved: 0, attempted: 0 });
function puzzleTally(req) {
  return {
    peek: () => req.session.puzzles ?? EMPTY(),
    record(correct, purpose) {
      let p = req.session.puzzles ?? EMPTY();
      // A new deploy puzzle starts a fresh tally unless it is a retry after a failed deploy attempt.
      if (purpose === 'deploy' && p.attempted && (p.last !== 'deploy' || p.lastOk)) p = EMPTY();
      p.attempted += 1;
      if (correct) p.solved += 1;
      p.last = purpose;
      p.lastOk = !!correct;
      req.session.puzzles = p;
    },
    take() {
      const { solved = 0, attempted = 0 } = req.session.puzzles ?? {};
      req.session.puzzles = EMPTY();
      return { solved, attempted };
    },
  };
}

module.exports = { startSession, endThisSession, sessionPort, puzzleTally, REMEMBER_MS };
