import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const appDataRoot = process.env.APP_DATA_ROOT;
if (!appDataRoot) {
  throw new Error('APP_DATA_ROOT is required for Playwright runs');
}

const normalizedAppDataRoot = path.resolve(appDataRoot).toLowerCase();
if (!normalizedAppDataRoot.includes(`${path.sep}ai-studybuddy-tmp${path.sep}runs${path.sep}`)) {
  throw new Error('Playwright APP_DATA_ROOT must be an isolated path under ai-studybuddy-tmp/runs');
}

const evidenceRoot = path.join(appDataRoot, 'playwright');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(evidenceRoot, 'test-results'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(evidenceRoot, 'html-report'), open: 'never' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    timezoneId: 'Asia/Shanghai',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @ai-studybuddy/backend exec tsx test/e2e-server.ts',
      url: 'http://127.0.0.1:4311/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        APP_DATA_ROOT: appDataRoot,
        BACKEND_HOST: '127.0.0.1',
        BACKEND_PORT: '4311',
        AI_PROVIDERS: '',
        AI_BASE_URL: '',
        AI_API_KEY: '',
        AI_MODEL: '',
      },
    },
    {
      command: 'pnpm --filter @ai-studybuddy/frontend exec vite --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173/courses',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_BASE_URL: 'http://127.0.0.1:4311',
      },
    },
  ],
});
