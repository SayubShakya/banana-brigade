// Controller layer: HTTP handlers for the account page (/api/auth/sessions, /api/auth/export).
// Controllers only read the request, call a service and send JSON; Express 5 passes
// any thrown error to the error handler automatically.

/**
 * Creates the account controller.
 * @param {object} services needs accountService
 */
function createAccountController({ accountService }) {
  return {
    /** GET /api/auth/sessions: lists this user's signed-in devices. */
    async sessions(req, res) {
      const { list, memberSince, lastLogin } = await accountService.signedIn(req.session.userId, req.sessionID);
      res.json({
        count: list.length,
        list,
        current: { createdAt: req.session.createdAt ?? null, expires: req.session.cookie.expires ?? null },
        memberSince, lastLogin,
      });
    },

    /** DELETE /api/auth/sessions/:handle: signs out one other device. */
    async endSession(req, res) {
      await accountService.signOutDevice(req.user, req.params.handle, req.sessionID);
      res.json({ ok: true });
    },

    /** GET /api/auth/export: sends the user's data as a downloadable JSON file. */
    async exportData(req, res) {
      const { file, body } = await accountService.exportData(req.user, req.sessionID);
      // Content-Disposition: attachment makes the browser download it as a file.
      res.set('Content-Disposition', `attachment; filename="${file}"`);
      res.json(body);
    },
  };
}

module.exports = { createAccountController };
