import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173', channel: process.env.E2E_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true, trace: 'off', screenshot: 'off', video: 'off' },
  reporter: 'list', outputDir: '../.local/frontend-test-results',
});
