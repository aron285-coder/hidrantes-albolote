import { expect, test } from '@playwright/test';
import { T } from '../src/lib/textos.ts';

test.describe('armazón', () => {
  test('carga en español con la versión y la banda de pruebas', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page).toHaveTitle(`${T.app.nombreCorto} · ${T.app.nombre}`);
    await expect(page.locator('meta[name="version"]')).toHaveAttribute('content', /^\d+\.\d+\.\d+/);
    await expect(page.getByRole('status')).toHaveText(T.app.entornoPruebas);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(T.app.nombre);
  });

  test('staging no se indexa', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect(await (await request.get('/robots.txt')).text()).toMatch(/Disallow: \/\s*$/m);
  });

  test('fuentes servidas desde el propio despliegue, sin terceros (06 §3)', async ({ page, baseURL }) => {
    const externas: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL!)) externas.push(r.url());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(externas).toEqual([]);
    const familias = await page.evaluate(() => [...document.fonts].map((f) => f.family.replace(/"/g, '')));
    expect(familias).toEqual(expect.arrayContaining(['Barlow Condensed', 'Source Sans 3']));
  });

  test('el manifiesto de la PWA está en español', async ({ request }) => {
    const manifiesto = await (await request.get('/manifest.webmanifest')).json();
    expect(manifiesto).toMatchObject({ lang: 'es', short_name: T.app.nombreCorto, display: 'standalone' });
  });

  test('instalable: iconos del escudo, apple-touch-icon y Service Worker activo (F4.6)', async ({ page, request }) => {
    const manifiesto = await (await request.get('/manifest.webmanifest')).json();
    const iconos = manifiesto.icons as { src: string; sizes: string; purpose: string }[];
    expect(iconos.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const { src } of iconos) expect((await request.get(src)).headers()['content-type']).toBe('image/png');

    await page.goto('/');
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect((await request.get(apple!)).status()).toBe(200);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    const activo = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
    expect(activo).toBe(true);
  });

  // docs/18 RV-43: la caché de fotos de antes guardaba respuestas opacas que harían fallar la foto.
  test('el Service Worker borra la caché de fotos antigua al activarse', async ({ page }) => {
    await page.addInitScript(() => {
      // Como la deja la versión anterior en un móvil que ya tenía la app.
      void caches.open('hidrantes-fotos').then((c) => c.put('/fotos/vieja.jpg', new Response('opaca')));
    });
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => caches.has('hidrantes-fotos'))).toBe(false);
  });

  test('sin red, la app ya instalada abre desde la caché del Service Worker', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // la segunda carga ya la controla el Service Worker
    await context.setOffline(true);
    await page.goto('/lista');
    await expect(page.getByLabel(T.entrada.cifra(1))).toBeVisible();
    await context.setOffline(false);
  });
});
