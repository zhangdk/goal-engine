import { defineConfig } from '@playwright/test';

const port = Number(process.env['E2E_PORT'] ?? 3210);
const baseURL = `http://127.0.0.1:${port}`;
// Always use an absolute path so test and server agree on DB location.
// We use a path under __dirname (service/) so both test and server can find it.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = process.env['E2E_DB_PATH'] ?? resolve(__dirname, `goal-engine-e2e-${Date.now()}.db`);

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
      E2E_DB_PATH: dbPath,
    },
  },
});
