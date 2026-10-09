// docs/33 RV-314 (U5): en la ficha, sin foto o si falla, una franja de 44 px y no un bloque; con
// «Reintentar» si la carga falló; y «Cómo llegar» en la primera pantalla a 412 × 915. Datos simulados.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const P0 = PUNTOS[0];

async function abrirFicha(page: Page, punto: Record<string, unknown>) {
  await conSesion(page);
  await simularRpc(page, {
    fn_listar_puntos: { ...LISTADO, puntos: [punto, ...PUNTOS.slice(1)] },
    fn_ficha_punto: punto,
    fn_mis_propuestas: [],
    fn_registrar_error: null,
  });
  await page.goto(`/?p=${P0.id}`);
  await expect(page.getByRole('link', { name: T.ficha.comoLlegar })).toBeVisible();
}

/** La franja de la foto: su alto y si «Cómo llegar» queda dentro de la pantalla sin desplazarse. */
async function comprobarFranja(page: Page, texto: string) {
  const franja = page.getByTestId('foto-franja');
  await expect(franja).toContainText(texto);
  const caja = (await franja.boundingBox())!;
  expect(caja.height).toBeGreaterThanOrEqual(44);
  expect(caja.height).toBeLessThan(60);
  const llegar = (await page.getByRole('link', { name: T.ficha.comoLlegar }).boundingBox())!;
  expect(llegar.y + llegar.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

test.describe('la foto de la ficha (RV-314)', () => {
  test('sin foto: una franja de 44 px con «Sin foto», y «Cómo llegar» a la vista', async ({ page }) => {
    await abrirFicha(page, { ...P0, foto_path: null });
    await comprobarFranja(page, T.ficha.sinFoto);
    await expect(page.getByTestId('foto-franja').locator('svg')).toHaveCount(1);
  });

  test('si no carga: «No se ha podido cargar la foto · Reintentar», y Reintentar la vuelve a pedir', async ({
    page,
  }) => {
    let pedirla = false;
    await page.route(`${SUPABASE_PRUEBAS}/storage/v1/object/public/**`, async (r) => {
      if (!pedirla) return r.fulfill({ status: 404, body: '' });
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      );
      return r.fulfill({
        status: 200,
        contentType: 'image/png',
        body: png,
        headers: { 'access-control-allow-origin': '*' },
      });
    });
    await abrirFicha(page, { ...P0, foto_path: 'fotos/no-esta.jpg' });
    await comprobarFranja(page, T.ficha.fotoNoCarga);
    const reintentar = page.getByTestId('foto-franja').getByRole('button', { name: T.ficha.reintentarFoto });
    // Si vuelve a fallar, lo dice y se puede probar otra vez: el botón no parece muerto.
    await reintentar.click();
    await comprobarFranja(page, T.ficha.fotoSigueSinCargar);
    pedirla = true;
    await reintentar.click();
    const foto = page.getByRole('img', { name: P0.codigo });
    await expect(foto).toBeVisible();
    // Con foto, el alto de siempre (150 o 170 px), nunca más de 200; y «Cómo llegar» sigue a la vista.
    expect((await foto.boundingBox())!.height).toBeLessThanOrEqual(200);
    const llegar = (await page.getByRole('link', { name: T.ficha.comoLlegar }).boundingBox())!;
    expect(llegar.y + llegar.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  });
});
