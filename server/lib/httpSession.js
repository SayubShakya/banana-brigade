// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { describeDevice } = require('./device');

const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

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

function sessionPort(req, res) {
  return {
    id: req.sessionID,
    start: (user, options) => startSession(req, user, options),
    end: () => endThisSession(req, res),
  };
}

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
    take() {
      const p = req.session.puzzles ?? EMPTY();
      req.session.puzzles = EMPTY();
      return p;
    },
  };
}

module.exports = { startSession, endThisSession, sessionPort, puzzleTally, REMEMBER_MS };
