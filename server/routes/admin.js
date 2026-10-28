// Admin-only tools. requireAdmin checks the role stored in the server session on
// every request; hiding the admin button in the page is not what protects this.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

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

  return router;
}

module.exports = { createAdminRouter };
