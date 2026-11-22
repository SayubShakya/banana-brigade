function lastSeen(req, res, next) {
  if (req.session.userId && Date.now() - Date.parse(req.session.lastSeen ?? 0) > 60_000) req.session.lastSeen = new Date().toISOString();
  next();
}

module.exports = { lastSeen };
