// Unit test for server/config.js: production must be given real secrets, while local
// development works with safe defaults.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../../server/config');

// Proves the server refuses to start in production without SESSION_SECRET and APP_URL,
// so it can never run live with a weak or missing session secret.
test('production needs SESSION_SECRET and APP_URL; development has safe defaults', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', APP_URL: 'https://brigade.example' }), /SESSION_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32) }), /APP_URL/);
  const prod = loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), APP_URL: 'https://brigade.example', PORT: '8080' });
  assert.equal(prod.appUrl, 'https://brigade.example');
  assert.equal(prod.port, 8080);
  const dev = loadConfig({});
  assert.equal(dev.port, 3100);
  assert.equal(dev.appUrl, null);
  assert.equal(dev.sessionSecret.length, 64);
});
