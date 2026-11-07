const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3108',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3108',
    env: { PORT: '3108', AUTH0_DOMAIN: '', AUTH0_CLIENT_ID: '' },
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
