// docs/35 RV-424: el aviso de versión nueva va fijo abajo; la ficha del móvil deja sitio debajo para
// que su final (copiar las UTM) se pueda ver y pulsar.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

test.use({ viewport: { width: 412, height: 915 } });

// Con las dos fotos la ficha es más alta que la pantalla: hay que bajar para llegar a las UTM.
const P = {
  ...PUNTOS[0],
  lat: 37.2305,
  lng: -3.656,
  foto_path: 'fotos/conexion.jpg',
  foto_sitio_path: 'fotos/sitio.jpg',
  descripcion: `[PRUEBA] ${'Junto a la fachada, detrás del contenedor y a la izquierda de la puerta del garaje. '.repeat(4)}`,
};
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function abrirFicha(page: Page) {
  await page.route(`${SUPABASE_PRUEBAS}/storage/v1/object/public/**`, (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } }),
  );
  await conSesion(page);
  await simularRpc(page, {
    fn_listar_puntos: { ...LISTADO, puntos: [P, ...PUNTOS.slice(1)] },
    fn_mis_propuestas: [],
    fn_registrar_error: null,
  });
  await page.goto(`/?p=${P.id}`);
  await expect(page.getByRole('region', { name: T.coordenadas.titulo })).toBeVisible();
}

/** Publica una versión nueva del Service Worker: la app enseña el aviso de versión. */
async function publicarVersionNueva(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // Otra dirección del mismo script cuenta como versión nueva: se instala y espera, como al publicar.
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js?version=nueva').then(() => undefined));
  await expect(page.getByTestId('aviso-version')).toBeVisible();
}

test.describe('el aviso de versión no tapa el final de la ficha (RV-424)', () => {
  test.skip(({ isMobile }) => !isMobile, 'la ficha a pantalla completa: proyecto movil');

  test('con el aviso visible, copiar las UTM se ve y se puede pulsar al bajar', async ({ page }) => {
    await abrirFicha(page);
    await publicarVersionNueva(page);
    const copiar = page.getByRole('button', { name: T.coordenadas.copiar(T.coordenadas.utm) });
    // Hasta el final de la ficha, como al bajar con el dedo.
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 5000);
    await expect(copiar).toBeInViewport();
    const boton = (await copiar.boundingBox())!;
    const aviso = (await page.getByTestId('aviso-version').boundingBox())!;
    // El botón termina por encima del aviso: no lo tapa.
    expect(boton.y + boton.height).toBeLessThanOrEqual(aviso.y);
    // Y el toque llega al botón, no al aviso.
    await copiar.click({ trial: true });
  });
});
