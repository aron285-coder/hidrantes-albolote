// docs/39 RV-523 (DEC-222): Editar enseña las fotos del punto (conexión y sitio), en solo lectura; tocarlas las
// amplía; si no cargan, el texto en su hueco. En el mapa del Inventario, tocar un punto abre Editar. La lista no
// pide ninguna foto. Datos simulados.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { accionInventario, filtrarPor } from './ayudas.ts';
import { jefatura, PANEL_COMPLETO } from './panel-simulado.ts';
import { PUNTOS } from './puntos.ts';

test.skip(({ isMobile }) => isMobile, 'en escritorio, con el ancho a mano');

// HID-9001 con las dos fotos; HID-9002 solo con la de la conexión; HID-9003 con una que no carga.
const CON_FOTOS = PUNTOS.map((p, i) =>
  i === 0
    ? { ...p, foto_path: 'fotos/c1.jpg', foto_sitio_path: 'fotos/s1.jpg' }
    : i === 1
      ? { ...p, foto_path: 'fotos/c2.jpg', foto_sitio_path: null }
      : i === 2
        ? { ...p, foto_path: 'fotos/rota.jpg', foto_sitio_path: null }
        : p,
);

async function preparar(page: Page) {
  await jefatura(page, { ...PANEL_COMPLETO, v_puntos_activos: CON_FOTOS });
  const pedidas: string[] = [];
  await page.route(`${SUPABASE_PRUEBAS}/storage/v1/object/**`, async (r) => {
    pedidas.push(r.request().url());
    if (r.request().url().includes('rota.jpg')) return r.fulfill({ status: 404, body: '' });
    // Un JPEG mínimo de 1 × 1.
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
      'base64',
    );
    return r.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: jpeg,
    });
  });
  return pedidas;
}

for (const [ancho, alto] of [
  [412, 915],
  [820, 1180],
  [1280, 800],
] as const) {
  test(`a ${ancho} px: Editar enseña las fotos del punto`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    const pedidas = await preparar(page);
    await page.goto('/admin/inventario');
    await expect(page.getByText('HID-9001').first()).toBeVisible();
    // La lista no pide ninguna foto.
    expect(pedidas).toEqual([]);

    await accionInventario(page, 'HID-9001', 'editar');
    const editar = page.getByRole('dialog');
    await expect(editar.getByRole('img', { name: T.formulario.conexion })).toBeVisible();
    await expect(editar.getByRole('img', { name: T.formulario.sitio })).toBeVisible();
    await expect(editar.getByRole('link', { name: T.panelCola.ampliarFoto(T.formulario.conexion) })).toHaveAttribute(
      'href',
      /fotos\/c1\.jpg$/,
    );
    await editar.getByRole('button', { name: T.ficha.cerrar }).click();

    // Una sola: a todo el ancho.
    await accionInventario(page, 'HID-9002', 'editar');
    const una = page.getByRole('dialog').getByRole('img', { name: T.formulario.conexion });
    await expect(una).toBeVisible();
    const caja = (await una.boundingBox())!;
    const panel = (await page.getByRole('dialog').boundingBox())!;
    expect(caja.width).toBeGreaterThan(panel.width * 0.8);
    await page.getByRole('dialog').getByRole('button', { name: T.ficha.cerrar }).click();

    // Una que no carga: el texto en su hueco.
    await accionInventario(page, 'HID-9003', 'editar');
    await expect(page.getByRole('dialog').getByText(T.panelCola.fotoNoCarga)).toBeVisible();
  });
}

test('en el mapa del Inventario, tocar un punto abre Editar de ese punto', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await preparar(page);
  await page.goto('/admin/inventario');
  await filtrarPor(page, T.panelInventario.colTipo, T.mapa.hidrantes);
  await page.getByRole('radio', { name: T.panelInventario.mapa }).click();
  await page.locator('.leaflet-marker-icon.marcador[title="HID-9001"]').click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /HID-9001/ })).toBeVisible();
});
