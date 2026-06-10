import { defineConfig } from '@playwright/test';

// La suite asume el stack local corriendo:
//  - API en http://localhost:8080 (con Postgres migrado y seeds aplicados)
//  - Frontend en http://localhost:5173 (se levanta solo si no está corriendo)
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
