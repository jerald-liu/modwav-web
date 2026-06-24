// Dev-only Playwright config for Mod.wav smoke tests.
// Serves the static index.html with python3's http.server and tears it down after.
const { defineConfig } = require('@playwright/test');

const PORT = 8000;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  // One engine (Chromium) is enough for a smoke test; viewports are driven in-test.
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
