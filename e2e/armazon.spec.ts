import { expect, test } from '@playwright/test';
import { T } from '../src/lib/textos.ts';

test.describe('armazón (Fase 0)', () => {
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

  test('fuentes servidas desde el propio despliegue, sin terceros (06 §3)', async ({ page }) => {
    const externas: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:4173')) externas.push(r.url());
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
});
