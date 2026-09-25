// docs/21 RV-85: quien nunca descargó el mapa base solo tiene, sin cobertura, las teselas sueltas de
// `hidrantes-teselas-<versión>`. Un Service Worker nuevo borra las de otras versiones al activarse
// (docs/20 RV-71): tras eso, el aviso "El mapa base no está en el móvil" tiene que salir, con
// cobertura y sin ella (DEC-124).

import { expect, test } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const VIEJA = 'hidrantes-teselas-19990101';

test.skip(({ isMobile }) => !isMobile, 'basta con el móvil: el Service Worker es el mismo');

test('con teselas sueltas de una versión vieja y el SW nuevo, se borran y el aviso sale (RV-85)', async ({
  page,
  context,
}) => {
  // Con datos móviles: el mapa base no se descarga solo (FR-81), así que solo hay teselas sueltas.
  await page.addInitScript(() => {
    const conexion = Object.assign(new EventTarget(), { type: 'cellular', saveData: false });
    Object.defineProperty(navigator, 'connection', { get: () => conexion, configurable: true });
  });
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
  // Teselas vistas en línea con la versión anterior del mapa base.
  await page.evaluate(async (nombre) => {
    await navigator.serviceWorker.ready;
    const c = await caches.open(nombre);
    await c.put('/mapabase/t/19990101/12/2040/1580.mvt', new Response('tesela vieja'));
  }, VIEJA);

  // Llega un Service Worker nuevo: se instala y se activa de cero.
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  });
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain(VIEJA);

  // Con cobertura, el aviso ofrece la descarga.
  await expect(page.getByTestId('aviso-mapabase')).toContainText(T.mapa.mapabaseFalta);

  // Sin cobertura, dice que el fondo no está.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(T.mapa.mapaNoDescargado)).toBeVisible();
});
