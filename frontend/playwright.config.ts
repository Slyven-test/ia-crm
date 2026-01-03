import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://localhost:4173';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
