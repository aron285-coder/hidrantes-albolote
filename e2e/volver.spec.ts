// docs/35 RV-420: una pantalla abierta la primera del historial (por enlace directo o desde una
// notificación) no tiene a dónde volver: ‹ lleva al inicio en vez de no hacer nada (UI-01).

import { expect, test } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO } from './puntos.ts';

test.describe('‹ en la primera pantalla del historial (RV-420)', () => {
  test.beforeEach(async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, {
      fn_listar_puntos: LISTADO,
      fn_mis_propuestas: [],
      fn_registrar_error: null,
    });
  });

  test('Mis propuestas abierta directamente: ‹ lleva al mapa', async ({ page }) => {
    await page.goto('/mis-propuestas');
    await expect(page.getByRole('heading', { level: 1, name: T.navegacion.misPropuestas })).toBeVisible();
    await page.getByRole('button', { name: T.entrada.volver }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('el aviso legal abierto directamente: ‹ lleva al inicio', async ({ page }) => {
    await page.goto('/legal');
    await expect(page.getByRole('heading', { level: 1, name: T.entrada.avisoLegalTitulo })).toBeVisible();
    await page.getByRole('button', { name: T.entrada.volver }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('con historial, ‹ sigue volviendo a la pantalla anterior', async ({ page }) => {
    await page.goto('/ajustes');
    await page.locator('a[href="/legal"]').click();
    await expect(page.getByRole('heading', { level: 1, name: T.entrada.avisoLegalTitulo })).toBeVisible();
    await page.getByRole('button', { name: T.entrada.volver }).click();
    await expect(page).toHaveURL(/\/ajustes$/);
  });
});
