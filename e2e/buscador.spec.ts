// docs/33 RV-312 (U3, D5): el buscador del mapa con un solo ✕ (con texto borra; vacío, cierra), las
// direcciones primero si lo escrito lleva un número, y un fondo opaco también en oscuro.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO } from './puntos.ts';

const esOrdenador = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1100;

async function abrir(page: Page) {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.locator('.marcador').first()).toBeVisible();
}

// En el móvil, el buscador flotante del mapa; en ordenador, el de la lista de al lado.
const buscador = (page: Page) => page.getByRole('searchbox', { name: T.mapa.buscar }).first();

test.describe('buscador del mapa (móvil)', () => {
  test.beforeEach(({ page }) => {
    test.skip(esOrdenador(page), 'en ordenador el buscador va en la lista de al lado');
  });

  test('un solo ✕: el del navegador no se pinta', async ({ page }) => {
    await abrir(page);
    await buscador(page).fill('real');
    // Un campo `type="search"` lleva el ✕ del navegador (Chrome, Safari) además del nuestro: el campo
    // es de texto con el papel de búsqueda. El ✕ nativo no sale en el árbol de accesibilidad: lo que
    // lo evita es el tipo del campo.
    await expect(buscador(page)).toHaveAttribute('type', 'text');
    await expect(buscador(page)).toHaveAttribute('inputmode', 'search');
  });

  test('con texto, el ✕ borra; vacío, cierra la búsqueda (con el dedo)', async ({ page }) => {
    await abrir(page);
    await buscador(page).fill('real');
    await page.getByRole('button', { name: T.mapa.borrarBusqueda }).tap();
    await expect(buscador(page)).toHaveValue('');
    await expect(buscador(page)).toBeFocused();
    // Vacío y con el foco, el mismo ✕ cierra (quita el foco y el teclado).
    const cerrar = page.getByRole('button', { name: T.mapa.cerrarBusqueda });
    await expect(cerrar).toBeVisible();
    await cerrar.tap();
    await expect(buscador(page)).not.toBeFocused();
    await page.waitForTimeout(100);
    await expect(buscador(page)).not.toBeFocused();
    await expect(cerrar).toHaveCount(0);
    await expect(page.getByRole('button', { name: T.mapa.borrarBusqueda })).toHaveCount(0);
  });

  test('con el teclado: Tab llega al ✕; Escape borra y, vacío, cierra; Intro cierra el teclado', async ({ page }) => {
    await abrir(page);
    await buscador(page).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: T.mapa.cerrarBusqueda })).toBeFocused();
    await buscador(page).fill('real');
    await page.keyboard.press('Escape');
    await expect(buscador(page)).toHaveValue('');
    await expect(buscador(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(buscador(page)).not.toBeFocused();
    await buscador(page).fill('real');
    await page.keyboard.press('Enter');
    await expect(buscador(page)).not.toBeFocused();
    await expect(buscador(page)).toHaveValue('real');
  });

  test('con un número, el portal sale antes que las calles', async ({ page }) => {
    await abrir(page);
    await page.route('**/api/geocodificar', (r) =>
      r.fulfill({
        json: {
          resultados: [{ etiqueta: 'Calle Real, 10, Albolote', tipo: 'portal', lat: 37.2319, lng: -3.6575 }],
          fuente: 'CartoCiudad (IGN/CNIG)',
        },
      }),
    );
    await buscador(page).fill('Calle Real 10');
    const portal = page.getByRole('button', { name: 'Calle Real, 10, Albolote' });
    const calles = page.getByRole('group', { name: T.busqueda.calles });
    await expect(portal).toBeVisible();
    await expect(calles).toBeVisible();
    expect((await portal.boundingBox())!.y).toBeLessThan((await calles.boundingBox())!.y);
  });

  test('en oscuro, el campo es opaco: no se leen los nombres del mapa a través (D5)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await abrir(page);
    const fondo = await buscador(page).evaluate((i) => getComputedStyle(i.closest('label')!).backgroundColor);
    // Opaco: «rgb(…)» sin alfa (con transparencia sería «rgba(…, 0.94)»).
    expect(fondo).toMatch(/^rgb\(/);
  });
});

test('en la lista, el mismo campo: sin el ✕ del navegador y Escape borra', async ({ page }) => {
  await abrir(page);
  if (!esOrdenador(page)) await page.getByRole('link', { name: T.navegacion.lista }).click();
  const campo = page.locator('#buscar-lista');
  await expect(campo).toHaveAttribute('type', 'text');
  await campo.fill('real');
  await page.getByRole('button', { name: T.mapa.borrarBusqueda }).click();
  await expect(campo).toHaveValue('');
  await expect(campo).toBeFocused();
  await campo.fill('real');
  await page.keyboard.press('Escape');
  await expect(campo).toHaveValue('');
});
