import { defineConfig, devices } from '@playwright/test';

// E2E contra el build servido en local (vite preview). Nunca contra dev ni prod (04 §4).
// El build de las pruebas apunta a un Supabase ficticio (supabase.invalid): cada test simula las
// respuestas con page.route y lo que no simula falla como un servidor caído (FR-168).
// INTEGRACION=1 ejecuta solo e2e/integracion contra la pila local real: `wrangler pages dev` en
// :8788 sobre Supabase local (ci-sql). Ahí no se levanta el servidor de vite.
const integracion = !!process.env.INTEGRACION;

export const SUPABASE_PRUEBAS = 'https://supabase.invalid';

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
  projects: integracion
    ? [
        {
          name: 'integracion',
          testMatch: /integracion\/.*\.spec\.ts/,
          use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:8788' },
        },
      ]
    : [
        { name: 'movil', testIgnore: /integracion\//, use: { ...devices['Pixel 7'] } },
        { name: 'escritorio', testIgnore: /integracion\//, use: { ...devices['Desktop Chrome'] } },
      ],
  webServer: integracion
    ? undefined
    : {
        command: 'npx vite build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        env: {
          VITE_ENTORNO: 'staging',
          VITE_SUPABASE_URL: SUPABASE_PRUEBAS,
          VITE_SUPABASE_ANON_KEY: 'clave-anonima-de-pruebas',
        },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
