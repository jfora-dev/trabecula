import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the whole stack: nginx, the Spring Boot API and PostgreSQL.
 * Start it with `docker compose up --build` in the repository root, then `npm run e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  // The tests change shared demo data (approving a case), so they run one after another.
  workers: 1,
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          // CI machines have no GPU: render WebGL in software.
          args: [
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
});
