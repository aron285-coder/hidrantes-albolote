// Auditoría de accesibilidad con axe sobre las pantallas de verdad (TR-30, TR-103). El contraste de
// los tokens ya lo mide src/lib/accesibilidad.test.ts; esto busca lo que solo se ve montado: campos
// sin etiqueta, encabezados saltados, botones sin nombre accesible, listas mal anidadas.
//
// Se comprueban las reglas WCAG 2.1 A y AA. Si alguna vez hay que tolerar algo, se desactiva esa
// regla **con el motivo escrito**, nunca la pantalla entera.

import { AxeBuilder } from '@axe-core/playwright';
import type { NodeResult, Result } from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conGoogle, conSesion, simularRpc, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Cada prueba pasa axe por varias pantallas; con cuatro workers y la máquina cargada, 30 s no
// siempre bastan (se vio en el ensayo de RV-27 con --repeat-each=3).
test.describe.configure({ timeout: 60_000 });

async function auditar(page: Page, contexto: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(REGLAS)
    // El contraste de los marcadores del mapa es de 06 §4.2 y se mide con su propia fórmula, en
    // los dos modos: axe solo ve el SVG suelto y no sabe qué hay detrás (DEC-072).
    .exclude('.leaflet-marker-pane')
    .analyze();
  // El resumen lleva el selector y el motivo exacto: una violación sin el nodo no se puede arreglar.
  const resumen = violations.flatMap((v: Result) =>
    v.nodes.map(
      (n: NodeResult) => `${v.id} · ${n.target.join(' ')} · ${(n.any[0]?.message ?? v.help).replace(/\s+/g, ' ')}`,
    ),
  );
  expect(resumen, `${contexto} · violaciones de axe`).toEqual([]);
}

test.describe('app del voluntario', () => {
  test('entrada, primer uso y aviso legal', async ({ page }) => {
    await simularRpc(page, { fn_registrar_error: null });
    await page.goto('/');
    await expect(page.getByLabel(T.entrada.nombre)).toBeVisible();
    await auditar(page, 'entrada');
  });

  test('mapa, lista y ficha', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null, fn_ficha_punto: PUNTOS[0] });
    await page.goto('/');
    await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
    await auditar(page, 'mapa');

    await page.getByRole('link', { name: T.navegacion.lista }).click();
    await expect(page.getByPlaceholder(T.mapa.buscar)).toBeVisible();
    await auditar(page, 'lista');
  });

  test('formulario de alta, que es el que más campos tiene', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await page.goto('/proponer/alta');
    await expect(page.getByTestId('selector-pin')).toBeVisible();
    await auditar(page, 'alta');
  });

  test('mis propuestas y ajustes', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null });
    await page.goto('/mis-propuestas');
    await auditar(page, 'mis propuestas');
    await page.goto('/ajustes');
    await auditar(page, 'ajustes');
  });
});

test.describe('panel de jefatura', () => {
  // El panel es de escritorio (FR-100).
  test.skip(({ isMobile }) => !!isMobile, 'el panel se audita en escritorio');

  test('cola de revisión e inventario', async ({ page }) => {
    await conGoogle(page, 'jefa@example.org');
    await simularTablas(page, { v_puntos_activos: PUNTOS, v_cola_revision: [], propuestas: [] });
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
      r.fulfill({ contentType: 'application/json', body: 'true' }),
    );
    await page.goto('/admin/cola');
    await expect(page.getByRole('region', { name: T.panelCola.colaRevision })).toBeVisible();
    await auditar(page, 'panel · cola');

    await page.goto('/admin/inventario');
    await expect(page.getByRole('table')).toBeVisible();
    await auditar(page, 'panel · inventario');
  });
});
