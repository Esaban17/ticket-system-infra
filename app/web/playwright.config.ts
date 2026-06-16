import { defineConfig } from '@playwright/test';

// Si E2E_BASE_URL está definida, la suite corre contra esa URL (p. ej. el ALB
// de AWS dev) sin levantar el dev server de Vite. Si no, levanta Vite local.
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:5173';
const useRemote = Boolean(process.env['E2E_BASE_URL']);

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  ...(useRemote
    ? {}
    : {
        webServer: {
          command: 'npm run dev -- --port 5173 --strictPort',
          url: 'http://localhost:5173',
          reuseExistingServer: true,
          timeout: 30_000,
        },
      }),
});
