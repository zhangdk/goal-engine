import { defineConfig } from '@playwright/test';

const port = Number(process.env['E2E_PORT'] ?? 3210);
const baseURL = `http://127.0.0.1:${port}`;
const dbPath = process.env['E2E_DB_PATH'] ?? `./goal-engine-e2e-${Date.now()}.db`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
  },
  webServer: {
    command: 'pnpm dev',
    url: `${baseURL}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
    },
  },
});
