// Controller layer: HTTP handlers for /api/admin. The admin router already ran
// requireAdmin, so only admins reach these handlers.

/**
 * Creates the admin controller.
 * @param {object} services needs adminService
 */
function createAdminController({ adminService }) {
  return {
    /** GET /api/admin/users: every account with totals. */
    async users(req, res) {
      res.json(await adminService.listUsers());
    },

    /** GET /api/admin/audit?limit=: the audit log. */
    async audit(req, res) {
      res.json(await adminService.listAudit(req.query.limit));
    },

    /** GET /api/admin/health: Banana API health now and over time. */
    health(req, res) {
      res.json(adminService.health());
    },

    /** DELETE /api/admin/users/:id/scores: resets a player's scores (body: reason). */
    async resetScores(req, res) {
      res.json(await adminService.resetScores(req.user, req.params.id, req.body?.reason));
    },

    /** PATCH /api/admin/users/:id/role: makes a user player or admin (body: role, reason). */
    async setRole(req, res) {
      res.json(await adminService.setRole(req.user, req.params.id, req.body?.role, req.body?.reason));
    },

    /** POST /api/admin/users/:id/suspend: suspends a player and logs them out (body: reason). */
    async suspend(req, res) {
      res.json(await adminService.suspend(req.user, req.params.id, req.body?.reason));
    },

    /** POST /api/admin/users/:id/restore: lifts a suspension (body: reason). */
    async restore(req, res) {
      res.json(await adminService.restore(req.user, req.params.id, req.body?.reason));
    },
  };
}

module.exports = { createAdminController };
