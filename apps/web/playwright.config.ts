import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the production build, not the dev server.
 *
 * The bug these tests exist for was a CSS bundle-ordering problem, and bundle
 * order differs between dev and build — testing the dev server would have missed
 * it entirely.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `preview` serves dist, so the build must already exist. CI builds first.
    command: 'pnpm exec vite preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
