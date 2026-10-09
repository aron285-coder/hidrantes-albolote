// docs/33 RV-327: en la captura m13 del recorrido (412 × 915, página completa) había ~260 px vacíos
// encima de la cabecera del alta abierta desde el mapa. Guarda: al abrir el alta con el + del mapa, la
// cabecera está arriba del todo (y = 0; en staging y en local, justo debajo de la banda del entorno) y
// la página no queda desplazada; al bajar por el formulario, la cabecera sigue fija arriba.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO } from './puntos.ts';

/** Dónde empieza la app: 0 en producción; debajo de la banda naranja en staging y en local (04 §4). */
const arriba = (page: Page) =>
  page.evaluate((texto) => {
    const banda = [...document.querySelectorAll('[role="status"]')].find((e) => e.textContent === texto);
    return banda ? Math.round(banda.getBoundingClientRect().bottom) : 0;
  }, T.app.entornoPruebas);

const yCabecera = async (page: Page) => Math.round((await page.getByRole('banner').boundingBox())!.y);

test.skip(({ isMobile }) => !isMobile, 'RV-327 se mide en el perfil móvil');

test('el alta abierta desde el mapa empieza con la cabecera arriba (RV-327)', async ({ page }, info) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByTestId('mapa')).toBeVisible();

  await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
  await expect(page).toHaveURL(/\/proponer\/alta$/);
  await expect(page.getByRole('banner')).toContainText(T.navegacion.nuevoPunto);
  await info.attach('alta-al-abrir', { body: await page.screenshot(), contentType: 'image/png' });

  expect(await page.evaluate(() => scrollY), 'la página no empieza desplazada').toBe(0);
  const y0 = await arriba(page);
  await expect.poll(() => yCabecera(page), { message: 'cabecera arriba del todo' }).toBe(y0);

  // Al bajar hasta el final del formulario (como en m13), la cabecera queda fija arriba. Con menos alto,
  // para que el formulario no quepa y la página baje de verdad más que la banda.
  await page.setViewportSize({ width: 412, height: 600 });
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => scrollY), { message: 'la página baja' }).toBeGreaterThan(y0);
  await info.attach('alta-abajo', { body: await page.screenshot(), contentType: 'image/png' });
  await expect.poll(() => yCabecera(page), { message: 'cabecera fija arriba al bajar' }).toBe(0);
});
