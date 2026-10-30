// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

function createAdminController({ adminService }) {
  return {
    async users(req, res) {
      res.json(await adminService.listUsers());
    },

    async audit(req, res) {
      res.json(await adminService.listAudit(req.query.limit));
    },

    health(req, res) {
      res.json(adminService.health());
    },

    async resetScores(req, res) {
      res.json(await adminService.resetScores(req.user, req.params.id, req.body?.reason));
    },

    async setRole(req, res) {
      res.json(await adminService.setRole(req.user, req.params.id, req.body?.role, req.body?.reason));
    },

    async suspend(req, res) {
      res.json(await adminService.suspend(req.user, req.params.id, req.body?.reason));
    },

    async restore(req, res) {
      res.json(await adminService.restore(req.user, req.params.id, req.body?.reason));
    },
  };
}

module.exports = { createAdminController };
