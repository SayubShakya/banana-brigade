// Middleware layer: guards for protected routes (virtual identity theme).
// requireLogin checks the session cookie belongs to a real, active user;
// requireAdmin also checks the user's role is "admin".

/**
 * Looks up the logged-in user from the session and stores it on req.user.
 * Sends 401 if there is no session or the user no longer exists, and
 * 403 if the account is suspended. In those cases the session is destroyed
 * and the cookie cleared, so a deleted or suspended user is logged out at once.
 * @returns {Promise<object|null>} the user, or null when a response was already sent
 */
async function loadUser(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Please log in first' });
    return null;
  }
  const user = await req.app.locals.db.findUserById(req.session.userId);
    // The user was deleted while still logged in: kill the stale session.
  if (!user) {
    await new Promise((resolve) => req.session.destroy(() => resolve()));
    res.clearCookie(req.app.get('sessionCookieName'), { path: '/' });
    res.status(401).json({ error: 'Please log in first' });
    return null;
  }
  // Suspended accounts lose their session immediately, not just at next login.
  if (user.suspended) {
    await new Promise((resolve) => req.session.destroy(() => resolve()));
    res.clearCookie(req.app.get('sessionCookieName'), { path: '/' });
    res.status(403).json({ error: `Your account is suspended: ${user.suspended.reason}`, suspended: true });
    return null;
  }
  req.user = user;
  return user;
}

/**
 * Express middleware: only lets the request through if someone is logged in.
 * Errors (e.g. database down) are passed to the error handler with next(err).
 */
async function requireLogin(req, res, next) {
  try {
    if (await loadUser(req, res)) next();
  } catch (err) {
    next(err);
  }
}

/**
 * Express middleware: only lets admins through.
 * The role is read from the database (not trusted from the session), so a
 * role change takes effect on the very next request.
 */
async function requireAdmin(req, res, next) {
  try {
    const user = await loadUser(req, res);
    if (!user) return;
    // Role check: logged in but not an admin gets 403 Forbidden.
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireLogin, requireAdmin };
