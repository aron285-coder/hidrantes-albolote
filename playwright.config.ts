import { defineConfig, devices } from '@playwright/test';

// E2E contra el build servido en local (vite preview). Nunca contra dev ni prod (04 §4).
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    // En local se puede usar el navegador instalado (PW_CANAL=msedge o chrome); en CI, Chromium.
    channel: process.env.PW_CANAL || undefined,
  },
  projects: [
    { name: 'movil', use: { ...devices['Pixel 7'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    env: { VITE_ENTORNO: 'staging' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
