import { defineConfig, devices } from '@playwright/test';

// E2E contra el build servido en local (vite preview). Nunca contra dev ni prod (04 §4).
// El build de las pruebas apunta a un Supabase ficticio (supabase.invalid): cada test simula las
// respuestas con page.route y lo que no simula falla como un servidor caído (FR-168).
// INTEGRACION=1 ejecuta solo e2e/integracion contra la pila local real: `wrangler pages dev` en
// :8788 sobre Supabase local (ci-sql). Ahí no se levanta el servidor de vite.
const integracion = !!process.env.INTEGRACION;
// Con URL_DESPLEGADA se prueba lo ya desplegado (cabeceras y CSP, TR-100): no hay que construir nada.
const desplegada = !!process.env.URL_DESPLEGADA;

export const SUPABASE_PRUEBAS = 'https://supabase.invalid';
// Un puerto por sesión cuando se trabaja en paralelo (docs/trabajo-en-paralelo.md §4, DEC-100): con el
// mismo, reuseExistingServer haría que los e2e de una sesión probaran el build de otra, sin error.
const PUERTO = Number(process.env.PW_PUERTO ?? 4173);
const URL_PREVIEW = `http://127.0.0.1:${PUERTO}`;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: URL_PREVIEW,
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
        // TR-21: el panel también en Firefox de escritorio (RV-28). Sin canal: es otro motor.
        {
          name: 'panel-firefox',
          testMatch: /panel-.*\.spec\.ts/,
          use: { ...devices['Desktop Firefox'], channel: undefined },
        },
      ],
  webServer:
    integracion || desplegada
      ? undefined
      : {
          // Las novedades se generan como en `npm run build` (prebuild, RV-20): si no, la app probada
          // llevaría el JSON de git, que puede ir una versión por detrás del CHANGELOG.
          command: `npx tsx scripts/generar-novedades.ts && npx vite build && npx vite preview --host 127.0.0.1 --port ${PUERTO} --strictPort`,
          url: URL_PREVIEW,
          env: {
            VITE_ENTORNO: 'staging',
            VITE_SUPABASE_URL: SUPABASE_PRUEBAS,
            VITE_SUPABASE_ANON_KEY: 'clave-anonima-de-pruebas',
          },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
});
