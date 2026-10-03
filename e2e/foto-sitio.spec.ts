// docs/24 RV-103 (FR-66): la ficha enseña la foto de la conexión y, si la hay, la del sitio; se pasa
// de una a otra con los dos botones de debajo, cada uno con su palabra.

import { expect, test } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const CON_DOS = { ...PUNTOS[0]!, foto_path: 'fotos/conexion.jpg', foto_sitio_path: 'fotos/sitio.jpg' };

test('la ficha enseña las dos fotos y se pasa de una a otra', async ({ page }) => {
  // Las fotos: una imagen cualquiera, para que se carguen sin red de verdad.
  await page.route(`${SUPABASE_PRUEBAS}/storage/v1/object/public/**`, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"/>',
    }),
  );
  await conSesion(page);
  await simularRpc(page, {
    fn_listar_puntos: { ...LISTADO, puntos: [CON_DOS, ...PUNTOS.slice(1)] },
    fn_registrar_error: null,
  });
  await page.goto(`/?p=${CON_DOS.id}`);
  const ficha = page.getByRole('article');
  const conexion = ficha.getByRole('button', { name: T.formulario.conexion, exact: true });
  const sitio = ficha.getByRole('button', { name: T.formulario.sitio, exact: true });
  await expect(conexion).toHaveAttribute('aria-pressed', 'true');
  await expect(ficha.locator('img')).toHaveAttribute('src', /fotos\/conexion\.jpg$/);
  await sitio.click();
  await expect(sitio).toHaveAttribute('aria-pressed', 'true');
  await expect(ficha.locator('img')).toHaveAttribute('src', /fotos\/sitio\.jpg$/);
  await expect(ficha.locator('img')).toHaveAttribute('alt', T.ficha.fotoDe(CON_DOS.codigo, T.formulario.sitio));
});

test('un punto sin foto del sitio enseña solo la de la conexión, sin botones', async ({ page }) => {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto(`/?p=${PUNTOS[0]!.id}`);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.getByRole('article').getByRole('button', { name: T.formulario.sitio, exact: true })).toHaveCount(0);
});
