// Config layer: reads settings from environment variables in one place,
// with safe defaults for development and hard failures for production.
const crypto = require('node:crypto');
const { DEFAULT_BASE_URL } = require('../services/bananaApi');

/**
 * Builds the app configuration object.
 * @param {object} env environment variables (process.env by default; tests pass their own)
 * @returns {object} port, MongoDB URI, session secret, Banana API URL/timeout, etc.
 * @throws {Error} in production if SESSION_SECRET or APP_URL is missing
 */
function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const warnings = [];

  let sessionSecret = env.SESSION_SECRET;
  // Security: a missing or default secret would let anyone forge session cookies,
  // so production refuses to start. Development uses a random secret instead.
  if (!sessionSecret || sessionSecret === 'change-me') {
    if (production) throw new Error('SESSION_SECRET must be set in production.');
    sessionSecret = crypto.randomBytes(32).toString('hex');
    warnings.push('SESSION_SECRET not set: using a random one, so everyone is logged out on restart.');
  }

  const bananaApiUrl = env.BANANA_API_URL || DEFAULT_BASE_URL;
  if (bananaApiUrl !== DEFAULT_BASE_URL) warnings.push(`Using Banana API at ${bananaApiUrl}`);

  const appUrl = env.APP_URL || null;
  // Password reset emails need a real address to link back to.
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
