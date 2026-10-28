// Admin-only tools. requireAdmin reads the user's role from the database on every
// request; hiding the admin button in the page is not what protects this.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

const ROLES = ['player', 'admin'];

function createAdminRouter({ db }) {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/users', async (req, res, next) => {
    try { res.json({ users: await db.listUsers() }); } catch (err) { next(err); }
  });

  router.delete('/users/:id/scores', async (req, res, next) => {
    try {
      if (!(await db.findUserById(req.params.id))) return res.status(404).json({ error: 'No such user' });
      res.json({ deleted: await db.deleteScoresForUser(req.params.id) });
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
      // Stops the last admin from locking everyone out of the admin tools by accident.
      if (req.params.id === req.session.userId && role !== 'admin') {
        return res.status(400).json({ error: 'You cannot demote yourself' });
      }
      const user = await db.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'No such user' });
      if (user.role !== role) await db.setRole(user.id, role);
      res.json({ user: { id: user.id, username: user.username, role } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAdminRouter };
