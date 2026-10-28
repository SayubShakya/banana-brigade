// Access checks that run on the server before a protected request is handled.
// The identity always comes from the server-side session, never from the request
// body, so a player cannot pretend to be someone else by sending another id.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in first' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in first' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

module.exports = { requireLogin, requireAdmin };
