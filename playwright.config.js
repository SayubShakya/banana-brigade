// End-to-end tests in a real browser (Playwright). The web server is the app with an
// in-memory MongoDB and a fake Banana API (scripts/e2e-server.js); the React app
// must be built first (npm run build). Locally it uses the installed Google Chrome;
// in CI it uses Playwright's own Chromium.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { defineConfig } = require('@playwright/test');

const PORT = 3199;

module.exports = defineConfig({
  testDir: 'e2e',
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
    command: 'node scripts/e2e-server.js',
    url: `http://localhost:${PORT}/api/status`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
