// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../../server/config');

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
