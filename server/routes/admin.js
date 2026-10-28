// Admin-only tools. requireAdmin checks the role stored in the server session on
// every request; hiding the admin button in the page is not what protects this.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

function createAdminRouter({ db }) {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/users', (req, res) => res.json({ users: db.listUsers() }));

  router.delete('/users/:id/scores', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!db.findUserById(id)) return res.status(404).json({ error: 'No such user' });
    res.json({ deleted: db.deleteScoresForUser(id) });
  });

  return router;
}

module.exports = { createAdminRouter };
