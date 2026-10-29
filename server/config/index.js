// All settings in one place, read from the environment (.env, see .env.example).
// The rest of the server gets them from here instead of reading process.env itself,
// so it is easy to see (and show) everything that can be configured.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');
const { DEFAULT_BASE_URL } = require('../services/bananaApi');

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const warnings = [];

  // Signs the session cookie. Without it, development uses a random one (everyone is
  // logged out on restart); production refuses to start.
  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret === 'change-me') {
    if (production) throw new Error('SESSION_SECRET must be set in production.');
    sessionSecret = crypto.randomBytes(32).toString('hex');
    warnings.push('SESSION_SECRET not set: using a random one, so everyone is logged out on restart.');
  }

  // Point BANANA_API_URL at a broken address to demonstrate the error handling.
  const bananaApiUrl = env.BANANA_API_URL || DEFAULT_BASE_URL;
  if (bananaApiUrl !== DEFAULT_BASE_URL) warnings.push(`Using Banana API at ${bananaApiUrl}`);

  const appUrl = env.APP_URL || null;
  if (production && !appUrl) warnings.push('APP_URL is not set: password reset links will use the Host header of the request.');

  return {
    port: Number(env.PORT) || 3100,
    production,
    mongodbUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/banana_brigade',
    sessionSecret,
    sessionTtlSeconds: 2 * 60 * 60,
    bananaApiUrl,
    bananaApiTimeoutMs: Number(env.BANANA_API_TIMEOUT_MS) || 5000,
    appUrl,
    pwnedCheck: env.PWNED_CHECK !== 'off',
    warnings,
  };
}

module.exports = { loadConfig };
