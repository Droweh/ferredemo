import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const baseURL = process.env.FERROMAX_TEST_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ...(isCI ? [['github']] : []),
  ],
  use: {
    baseURL,
    locale: 'es-UY',
    timezoneId: 'America/Montevideo',
    colorScheme: 'light',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: /responsive\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        channel: isCI ? undefined : 'msedge',
      },
    },
    {
      name: 'mobile-chromium',
      testMatch: /responsive\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        channel: isCI ? undefined : 'msedge',
      },
    },
  ],
  webServer: process.env.FERROMAX_TEST_URL
    ? undefined
    : {
        command: 'node scripts/serve-public.mjs',
        url: `${baseURL}/healthz`,
        reuseExistingServer: !isCI,
        timeout: 30_000,
      },
});
