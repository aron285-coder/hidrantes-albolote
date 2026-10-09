// docs/33 RV-317 (U8, D11): las capas en palabras, con una miniatura de cada una, las fuentes en una
// línea al pie, sin fallos de axe en la lista, y los mismos nombres en «Capa por defecto» de Ajustes.

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO } from './puntos.ts';

const NOMBRES = ['Mapa sin conexión', 'Callejero', 'Foto aérea', 'Catastro'];

async function abrir(page: Page, ruta = '/') {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null });
  await page.goto(ruta);
}

test('las capas en palabras, con su miniatura y las fuentes al pie (RV-317)', async ({ page }) => {
  await abrir(page);
  await page.getByRole('button', { name: T.mapa.capas }).click();
  const hoja = page.getByRole('dialog', { name: T.mapa.capas });
  const grupo = hoja.getByRole('radiogroup', { name: T.mapa.capas });
  await expect(grupo.getByRole('radio')).toHaveCount(4);
  for (const [i, nombre] of NOMBRES.entries()) {
    await expect(grupo.getByRole('radio').nth(i)).toContainText(nombre);
  }
  // Las tres en línea dicen que necesitan cobertura; el mapa sin conexión, que funciona sin ella.
  await expect(grupo.getByRole('radio').nth(0)).toContainText(T.capas.descBase);
  for (const i of [1, 2, 3]) await expect(grupo.getByRole('radio').nth(i)).toContainText(T.mapa.necesitaCobertura);
  // Una miniatura por capa, cargada (imagen fija de public/capas/).
  const miniaturas = grupo.locator('img');
  await expect(miniaturas).toHaveCount(4);
  await expect
    .poll(() => miniaturas.evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length))
    .toBe(4);
  // Las siglas, solo en la línea de fuentes.
  await expect(hoja).toContainText(T.capas.fuentes);
  await expect(grupo).not.toContainText('OSM');
  await expect(grupo).not.toContainText('PNOA');
  // D11: la lista de opciones no falla en axe.
  const { violations } = await new AxeBuilder({ page }).include('[role=dialog]').analyze();
  expect(violations.map((v) => `${v.id} · ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('Ajustes, «Capa por defecto», con los mismos nombres (RV-317)', async ({ page }) => {
  await abrir(page, '/ajustes');
  await expect(page.getByText(T.ajustes.capaPorDefecto)).toBeVisible();
  await expect(page.getByText(NOMBRES[0]!, { exact: true })).toBeVisible();
});
