// The parts of a login that belong to HTTP: starting and ending this request's
// session (express-session), and the per-session Banana puzzle tally. Controllers
// hand these to the services as small "ports", so the services never see req/res.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { describeDevice } = require('./device');

const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;   // "remember me": 30 days instead of 2 hours

// Starts a fresh session for the user. Regenerating the session id at login means an
// id an attacker planted before login is useless afterwards (session fixation).
// remember: keep the cookie for 30 days. Off by default, because a long-lived cookie
// on a shared computer lets the next person in.
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
      // Set after regenerate (which makes a fresh cookie); connect-mongo stores the
      // session with this cookie's expiry, so the server copy lives 30 days too.
      if (remember) req.session.cookie.maxAge = REMEMBER_MS;
      if (maxAge) req.session.cookie.maxAge = maxAge;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

// Destroys this request's session and tells the browser to forget the cookie.
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

// What a service may do with the current login: know its id, start one, end it.
function sessionPort(req, res) {
  return {
    id: req.sessionID,
    start: (user, options) => startSession(req, user, options),
    end: () => endThisSession(req, res),
  };
}

// The Banana puzzle results of this session. The server keeps them, so a player
// cannot fake their puzzle record from the browser.
const EMPTY = () => ({ solved: 0, attempted: 0 });
function puzzleTally(req) {
  return {
    peek: () => req.session.puzzles ?? EMPTY(),
    record(correct) {
      const p = req.session.puzzles ?? EMPTY();
      p.attempted += 1;
      if (correct) p.solved += 1;
      req.session.puzzles = p;
    },
    // Returns the counts for a finished match and starts again from zero.
    take() {
      const p = req.session.puzzles ?? EMPTY();
      req.session.puzzles = EMPTY();
      return p;
    },
  };
}

module.exports = { startSession, endThisSession, sessionPort, puzzleTally, REMEMBER_MS };
