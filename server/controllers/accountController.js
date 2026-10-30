// HTTP side of the account tools under /api/auth: signed-in devices and data export.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

function createAccountController({ accountService }) {
  return {
    async sessions(req, res) {
      const { list, memberSince, lastLogin } = await accountService.signedIn(req.session.userId, req.sessionID);
      res.json({
        count: list.length,
        list,
        current: { createdAt: req.session.createdAt ?? null, expires: req.session.cookie.expires ?? null },
        memberSince, lastLogin,
      });
    },

    async endSession(req, res) {
      await accountService.signOutDevice(req.user, req.params.handle, req.sessionID);
      res.json({ ok: true });
    },

    async exportData(req, res) {
      const { file, body } = await accountService.exportData(req.user, req.sessionID);
      res.set('Content-Disposition', `attachment; filename="${file}"`);
      res.json(body);
    },
  };
}

module.exports = { createAccountController };
