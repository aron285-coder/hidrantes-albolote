// docs/33 RV-310 (U1): el mapa se abre donde está el voluntario. Con su posición al día y dentro de
// la zona, a zoom de calle (17) sobre él; sin posición, con todos los puntos a la vista. Si ya movió
// el mapa en esta sesión, se respeta. La leyenda, plegada.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

// Dentro de la zona, entre los puntos de prueba y lejos de todos ellos (a más de 60 m).
const AQUI = { latitude: 37.2302, longitude: -3.6575 };

async function abrir(page: Page, { esperarPuntos = true } = {}) {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_ficha_punto: PUNTOS[0], fn_registrar_error: null });
  await page.goto('/');
  // Los puntos ya guardados: se ve algún marcador (sin depender del sello, que cambia con RV-311).
  if (esperarPuntos) await expect(page.locator('.marcador').first()).toBeVisible();
}

/** El aviso dura 4 s: se busca nada más abrir, sin esperar a nada más. */
const avisoCentrado = (page: Page) => page.getByRole('status').filter({ hasText: T.mapa.centradoEnTi });
const mapa = (page: Page) => page.getByTestId('mapa');
const zoom = async (page: Page) => Number(await mapa(page).getAttribute('data-zoom'));
const centro = async (page: Page) => {
  const c = (await mapa(page).getAttribute('data-centro')) ?? '';
  const [lat, lng] = c.split(',').map(Number);
  return { lat: lat ?? NaN, lng: lng ?? NaN };
};

test.describe('el mapa se abre donde está el voluntario (RV-310)', () => {
  test('con posición dentro de la zona: zoom 17 centrado en él, con aviso y «Mi posición» marcado', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...AQUI, accuracy: 10 });
    await abrir(page, { esperarPuntos: false });
    const aviso = avisoCentrado(page);
    await expect(aviso).toBeVisible();
    await expect(aviso.getByRole('button', { name: T.mapa.verTodaLaZona })).toBeVisible();

    await expect.poll(() => zoom(page)).toBe(17);
    const c = await centro(page);
    expect(c.lat).toBeCloseTo(AQUI.latitude, 4);
    expect(c.lng).toBeCloseTo(AQUI.longitude, 4);
    await expect(page.getByRole('button', { name: T.mapa.miPosicion })).toHaveAttribute('aria-pressed', 'true');

    // Se va solo a los 4 s.
    await expect(aviso).toHaveCount(0, { timeout: 6_000 });

    // Mover el mapa desmarca «Mi posición».
    await page.getByRole('button', { name: T.mapa.alejar }).click();
    await expect(page.getByRole('button', { name: T.mapa.miPosicion })).toHaveAttribute('aria-pressed', 'false');
  });

  test('«Ver toda la zona» encuadra la zona', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...AQUI, accuracy: 10 });
    await abrir(page, { esperarPuntos: false });
    await avisoCentrado(page).getByRole('button', { name: T.mapa.verTodaLaZona }).click();
    await expect.poll(() => zoom(page)).toBeLessThan(14);
    await expect(avisoCentrado(page)).toHaveCount(0);
  });

  test('sin permiso de ubicación se ven todos los puntos, no la zona entera', async ({ page }) => {
    await abrir(page);
    // A z ≥ 16 se dibujan todos (06 §4.4); con la zona entera, solo los grandes.
    await expect(page.locator('.marcador')).toHaveCount(PUNTOS.length);
    // Todos dentro del mapa. Se repite hasta que el mapa queda quieto: los marcadores se repintan
    // con cada zoom.
    const fuera = () =>
      page.evaluate(
        (codigos) => {
          const caja = document.querySelector('[data-testid="mapa"]')!.getBoundingClientRect();
          return codigos.filter((c) => {
            const b = document.querySelector(`.marcador[title="${c}"]`)?.getBoundingClientRect();
            if (!b) return true;
            const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
            return x <= caja.left || x >= caja.right || y <= caja.top || y >= caja.bottom;
          });
        },
        PUNTOS.map((p) => p.codigo),
      );
    await expect.poll(fuera, { timeout: 10_000 }).toEqual([]);
    await expect(avisoCentrado(page)).toHaveCount(0);
  });

  test('la leyenda empieza plegada, también la primera vez', async ({ page }) => {
    await abrir(page);
    await expect(page.getByRole('button', { name: T.mapa.leyenda, exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: T.mapa.leyenda })).toHaveCount(0);
  });

  test('si el voluntario ya movió el mapa, al volver de la ficha no se recentra', async ({ page, context }) => {
    // En el móvil la ficha es otra pantalla y el mapa se desmonta; en ordenador flota sobre él.
    test.skip((page.viewportSize()?.width ?? 0) >= 1100, 'en ordenador la ficha flota sobre el mapa');
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...AQUI, accuracy: 10 });
    await abrir(page);
    await expect.poll(() => zoom(page)).toBe(17);
    await page.getByRole('button', { name: T.mapa.alejar }).click();
    await expect.poll(() => zoom(page)).toBe(16);
    const antes = await centro(page);

    await page.getByRole('searchbox', { name: T.mapa.buscar }).fill(PUNTOS[0]!.codigo);
    await page.locator('button').filter({ hasText: PUNTOS[0]!.codigo }).first().click();
    await expect(page).toHaveURL(/\?p=/);
    await expect(page.getByRole('article')).toBeVisible();
    await page.goBack();
    await expect(mapa(page)).toBeVisible();
    // Vuelve como lo dejó (z16), sin recentrarse a z17 en el voluntario.
    await expect.poll(() => zoom(page)).toBe(16);
    await page.waitForTimeout(500);
    expect(await zoom(page)).toBe(16);
    const despues = await centro(page);
    expect(despues.lat).toBeCloseTo(antes.lat, 5);
    expect(despues.lng).toBeCloseTo(antes.lng, 5);
  });
});
