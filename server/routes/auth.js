// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

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
