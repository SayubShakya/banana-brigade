// Admin-only tools. requireAdmin reads the user's role from the database on every
// request; hiding the admin button in the page is not what protects this.
//
// Every action needs a reason and is written to the audit log (who, what, to whom,
// when, why), which admins can read but nobody can edit through the app. Actions
// also appear in the live event feed.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { endSessionsFor, disconnectSocketsFor } = require('../sessions');

const ROLES = ['player', 'admin'];

// The reason an admin gives, trimmed; null if missing or too short to mean anything.
const reasonOf = (req) => {
  const r = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  return r.length >= 3 && r.length <= 200 ? r : null;
};
const NEED_REASON = { error: 'Give a reason (3–200 characters); it goes in the audit log' };

function createAdminRouter({ db, eventLog = null }) {
  const router = express.Router();
  router.use(requireAdmin);

  // Writes the audit row and tells the live feed. `said` is the feed's wording,
  // e.g. "suspended sam (2 sessions ended)".
  async function audit(req, action, target, reason, detail, said) {
    await db.addAudit({ actor: req.user.id, actorName: req.user.username, action, target: target?.id, targetName: target?.username, reason, detail });
    eventLog?.record('admin', req.user.username, `${said}. Reason: ${reason}`);
  }

  router.get('/users', async (req, res, next) => {
    try { res.json({ users: await db.listUsers() }); } catch (err) { next(err); }
  });

  router.get('/audit', async (req, res, next) => {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    try { res.json({ rows: await db.listAudit(limit) }); } catch (err) { next(err); }
  });

  // The Banana API's health now and over time (samples every 30 s, see pool.js).
  router.get('/health', (req, res) => {
    const { pool } = req.app.locals;
    res.json({ now: pool.status(), history: pool.history() });
  });

  router.delete('/users/:id/scores', async (req, res, next) => {
    try {
      const reason = reasonOf(req);
      if (!reason) return res.status(400).json(NEED_REASON);
      const user = await db.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'No such user' });
      const deleted = await db.deleteScoresForUser(user.id);
      await audit(req, 'reset-scores', user, reason, `reset ${deleted} score${deleted === 1 ? '' : 's'}`, `reset ${user.username}'s scores (${deleted})`);
      res.json({ deleted });
    } catch (err) {
      next(err);
    }
  });

  // Promote a player to admin or demote an admin. requireAdmin reads the role from
  // the database, so the change applies to their very next request (no re-login).
  router.patch('/users/:id/role', async (req, res, next) => {
    try {
      const { role } = req.body ?? {};
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role must be player or admin' });
      const reason = reasonOf(req);
      if (!reason) return res.status(400).json(NEED_REASON);
      // Stops the last admin from locking everyone out of the admin tools by accident.
      if (req.params.id === req.session.userId && role !== 'admin') {
        return res.status(400).json({ error: 'You cannot demote yourself' });
      }
      const user = await db.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'No such user' });
      if (user.role !== role) {
        await db.setRole(user.id, role);
        await audit(req, 'set-role', user, reason, `made ${role}`, `made ${user.username} ${role === 'admin' ? 'an admin' : 'a player'}`);
      }
      res.json({ user: { id: user.id, username: user.username, role } });
    } catch (err) {
      next(err);
    }
  });

  // Suspend: the player is thrown out at once (every session ended, live sockets
  // closed) and cannot log in until an admin restores the account. Admins must be
  // demoted first, so admins cannot suspend each other by accident.
  router.post('/users/:id/suspend', async (req, res, next) => {
    try {
      const reason = reasonOf(req);
      if (!reason) return res.status(400).json(NEED_REASON);
      if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot suspend yourself' });
      const user = await db.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'No such user' });
      if (user.role === 'admin') return res.status(400).json({ error: 'Demote an admin before suspending them' });
      if (user.suspended) return res.status(409).json({ error: 'Already suspended' });
      await db.suspendUser(user.id, reason, req.user.username);
      const ended = await endSessionsFor(req.sessionStore, user.id);
      disconnectSocketsFor(req.app.locals.io, user.id);
      const sessions = `${ended} session${ended === 1 ? '' : 's'} ended`;
      await audit(req, 'suspend', user, reason, `suspended (${sessions})`, `suspended ${user.username} (${sessions})`);
      res.json({ ok: true, ended });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:id/restore', async (req, res, next) => {
    try {
      const reason = reasonOf(req);
      if (!reason) return res.status(400).json(NEED_REASON);
      const user = await db.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'No such user' });
      if (!user.suspended) return res.status(409).json({ error: 'Not suspended' });
      await db.restoreUser(user.id);
      await audit(req, 'restore', user, reason, 'restored', `restored ${user.username}`);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAdminRouter };
