// Controller layer: HTTP handlers for /api/auth (virtual identity theme).
// They pass a "session port" to the auth service so it can start or end the cookie session.

const { sessionPort, puzzleTally } = require('../lib/httpSession');

// Only safe fields are sent to the browser; the password hash never leaves the server.
const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, guest: !!u.guest });

/**
 * Creates the auth controller.
 * @param {object} services needs authService
 */
function createAuthController({ authService }) {
  return {
    /** POST /api/auth/register: creates an account and logs in. Sends 201 with the user. */
    async register(req, res) {
      const user = await authService.register(req.body ?? {}, sessionPort(req, res));
      res.status(201).json({ user: publicUser(user) });
    },

    /** POST /api/auth/login: checks username/password; req.ip is used for rate limiting. */
    async login(req, res) {
      const { username, password, remember } = req.body ?? {};
      const user = await authService.login({ username, password, remember, ip: req.ip }, sessionPort(req, res));
      res.json({ user: publicUser(user) });
    },

    /** POST /api/auth/admin-login: same as login but only admins are allowed in. */
    async adminLogin(req, res) {
      const { username, password } = req.body ?? {};
      const user = await authService.login({ username, password, ip: req.ip, requireRole: 'admin' }, sessionPort(req, res));
      res.json({ user: publicUser(user) });
    },

    /** POST /api/auth/logout: ends this session and clears the cookie. */
    async logout(req, res) {
      await authService.logout(req.session.username, sessionPort(req, res));
      res.json({ ok: true });
    },

    /** POST /api/auth/logout-all: ends every session of this user. */
    async logoutAll(req, res) {
      const ended = await authService.logoutEverywhere(req.session.userId, sessionPort(req, res));
      res.json({ ok: true, ended });
    },

    /** POST /api/auth/password: changes the password (body: current, next). */
    async changePassword(req, res) {
      const { current, next } = req.body ?? {};
      const ended = await authService.changePassword(req.session.userId, { current, next }, sessionPort(req, res));
      res.json({ ok: true, ended });
    },

    /** DELETE /api/auth/account: deletes the account after checking the password. */
    async deleteAccount(req, res) {
      await authService.deleteAccount(req.session.userId, req.body?.password, sessionPort(req, res));
      res.json({ ok: true });
    },

    /** POST /api/auth/guest: starts a guest account. Sends 201. */
    async guest(req, res) {
      const user = await authService.startGuest(req.ip, sessionPort(req, res));
      res.status(201).json({ user: publicUser(user) });
    },

    /** POST /api/auth/upgrade: saves a guest as a full account. */
    async upgrade(req, res) {
      const user = await authService.upgradeGuest(req.user, req.body ?? {}, sessionPort(req, res));
      res.json({ user: publicUser(user) });
    },

    /**
     * POST /api/auth/forgot: asks for a reset link. The reply is the same whether or not
     * the user exists, so it cannot be used to find usernames.
     */
    async forgot(req, res) {
      await authService.requestReset({ username: req.body?.username, ip: req.ip, origin: () => `${req.protocol}://${req.get('host')}` });
      res.json({ ok: true, message: 'If that account exists, a reset link has been sent. It works once, for 30 minutes.' });
    },

    /** POST /api/auth/reset/check: is this reset token still valid? */
    async checkReset(req, res) {
      const user = await authService.checkReset(req.body?.token);
      res.json({ ok: true, username: user.username });
    },

    /** POST /api/auth/reset: sets a new password with a reset token. */
    async reset(req, res) {
      const { token, password } = req.body ?? {};
      const { user, ended } = await authService.resetPassword({ token, password });
      res.json({ ok: true, username: user.username, ended });
    },

    /** GET /api/auth/available?u=name: is the username free? */
    async available(req, res) {
      // Rate limit key: the session if logged in, otherwise the IP address.
      const key = req.session.userId ? `s:${req.sessionID}` : `ip:${req.ip}`;
      res.json(await authService.isAvailable(String(req.query.u ?? ''), key));
    },

    /** GET /api/auth/me: who is logged in (user: null if nobody), plus the puzzle tally. */
    async me(req, res) {
      const user = await authService.currentUser(req.session.userId);
      if (!user) return res.json({ user: null });
      res.json({ user: publicUser(user), puzzles: puzzleTally(req).peek() });
    },
  };
}

module.exports = { createAuthController, publicUser };
