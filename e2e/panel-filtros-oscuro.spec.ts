// docs/39 RV-522: la hoja de filtros se lee en modo oscuro. El radio y el chip elegidos contrastan al menos 3:1 con el
// fondo de la hoja (WCAG 1.4.11) y «Listo» tiene un borde que se ve. Datos simulados.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { abrirFiltros } from './ayudas.ts';
import { jefatura, PANEL_COMPLETO } from './panel-simulado.ts';

test.skip(({ isMobile }) => isMobile, 'en escritorio, con el ancho a mano');

/** Contraste WCAG entre dos colores CSS `rgb(…)`. */
function contraste(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? [])
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** El fondo efectivo de un elemento: el del primer antepasado que no es transparente. */
const fondo = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((e) => {
      for (let n: Element | null = e; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      }
      return 'rgb(255, 255, 255)';
    });

test('en oscuro a 412: el radio y el chip elegidos contrastan 3:1, y «Listo» tiene borde', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await jefatura(page, PANEL_COMPLETO);
  await page.goto('/admin/inventario');
  await abrirFiltros(page);
  const hoja = page.getByRole('dialog');
  await expect(hoja).toBeVisible();
  const fondoHoja = await fondo(page, '[role="dialog"]');

  // El chip elegido (Tipo: «Todos»).
  const chip = hoja.getByRole('radiogroup', { name: T.panelInventario.colTipo }).getByRole('radio', { checked: true });
  const bordeChip = await chip.evaluate((e) => getComputedStyle(e).borderTopColor);
  expect(contraste(bordeChip, fondoHoja), `chip ${bordeChip} sobre ${fondoHoja}`).toBeGreaterThanOrEqual(3);

  const listo = hoja.getByRole('button', { name: T.panel.listo, exact: true });
  const borde = await listo.evaluate((e) => ({
    ancho: getComputedStyle(e).borderTopWidth,
    color: getComputedStyle(e).borderTopColor,
  }));
  expect(parseFloat(borde.ancho)).toBeGreaterThan(0);
  expect(contraste(borde.color, fondoHoja)).toBeGreaterThanOrEqual(3);

  // El círculo del radio elegido de una lista (la Acción del Registro: «Todas las acciones»).
  await page.keyboard.press('Escape');
  await page.goto('/admin/registro');
  await abrirFiltros(page);
  const lista = page.getByRole('dialog').getByRole('radiogroup', { name: T.panelRegistro.colAccion });
  const anillo = await lista
    .getByRole('radio', { checked: true })
    .locator('span[aria-hidden]')
    .first()
    .evaluate((e) => getComputedStyle(e).borderTopColor);
  const fondoLista = await fondo(page, '[role="dialog"]');
  expect(contraste(anillo, fondoLista), `radio ${anillo} sobre ${fondoLista}`).toBeGreaterThanOrEqual(3);
});
