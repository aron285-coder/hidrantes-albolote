// Integración de la Fase 5 contra la pila local real (INTEGRACION=1, ci-sql): los puntos del seed
// llegan por fn_listar_puntos, se ven en la lista y la respuesta no trae autores ni historial (FR-66).

import { expect, test } from '@playwright/test';
import { T } from '../../src/lib/textos.ts';

/** Columnas de v_puntos_activos (05 §4): nada de autores, dispositivos ni registro. */
const PERMITIDAS = new Set([
  'id',
  'codigo',
  'tipo',
  'diametro_mm',
  'caudal',
  'racor',
  'descripcion_fallo',
  'descripcion',
  'direccion',
  'foto_path',
  'municipio',
  'nucleo',
  'fecha_ultima_revision',
  'actualizado_en',
  'lat',
  'lng',
  'radio_px',
  'revision_caducada',
]);

test('los puntos del seed llegan sin autores y se ven en la lista', async ({ page }) => {
  const respuesta = page.waitForResponse((r) => r.url().includes('/rpc/fn_listar_puntos') && r.ok());
  await page.goto('/');
  await page.getByLabel(T.entrada.cifra(1)).fill('0');
  await page.keyboard.type('00000');
  await page.getByLabel(T.entrada.nombre).fill('Integración');
  await page.getByLabel(T.entrada.apellido).fill('Fase Cinco');
  await page.getByRole('button', { name: T.entrada.entrar, exact: true }).click();
  await page.getByRole('button', { name: T.bienvenida.saltar }).click();

  const cuerpo = await (await respuesta).json();
  expect(cuerpo.puntos.length).toBeGreaterThan(0);
  for (const p of cuerpo.puntos) {
    const sobrantes = Object.keys(p).filter((k) => !PERMITIDAS.has(k));
    expect(sobrantes, `${p.codigo} trae ${sobrantes.join(', ')}`).toEqual([]);
  }
  const texto = JSON.stringify(cuerpo);
  for (const prohibido of ['autor', 'dispositivo', 'registro', 'historial', 'Integración']) {
    expect(texto).not.toContain(prohibido);
  }

  await expect(page.getByText(T.mapa.nPuntos(cuerpo.puntos.length))).toBeVisible();
  await page.getByRole('link', { name: T.navegacion.lista }).click();
  await expect(page.locator('button').filter({ hasText: 'HID-9001' }).first()).toBeVisible();
});
