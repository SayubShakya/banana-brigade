// Middleware layer: records when a logged-in session was last active
// (shown on the account page's "active sessions" list).

/**
 * Updates req.session.lastSeen, but at most once a minute, so the session
 * store in MongoDB is not rewritten on every single request.
 */
function lastSeen(req, res, next) {
  if (req.session.userId && Date.now() - Date.parse(req.session.lastSeen ?? 0) > 60_000) req.session.lastSeen = new Date().toISOString();
  next();
}

module.exports = { lastSeen };
