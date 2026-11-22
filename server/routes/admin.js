// Routes layer: /api/admin URLs. Role-based access control: every route here is admins only.

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

/** Builds the admin router. */
function createAdminRouter({ adminController: admin }) {
  const router = express.Router();
  // Runs requireAdmin before every route below: not logged in -> 401, not an admin -> 403.
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
