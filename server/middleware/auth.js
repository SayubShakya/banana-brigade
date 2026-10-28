// Access checks that run on the server before a protected request is handled.
// The identity always comes from the server-side session, never from the request
// body, so a player cannot pretend to be someone else by sending another id.
//
// The user (and their role) is read from the database on every request rather than
// trusted from the session: a deleted account or a demoted admin loses access at
// once, not when the cookie runs out. The cost is one small lookup by _id per request.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

// Loads the logged-in user into req.user, or answers 401. A session whose account
// no longer exists is destroyed so the stale cookie stops working.
async function loadUser(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Please log in first' });
    return null;
  }
  const user = await req.app.locals.db.findUserById(req.session.userId);
  if (!user) {
    await new Promise((resolve) => req.session.destroy(() => resolve()));
    res.clearCookie(req.app.get('sessionCookieName'), { path: '/' });
    res.status(401).json({ error: 'Please log in first' });
    return null;
  }
  req.user = user;
  return user;
}

async function requireLogin(req, res, next) {
  try {
    if (await loadUser(req, res)) next();
  } catch (err) {
    next(err);
  }
}

async function requireAdmin(req, res, next) {
  try {
    const user = await loadUser(req, res);
    if (!user) return;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireLogin, requireAdmin };
