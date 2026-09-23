// La misma URL en tres anchos (TR-25, FR-70, docs/17 RV-28): el móvil, la tableta y el ordenador.
// Aserciones de disposición, no capturas comparadas; las capturas van como adjunto del informe para
// que una persona las mire.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const [P0] = PUNTOS;

async function abrir(page: Page, ancho: number, alto: number, ruta = '/') {
  await page.setViewportSize({ width: ancho, height: alto });
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_ficha_punto: P0, fn_registrar_error: null });
  await page.goto(ruta);
  await expect(page.getByTestId('mapa')).toBeVisible();
}

async function captura(page: Page, info: TestInfo, nombre: string) {
  await info.attach(nombre, { body: await page.screenshot(), contentType: 'image/png' });
}

// Los anchos los fija cada prueba: con el proyecto de escritorio basta, el de móvil lo repetiría.
test.skip(({ isMobile }) => !!isMobile, 'los tres anchos se fijan a mano en el proyecto de escritorio');

test('390 px: el mapa ocupa todo el ancho y la ficha es una pantalla propia', async ({ page }, info) => {
  await abrir(page, 390, 844);
  const mapa = (await page.getByTestId('mapa').boundingBox())!;
  expect(mapa.x).toBeLessThanOrEqual(1);
  expect(mapa.width).toBeGreaterThanOrEqual(388);
  // Sin lista lateral: el buscador es el del propio mapa.
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await captura(page, info, 'mapa-390');

  await page.goto(`/?p=${P0.id}`);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.getByTestId('mapa')).toHaveCount(0);
  await captura(page, info, 'ficha-390');
});

test('768 px: las herramientas son botones laterales y mapa y ficha se ven a la vez (TR-25, FR-70)', async ({
  page,
}, info) => {
  await abrir(page, 768, 1024, `/?p=${P0.id}`);
  const mapa = (await page.getByTestId('mapa').boundingBox())!;
  for (const nombre of [T.mapa.capas, T.mapa.miPosicion, T.mapa.acercar, T.mapa.alejar]) {
    const b = (await page.getByRole('button', { name: nombre }).boundingBox())!;
    // En la columna de la derecha del mapa.
    expect(b.x + b.width, nombre).toBeGreaterThan(mapa.x + mapa.width - 80);
  }
  const ficha = (await page.getByRole('article').boundingBox())!;
  expect(ficha.width).toBeLessThan(mapa.width);
  await captura(page, info, 'tableta-768');
});

test('1280 px: lista lateral y ficha flotante que no tapa el plano (FR-70)', async ({ page }, info) => {
  await abrir(page, 1280, 800, `/?p=${P0.id}`);
  const lista = page.getByRole('complementary').first();
  await expect(lista.getByRole('searchbox', { name: T.mapa.buscar })).toBeVisible();
  const mapa = (await page.getByTestId('mapa').boundingBox())!;
  const ficha = (await page.getByRole('article').boundingBox())!;
  // Flotante dentro del mapa, y ocupando como mucho la mitad de su ancho: el plano sigue a la vista.
  expect(ficha.x).toBeGreaterThanOrEqual(mapa.x);
  expect(ficha.x + ficha.width).toBeLessThanOrEqual(mapa.x + mapa.width + 1);
  expect(ficha.width).toBeLessThan(mapa.width / 2);
  await captura(page, info, 'escritorio-1280');
});
