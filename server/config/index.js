// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');
const { DEFAULT_BASE_URL } = require('../services/bananaApi');

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const warnings = [];

  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret === 'change-me') {
    if (production) throw new Error('SESSION_SECRET must be set in production.');
    sessionSecret = crypto.randomBytes(32).toString('hex');
    warnings.push('SESSION_SECRET not set: using a random one, so everyone is logged out on restart.');
  }

  const bananaApiUrl = env.BANANA_API_URL || DEFAULT_BASE_URL;
  if (bananaApiUrl !== DEFAULT_BASE_URL) warnings.push(`Using Banana API at ${bananaApiUrl}`);

  const appUrl = env.APP_URL || null;
  if (production && !appUrl) throw new Error('APP_URL must be set in production (the address used in password reset links).');

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
