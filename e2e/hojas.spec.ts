// docs/32 RV-237: las hojas de abajo de la app son ventanas de verdad. El foco entra al abrir, con Tab
// no sale de la hoja, lo de detrás queda `inert` y al cerrar el foco vuelve a donde estaba.

import { expect, test } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO } from './puntos.ts';

test.describe('hojas de abajo (RV-237)', () => {
  test('cerrar sesión: el foco entra, se queda dentro y vuelve al cerrar', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null });
    await page.goto('/ajustes');
    const abrir = page.getByRole('button', { name: T.ajustes.cerrarSesion });
    await abrir.click();
    const hoja = page.getByRole('dialog', { name: T.ajustes.confirmarCerrar });
    await expect(hoja).toBeVisible();

    // El foco entra en la hoja.
    await expect
      .poll(() => hoja.evaluate((h) => h.contains(document.activeElement)), { message: 'foco dentro al abrir' })
      .toBe(true);

    // Lo de detrás no se puede tocar ni leer: la navegación de abajo queda inert.
    await expect(page.locator('#raiz')).toHaveAttribute('inert', '');

    // Con Tab (y con Mayús+Tab) el foco no llega a la página de detrás. Fuera de la hoja solo puede
    // estar "en ninguna parte" (<body>: la barra del navegador, al dar la vuelta).
    for (const tecla of ['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(tecla);
      const sitio = await hoja.evaluate((h) =>
        h.contains(document.activeElement) ? 'hoja' : document.activeElement === document.body ? 'body' : 'detras',
      );
      expect(sitio, `foco tras ${tecla}`).not.toBe('detras');
    }

    // Al cerrar (Escape), el resto deja de ser inert y el foco vuelve al botón que la abrió.
    await page.keyboard.press('Escape');
    await expect(hoja).toHaveCount(0);
    await expect(page.locator('#raiz')).not.toHaveAttribute('inert', '');
    await expect(abrir).toBeFocused();
  });

  test('con Cancelar el foco también vuelve', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null });
    await page.goto('/ajustes');
    const abrir = page.getByRole('button', { name: T.ajustes.cerrarSesion });
    await abrir.click();
    await page.getByRole('dialog').getByRole('button', { name: T.ajustes.cancelar }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(abrir).toBeFocused();
  });
});
