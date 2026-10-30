// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { defineConfig } = require('@playwright/test');

const PORT = 3199;

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  webServer: {
    command: 'node tests/e2e/server.js',
    url: `http://localhost:${PORT}/api/status`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
