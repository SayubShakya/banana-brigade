// /api/admin: admin-only tools. requireAdmin reads the user's role from the database
// on every request; hiding the admin button in the page is not what protects this.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

function createAdminRouter({ adminController: admin }) {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/users', admin.users);
  router.get('/audit', admin.audit);
  router.get('/health', admin.health);
  router.delete('/users/:id/scores', admin.resetScores);
  router.patch('/users/:id/role', admin.setRole);
  router.post('/users/:id/suspend', admin.suspend);
  router.post('/users/:id/restore', admin.restore);

  return router;
}

module.exports = { createAdminRouter };
