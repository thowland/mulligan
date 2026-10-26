// End-to-end tests (implementation plan G4): the production build, served by `vite preview` with
// the production header set (apps/web/security/headers.json), driven in Chromium. The smoke spec
// also runs in Firefox and WebKit.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  // One worker: the suite shares one preview server and measures real rendering.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    // The build must exist; `pnpm gate` builds before running the suite.
    command: `pnpm --filter @mulligan/web exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: 'smoke.spec.ts' },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: 'smoke.spec.ts' },
  ],
});
