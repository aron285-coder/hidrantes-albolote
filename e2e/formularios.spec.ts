// docs/33 RV-316 (U7, D9): en el alta, cada foto hecha se lee en una línea («✓ Conexión · 18 kB») y
// tocar su ficha la repite. Datos simulados; nunca un servidor real.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO } from './puntos.ts';

async function jpeg(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 300;
    c.getContext('2d')!.fillRect(0, 0, 400, 300);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

test('alta: «✓ Conexión · N kB» en una línea, y tocar la ficha repite la foto (D9)', async ({ page }) => {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null });
  await page.goto('/proponer/alta');
  const foto = await jpeg(page);
  await page.getByTestId('entrada-foto').setInputFiles({ name: 'c.jpg', mimeType: 'image/jpeg', buffer: foto });
  await page.getByTestId('entrada-foto-sitio').setInputFiles({ name: 's.jpg', mimeType: 'image/jpeg', buffer: foto });

  for (const [hueco, nombre, etiqueta] of [
    ['hueco-entrada-foto', T.formulario.repetirFotoConexion, T.formulario.conexion],
    ['hueco-entrada-foto-sitio', T.formulario.repetirFotoSitio, T.formulario.sitio],
  ] as const) {
    const ficha = page.getByTestId(hueco).getByRole('button', { name: nombre, exact: true });
    await expect(ficha).toBeVisible();
    await expect(ficha).toContainText(new RegExp(`^${etiqueta} · \\d+ kB$`));
    // Sin «repetir» aparte: la ficha entera es el botón.
    await expect(page.getByTestId(hueco).getByText(T.formulario.repetir, { exact: true })).toHaveCount(0);
    // Una sola línea: el texto no se parte aunque el hueco sea medio ancho a 412 px.
    const linea = ficha.getByText(new RegExp(`^${etiqueta} · \\d+ kB$`));
    const alto = await linea.evaluate((e) => e.getBoundingClientRect().height);
    const interlineado = await linea.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
    expect(alto).toBeLessThan(interlineado * 1.5);
    const [selector] = await Promise.all([page.waitForEvent('filechooser'), ficha.click()]);
    expect(selector.isMultiple()).toBe(false);
  }
});
