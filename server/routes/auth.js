// /api/auth: register, log in, log out and "who am I", guest play, plus the account
// tools (log out of all devices, change password, delete account, username check,
// forgot/reset password, signed-in devices, data export). Wiring only: the work is
// in controllers/authController.js, controllers/accountController.js and the services.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');

function createAuthRouter({ authController: auth, accountController: account }) {
  const router = express.Router();

  router.post('/register', auth.register);
  router.post('/login', auth.login);
  router.post('/logout', auth.logout);
  router.post('/logout-all', requireLogin, auth.logoutAll);
  router.post('/password', requireLogin, auth.changePassword);
  router.delete('/account', requireLogin, auth.deleteAccount);
  router.post('/guest', auth.guest);
  router.post('/upgrade', requireLogin, auth.upgrade);
  router.post('/forgot', auth.forgot);
  router.post('/reset/check', auth.checkReset);
  router.post('/reset', auth.reset);
  router.get('/available', auth.available);
  router.get('/sessions', requireLogin, account.sessions);
  router.delete('/sessions/:handle', requireLogin, account.endSession);
  router.get('/export', requireLogin, account.exportData);
  router.get('/me', auth.me);

  return router;
}

module.exports = { createAuthRouter };
