// docs/29 RV-122 (DEC-167): el panel se queda con cinco pestañas. Fuera Revisiones caducadas y
// Voluntarios; sus rutas viejas llevan al Inventario por si alguien las tiene guardadas, y en Salud
// del sistema ya no sale "Incidencias abiertas". Todos los datos son simulados.

import { AxeBuilder } from '@axe-core/playwright';
import type { NodeResult, Result } from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conGoogle, simularRpc, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

test.describe.configure({ timeout: 60_000 });
const CARGA = 15_000;

const CINCO = [
  T.panelCola.colaRevision,
  T.panelCola.inventario,
  T.panelCola.registro,
  T.panelCola.papelera,
  T.panelCola.ajustes,
];

async function prepararPanel(page: Page) {
  await conGoogle(page, 'jefatura@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: [],
    v_registro: [],
    propuestas: [],
    puntos: [],
    // Si alguien pide todavía las incidencias, que el badge tenga algo que enseñar.
    incidencias_app: [{ id: 'i1', estado: 'abierta' }],
    config: [],
    administradores: [
      { email: 'jefatura@example.org', activo: true, creado_en: '2026-08-01T10:00:00Z', creado_por: 'migracion' },
    ],
    dispositivos: [],
    nucleos: [],
  });
  await simularRpc(page, {
    fn_es_admin: true,
    // La RPC de salud puede seguir devolviendo el campo: el panel lo ignora.
    fn_salud: { pendientes_14d: 0, errores_7d: 0, sin_direccion: 0, dispositivos_activos: 3 },
    fn_registrar_error: null,
  });
}

const pestanas = (page: Page) => page.getByRole('navigation', { name: T.jefatura.panel }).getByRole('link');

async function auditar(page: Page, contexto: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const resumen = violations.flatMap((v: Result) =>
    v.nodes.map((n: NodeResult) => `${v.id} · ${n.target.join(' ')} · ${v.help}`),
  );
  expect(resumen, `${contexto} · violaciones de axe`).toEqual([]);
}

test('el panel enseña exactamente cinco pestañas, sin badge de incidencias (RV-122)', async ({ page }) => {
  await prepararPanel(page);
  const pedidas: string[] = [];
  page.on('request', (r) => pedidas.push(new URL(r.url()).pathname));
  // Los contadores salen juntos al abrir el panel: cuando ha salido el de la papelera, habría salido el de incidencias.
  const papelera = page.waitForRequest((r) => new URL(r.url()).pathname.endsWith('/rest/v1/puntos'));
  await page.goto('/admin/cola');
  await expect(pestanas(page)).toHaveCount(5, { timeout: CARGA });
  await papelera;
  // Cada pestaña empieza por su nombre; detrás puede ir su contador.
  const textos = await pestanas(page).allInnerTexts();
  expect(textos.map((t, i) => t.startsWith(CINCO[i]))).toEqual(CINCO.map(() => true));
  const nav = page.getByRole('navigation', { name: T.jefatura.panel });
  await expect(nav.getByText('Revisiones caducadas')).toHaveCount(0);
  await expect(nav.getByText('Voluntarios')).toHaveCount(0);
  // El badge de incidencias no se pasa a otra pestaña: el panel ya no las cuenta.
  expect(pedidas.filter((r) => r.endsWith('/incidencias_app'))).toEqual([]);
  await auditar(page, 'panel · cola con cinco pestañas');
});

for (const vieja of ['caducadas', 'voluntarios']) {
  test(`/admin/${vieja} lleva al Inventario (RV-122)`, async ({ page }) => {
    await prepararPanel(page);
    await page.goto('/admin/cola');
    await expect(pestanas(page)).toHaveCount(5, { timeout: CARGA });
    await page.goto(`/admin/${vieja}`);
    await expect(page).toHaveURL(/\/admin\/inventario$/, { timeout: CARGA });
    await expect(page.getByText(T.panel.mostrando(PUNTOS.length, PUNTOS.length))).toBeVisible({ timeout: CARGA });
    // Con replace, "atrás" vuelve a la cola y no a la ruta vieja (que redirigiría otra vez al Inventario).
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/cola$/, { timeout: CARGA });
  });
}

test('en Salud del sistema no aparece "Incidencias" (RV-122)', async ({ page }) => {
  await prepararPanel(page);
  await page.goto('/admin/ajustes');
  const salud = page.getByRole('region', { name: T.panel.saludSistema });
  await expect(salud.getByText(T.panelAjustes.pendientes14)).toBeVisible({ timeout: CARGA });
  await expect(salud.getByText(/incidencias/i)).toHaveCount(0);
  await auditar(page, 'panel · ajustes');
});

test.describe('a 412 px', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('las cinco pestañas caben o se desplazan en su fila, sin desplazar la página a lo ancho (RV-122)', async ({
    page,
  }) => {
    await prepararPanel(page);
    await page.goto('/admin/inventario');
    await expect(pestanas(page)).toHaveCount(5, { timeout: CARGA });
    const nav = page.getByRole('navigation', { name: T.jefatura.panel });
    for (const enlace of await pestanas(page).all()) {
      await enlace.scrollIntoViewIfNeeded();
      const caja = (await enlace.boundingBox())!;
      expect(caja.x).toBeGreaterThanOrEqual(0);
      expect(caja.x + caja.width).toBeLessThanOrEqual(412);
      // Firefox redondea a 43,99998 px: medio píxel de tolerancia.
      expect(Math.round(caja.height)).toBeGreaterThanOrEqual(44);
    }
    // Si la fila no cabe, se desplaza dentro de su caja; la página, nunca.
    const fila = await nav.evaluate((n) => ({
      ancho: n.scrollWidth - n.clientWidth,
      x: getComputedStyle(n).overflowX,
    }));
    if (fila.ancho > 0) expect(['auto', 'scroll']).toContain(fila.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    await auditar(page, 'panel · inventario a 412 px');
  });
});
