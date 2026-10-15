// docs/38 RV-503 (UI-18, DEC-213): por debajo de 768 px las pestañas del panel van en el menú ☰, la cabecera dice
// la pestaña y la búsqueda es una lupa; desde 768, las cinco arriba en una fila. Todos los datos son simulados.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conGoogle, simularRpc, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

test.describe.configure({ timeout: 60_000 });
const CARGA = 15_000;

/** Seis propuestas pendientes y dos puntos en la papelera: los números de las pestañas. */
async function preparar(page: Page) {
  await conGoogle(page, 'jefatura@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: [],
    v_registro: [],
    propuestas: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}` })),
    puntos: [{ id: 'b1' }, { id: 'b2' }],
    config: [],
    administradores: [
      { email: 'jefatura@example.org', activo: true, creado_en: '2026-08-01T10:00:00Z', creado_por: 'migracion' },
    ],
    dispositivos: [],
    nucleos: [],
  });
  await simularRpc(page, { fn_es_admin: true, fn_salud: {}, fn_registrar_error: null });
}

const menu = (page: Page) => page.getByRole('button', { name: /^Menú/ });
const navegacion = (page: Page) => page.getByRole('navigation', { name: T.jefatura.panel });
const titulo = (page: Page) => page.getByRole('heading', { level: 1 });

test.describe('a 412 px (móvil)', () => {
  test.skip(({ isMobile }) => !isMobile, 'un móvil');

  test('no hay fila de pestañas; ☰ las lleva con sus números y elegir una navega y cierra el menú', async ({
    page,
  }) => {
    await preparar(page);
    await page.goto('/admin/cola');
    await expect(titulo(page)).toHaveText(`${T.jefatura.panel} · ${T.panelCola.colaRevision}`, { timeout: CARGA });
    await expect(navegacion(page)).toHaveCount(0);
    await menu(page).click();
    const enlaces = navegacion(page).getByRole('link');
    await expect(enlaces).toHaveCount(5);
    await expect(enlaces.filter({ hasText: T.panelCola.colaRevision })).toContainText('6');
    await expect(enlaces.filter({ hasText: T.panelCola.papelera })).toContainText('2');
    // Al abrir, el foco va a la pestaña activa.
    await expect(enlaces.filter({ hasText: T.panelCola.colaRevision })).toBeFocused();
    await expect(enlaces.filter({ hasText: T.panelCola.colaRevision })).toHaveAttribute('aria-current', 'page');
    await enlaces.filter({ hasText: T.panelCola.inventario }).click();
    await expect(page).toHaveURL(/\/admin\/inventario$/);
    await expect(navegacion(page)).toHaveCount(0);
    // El enlace elegido desaparece con el menú: el foco vuelve a ☰.
    await expect(menu(page)).toBeFocused();
    await expect(titulo(page)).toHaveText(`${T.jefatura.panel} · ${T.panelCola.inventario}`);
  });

  test('desde otra pestaña, con pendientes, ☰ avisa con el punto naranja; en la Cola, no', async ({ page }) => {
    await preparar(page);
    await page.goto('/admin/inventario');
    await expect(page.getByRole('button', { name: T.panel.menuPendientes })).toBeVisible({ timeout: CARGA });
    await expect(page.getByTestId('aviso-pendientes')).toBeVisible();
    await page.goto('/admin/cola');
    await expect(page.getByRole('button', { name: T.panel.menu, exact: true })).toBeVisible({ timeout: CARGA });
    await expect(page.getByTestId('aviso-pendientes')).toHaveCount(0);
  });

  test('la lupa abre la búsqueda con el foco; ✕ la borra, la cierra y devuelve el foco a la lupa', async ({ page }) => {
    await preparar(page);
    await page.goto('/admin/inventario');
    const campo = page.getByPlaceholder(T.panelCola.buscar);
    await expect(campo).toHaveCount(0, { timeout: CARGA });
    await page.getByRole('button', { name: T.panel.buscar, exact: true }).click();
    await expect(campo).toBeFocused();
    // El h1 sigue en la página para el lector.
    await expect(titulo(page)).toHaveCount(1);
    await campo.fill(PUNTOS[0]!.codigo);
    await expect(page.getByText(PUNTOS[1]!.codigo, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: T.panel.cerrarBusqueda }).click();
    await expect(campo).toHaveCount(0);
    await expect(page.getByRole('button', { name: T.panel.buscar, exact: true })).toBeFocused();
  });

  test('con algo escrito, cambiar de pestaña deja la búsqueda abierta', async ({ page }) => {
    await preparar(page);
    await page.goto('/admin/inventario');
    await page.getByRole('button', { name: T.panel.buscar, exact: true }).click({ timeout: CARGA });
    await page.getByPlaceholder(T.panelCola.buscar).fill('HID');
    await menu(page).click();
    await navegacion(page).getByRole('link').filter({ hasText: T.panelCola.registro }).click();
    await expect(page).toHaveURL(/\/admin\/registro$/);
    await expect(page.getByPlaceholder(T.panelCola.buscar)).toHaveValue('HID');
  });

  test('Esc, tocar fuera y Tab fuera cierran ☰', async ({ page }) => {
    await preparar(page);
    await page.goto('/admin/cola');
    await expect(titulo(page)).toBeVisible({ timeout: CARGA });
    await menu(page).click();
    await expect(navegacion(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(navegacion(page)).toHaveCount(0);
    await expect(menu(page)).toBeFocused();

    await menu(page).click();
    await page.mouse.click(10, 600);
    await expect(navegacion(page)).toHaveCount(0);

    await menu(page).click();
    // Desde «Cerrar sesión», el último, Tab sale del menú.
    await page.getByRole('button', { name: T.panel.salir }).focus();
    await page.keyboard.press('Tab');
    await expect(navegacion(page)).toHaveCount(0);
  });
});

test.describe('desde 768 px', () => {
  test.skip(({ isMobile }) => isMobile, 'una ventana de escritorio');

  for (const ancho of [768, 820, 1280]) {
    test(`a ${ancho} px, las cinco pestañas a la vista en una fila, sin desplazamiento a lo ancho`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await preparar(page);
      await page.goto('/admin/cola');
      const enlaces = navegacion(page).getByRole('link');
      await expect(enlaces).toHaveCount(5, { timeout: CARGA });
      const ys = new Set<number>();
      for (const e of await enlaces.all()) {
        await expect(e).toBeVisible();
        ys.add(Math.round((await e.boundingBox())!.y));
      }
      expect([...ys]).toHaveLength(1);
      const sobra = await page.evaluate(() => {
        const d = document.scrollingElement!;
        return d.scrollWidth - d.clientWidth;
      });
      expect(sobra).toBeLessThanOrEqual(0);
      // La última pestaña cabe entera en la pantalla.
      const ultima = (await enlaces.last().boundingBox())!;
      expect(ultima.x + ultima.width).toBeLessThanOrEqual(ancho);
    });
  }
});
