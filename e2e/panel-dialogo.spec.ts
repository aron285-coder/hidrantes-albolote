// Panel · las ventanas de diálogo (docs/31 RV-160): el foco entra al abrir, no se va cuando el panel
// se refresca por detrás (los contadores, cada 60 s) y, al cerrar, vuelve al botón que la abrió.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

const [P0] = PUNTOS;

/** Panel simulado; devuelve cuántas veces se ha pedido el contador de pendientes. */
async function prepararPanel(page: Page) {
  const cuentas = { pendientes: 0 };
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: [],
    propuestas: (url) => {
      if (url.searchParams.get('estado') === 'eq.pendiente') cuentas.pendientes++;
      return [];
    },
    puntos: [],
    config: [{ valor: 30 }],
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, async (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    const json = (d: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
    if (nombre === 'fn_es_admin') return json(true);
    return route.abort('connectionrefused');
  });
  return cuentas;
}

test('Retirar: un refresco del panel no saca el foco del motivo, y al cerrar vuelve al botón (RV-160)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.install();
  const cuentas = await prepararPanel(page);
  await page.goto('/admin/inventario');
  const fila = page.getByRole('row').filter({ hasText: P0.codigo });
  const boton = fila.getByRole('button', { name: T.panel.retirar });
  await boton.click();

  const dialogo = page.getByRole('dialog');
  // Al abrir, el foco entra en la ventana (TR-35).
  await expect(dialogo).toBeFocused();
  const motivo = dialogo.getByLabel(T.panelInventario.motivo);
  await motivo.click();
  await page.keyboard.type('Sustituido ');

  // Pasa un minuto: los contadores del panel se vuelven a pedir y todo se pinta de nuevo por detrás.
  const antes = cuentas.pendientes;
  await page.clock.runFor(61_000);
  await expect.poll(() => cuentas.pendientes).toBeGreaterThan(antes);
  await expect(motivo).toBeFocused();
  await page.keyboard.type('por obra');
  await expect(motivo).toHaveValue('Sustituido por obra');

  // Escape cierra y el foco vuelve al "Retirar" de la fila, no a <body>.
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
  await expect(boton).toBeFocused();
});

test('Historial: al cerrar con la ✕, el foco vuelve al botón que lo abrió (RV-160)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepararPanel(page);
  await page.goto('/admin/inventario');
  const boton = page.getByRole('row').filter({ hasText: P0.codigo }).getByRole('button', { name: T.panel.historial });
  await boton.click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeFocused();
  await dialogo.getByRole('button', { name: T.ficha.cerrar }).click();
  await expect(dialogo).toHaveCount(0);
  await expect(boton).toBeFocused();
});
