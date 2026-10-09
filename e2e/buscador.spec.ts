// docs/33 RV-312 (U3, D5): el buscador del mapa con un solo ✕ (con texto borra; vacío, cierra), las
// direcciones primero si lo escrito lleva un número, y un fondo opaco también en oscuro.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO } from './puntos.ts';

test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1100, 'en ordenador el buscador va en la lista de al lado');

async function abrir(page: Page) {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.locator('.marcador').first()).toBeVisible();
}

const buscador = (page: Page) => page.getByRole('searchbox', { name: T.mapa.buscar });

test('un solo ✕: el del navegador no se pinta', async ({ page }) => {
  await abrir(page);
  await buscador(page).fill('real');
  // Un campo `type="search"` lleva el ✕ del navegador (Chrome, Safari) además del nuestro: el campo es
  // de texto con el papel de búsqueda.
  await expect(buscador(page)).toHaveAttribute('type', 'text');
  await expect(buscador(page)).toHaveAttribute('inputmode', 'search');
  await expect(page.getByRole('button', { name: T.mapa.borrarBusqueda })).toHaveCount(1);
});

test('con texto, el ✕ borra; vacío, cierra la búsqueda', async ({ page }) => {
  await abrir(page);
  await buscador(page).fill('real');
  await page.getByRole('button', { name: T.mapa.borrarBusqueda }).click();
  await expect(buscador(page)).toHaveValue('');
  await expect(buscador(page)).toBeFocused();
  // Vacío y con el foco, el mismo ✕ cierra (quita el foco y el teclado).
  const cerrar = page.getByRole('button', { name: T.mapa.cerrarBusqueda });
  await expect(cerrar).toBeVisible();
  await cerrar.click();
  await expect(buscador(page)).not.toBeFocused();
  await expect(cerrar).toHaveCount(0);
  await expect(page.getByRole('button', { name: T.mapa.borrarBusqueda })).toHaveCount(0);
});

test('con un número, «Direcciones» va antes que «Calles y lugares»', async ({ page }) => {
  await abrir(page);
  await buscador(page).fill('Calle Real 10');
  const direcciones = page.getByRole('group', { name: T.busqueda.direcciones });
  const calles = page.getByRole('group', { name: T.busqueda.calles });
  await expect(direcciones).toBeVisible();
  await expect(calles).toBeVisible();
  const [d, c] = [(await direcciones.boundingBox())!, (await calles.boundingBox())!];
  expect(d.y).toBeLessThan(c.y);
});

test('en oscuro, el campo es opaco: no se leen los nombres del mapa a través (D5)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await abrir(page);
  const fondo = await buscador(page).evaluate((i) => getComputedStyle(i.closest('label')!).backgroundColor);
  const alfa = /rgba\([^)]*,\s*([\d.]+)\)/.exec(fondo)?.[1];
  expect(alfa === undefined ? 1 : Number(alfa), fondo).toBe(1);
});
