import { defineConfig } from '@playwright/test';

/**
 * Playwright config for real Electron e2e tests.
 * Uses Playwright's _electron API to launch the compiled app.
 *
 * Run: npm run test:e2e
 * Prerequisites: the renderer must be built (dist/index.html must exist).
 * If it's missing, globalSetup will build it automatically.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // Run tests serially – Electron apps shouldn't run multiple instances in parallel.
  workers: 1,
  fullyParallel: false,

  retries: 0,
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI ? 'github' : 'list',

  globalSetup: './tests/e2e/globalSetup.ts',
});
