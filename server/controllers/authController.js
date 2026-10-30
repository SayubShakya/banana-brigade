// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { sessionPort, puzzleTally } = require('../lib/httpSession');

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, guest: !!u.guest });

function createAuthController({ authService }) {
  return {
    async register(req, res) {
      const user = await authService.register(req.body ?? {}, sessionPort(req, res));
      res.status(201).json({ user: publicUser(user) });
    },

    async login(req, res) {
      const { username, password, remember } = req.body ?? {};
      const user = await authService.login({ username, password, remember, ip: req.ip }, sessionPort(req, res));
      res.json({ user: publicUser(user) });
    },

    async logout(req, res) {
      await authService.logout(req.session.username, sessionPort(req, res));
      res.json({ ok: true });
    },

    async logoutAll(req, res) {
      const ended = await authService.logoutEverywhere(req.session.userId, sessionPort(req, res));
      res.json({ ok: true, ended });
    },

    async changePassword(req, res) {
      const { current, next } = req.body ?? {};
      const ended = await authService.changePassword(req.session.userId, { current, next }, sessionPort(req, res));
      res.json({ ok: true, ended });
    },

    async deleteAccount(req, res) {
      await authService.deleteAccount(req.session.userId, req.body?.password, sessionPort(req, res));
      res.json({ ok: true });
    },

    async guest(req, res) {
      const user = await authService.startGuest(req.ip, sessionPort(req, res));
      res.status(201).json({ user: publicUser(user) });
    },

    async upgrade(req, res) {
      const user = await authService.upgradeGuest(req.user, req.body ?? {}, sessionPort(req, res));
      res.json({ user: publicUser(user) });
    },

    async forgot(req, res) {
      await authService.requestReset({ username: req.body?.username, ip: req.ip, origin: () => `${req.protocol}://${req.get('host')}` });
      res.json({ ok: true, message: 'If that account exists, a reset link has been sent. It works once, for 30 minutes.' });
    },

    async checkReset(req, res) {
      const user = await authService.checkReset(req.body?.token);
      res.json({ ok: true, username: user.username });
    },

    async reset(req, res) {
      const { token, password } = req.body ?? {};
      const { user, ended } = await authService.resetPassword({ token, password });
      res.json({ ok: true, username: user.username, ended });
    },

    async available(req, res) {
      const key = req.session.userId ? `s:${req.sessionID}` : `ip:${req.ip}`;
      res.json(await authService.isAvailable(String(req.query.u ?? ''), key));
    },

    async me(req, res) {
      const user = await authService.currentUser(req.session.userId);
      if (!user) return res.json({ user: null });
      res.json({ user: publicUser(user), puzzles: puzzleTally(req).peek() });
    },
  };
}

module.exports = { createAuthController, publicUser };
