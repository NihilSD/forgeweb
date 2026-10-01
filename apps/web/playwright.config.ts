import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Local runs read the root .env (e.g. PLAYWRIGHT_CHROMIUM_PATH); CI sets variables directly.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const reuse = !process.env.CI;
export const E2E_STRIPE_WEBHOOK_SECRET = 'whsec_e2e_forge_test_only_secret_0000000000';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @forge/api exec tsx src/main.ts',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: reuse,
      cwd: '../..',
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        RATE_LIMITS_ENABLED: 'false',
        E2E: '1',
        DATABASE_URL:
          process.env.E2E_DATABASE_URL ?? 'postgresql://forge:forge@localhost:5432/forge_e2e',
        REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/3',
        // Test-only secret: e2e signs Stripe-style webhooks itself (no Stripe account needed).
        STRIPE_WEBHOOK_SECRET: E2E_STRIPE_WEBHOOK_SECRET,
      },
    },
    {
      command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: reuse,
      timeout: 240_000,
    },
  ],
});
