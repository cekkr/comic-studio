import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:3100', browserName: 'chromium', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: `${JSON.stringify(process.execPath)} server.mjs`, url: 'http://127.0.0.1:3100', env: { PORT: '3100' }, reuseExistingServer: !process.env.CI },
});
