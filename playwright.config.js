// Playwright settings for the end-to-end browser tests in tests/e2e.
// Playwright starts its own test server on port 3199, so it never clashes with the normal game on 3100.
const { defineConfig } = require('@playwright/test');

const PORT = 3199;

module.exports = defineConfig({
  testDir: 'tests/e2e',
  // Each test may take up to 60 seconds.
  timeout: 60_000,
  // On GitHub Actions (CI) retry a failed test once to rule out a one-off slow run; locally never retry.
  retries: process.env.CI ? 1 : 0,
  // On CI also write an HTML report, which the workflow uploads if a test fails.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    // Keep a step-by-step trace only for failed tests, to help debugging.
    trace: 'retain-on-failure',
    // Locally use the installed Google Chrome; on CI use the Chromium that the workflow installs.
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  // Playwright runs this command before the tests and waits until /api/status answers.
  webServer: {
    command: 'node tests/e2e/server.js',
    url: `http://localhost:${PORT}/api/status`,
    // Always start a fresh server with a clean in-memory database.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
