// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

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
  if (user.suspended) {
    await new Promise((resolve) => req.session.destroy(() => resolve()));
    res.clearCookie(req.app.get('sessionCookieName'), { path: '/' });
    res.status(403).json({ error: `Your account is suspended: ${user.suspended.reason}`, suspended: true });
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
