// "Last used" for the signed-in devices list, updated at most once a minute so most
// requests do not rewrite the session.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

function lastSeen(req, res, next) {
  if (req.session.userId && Date.now() - Date.parse(req.session.lastSeen ?? 0) > 60_000) req.session.lastSeen = new Date().toISOString();
  next();
}

module.exports = { lastSeen };
