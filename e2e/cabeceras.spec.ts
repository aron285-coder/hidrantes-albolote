// Cabeceras de seguridad servidas de verdad (TR-100), leídas con un navegador y sin enviar nada:
// solo GET a la portada. Corre contra lo que haya desplegado, no contra el build local, porque lo
// que se comprueba es lo que Cloudflare Pages sirve a partir de `dist/_headers`.
//
//   URL_DESPLEGADA=https://hidrantes-albolote-staging.pages.dev npm run e2e -- e2e/cabeceras.spec.ts
//
// Sin esa variable se salta: los demás e2e corren contra `vite preview`, que no sirve `_headers`.
// Lo lanza deploy-staging.yml después de desplegar. `comprobar-despliegue.ts` mira las mismas
// cabeceras desde fuera; esto añade lo que solo se ve en un navegador: que la página carga sin
// violar su propia CSP.

import { expect, test } from '@playwright/test';
import { ORIGENES_CAPAS } from '../config/cabeceras.ts';

const DESPLEGADA = process.env.URL_DESPLEGADA;

test.describe('cabeceras de la página desplegada (TR-100)', () => {
  test.skip(!DESPLEGADA, 'necesita URL_DESPLEGADA (se lanza tras desplegar)');
  // La misma página sirve las mismas cabeceras en cualquier navegador: con una pasada basta.
  test.skip(({ isMobile }) => !!isMobile, 'basta con una vez');

  test('las trae todas, y la CSP nombra solo lo que la app usa', async ({ page }) => {
    const respuesta = await page.goto(DESPLEGADA!);
    expect(respuesta?.status()).toBe(200);
    const c = (n: string) => respuesta?.headers()[n] ?? '';

    const csp = c('content-security-policy');
    expect(csp, 'Content-Security-Policy').toBeTruthy();
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Nominatim se consulta desde la Pages Function, nunca desde el navegador (11 §4).
    expect(csp).not.toContain('nominatim');
    for (const capa of ORIGENES_CAPAS) expect(csp, `la CSP permite ${capa}`).toContain(capa);
    const conexiones = /connect-src ([^;]+)/.exec(csp)?.[1] ?? '';
    expect(conexiones).toContain("'self'");
    expect(conexiones).toContain('supabase.co');

    expect(c('strict-transport-security')).toMatch(/max-age=\d{7,}/);
    expect(c('x-content-type-options')).toBe('nosniff');
    expect(c('x-frame-options')).toBe('DENY');
    expect(c('referrer-policy')).toBe('strict-origin-when-cross-origin');
    const permisos = c('permissions-policy');
    expect(permisos).toContain('camera=(self)');
    expect(permisos).toContain('geolocation=(self)');
    expect(permisos).toContain('microphone=()');
  });

  test('la aplicación carga sin violar su propia CSP', async ({ page }) => {
    // Una CSP demasiado estrecha rompe la app en silencio: el navegador bloquea y no se ve hasta
    // que alguien abre la consola. Aquí se escucha el evento del propio navegador.
    const violaciones: string[] = [];
    await page.addInitScript(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ← ${e.blockedURI}`);
      });
    });
    await page.goto(DESPLEGADA!);
    await page.waitForLoadState('networkidle');
    violaciones.push(...(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp ?? [])));
    expect(violaciones, 'violaciones de la CSP al cargar').toEqual([]);
  });

  test('lo desplegado es instalable: manifiesto, iconos y Service Worker (TR-103)', async ({ page, request }) => {
    // Lighthouse 12 ya no trae la categoría PWA ni ejecuta `installable-manifest` (DEC-074), así que
    // la instalabilidad se comprueba aquí, sobre lo que Pages sirve de verdad.
    const manifiesto = await (await request.get(new URL('/manifest.webmanifest', DESPLEGADA!).href)).json();
    expect(manifiesto).toMatchObject({ lang: 'es', display: 'standalone', start_url: '/' });
    expect(String(manifiesto.name)).not.toBe('');
    const iconos = (manifiesto.icons ?? []) as { src: string; sizes: string; purpose?: string }[];
    // Android exige 192 y 512; la maskable es la que no queda recortada en el lanzador.
    expect(iconos.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(iconos.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const { src } of iconos) {
      const icono = await request.get(new URL(src, DESPLEGADA!).href);
      expect(icono.headers()['content-type'], `icono ${src}`).toBe('image/png');
    }

    await page.goto(DESPLEGADA!);
    const activo = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
    expect(activo, 'Service Worker activo').toBe(true);
  });
});
