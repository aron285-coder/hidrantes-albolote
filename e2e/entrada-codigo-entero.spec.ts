// docs/36 RV-470: el código que entra de golpe en una casilla, sin evento de pegar (el portapapeles del
// teclado, la sugerencia del sistema), llena las seis casillas; no se queda en una cifra.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';

const casilla = (page: Page, n: number) => page.getByLabel(T.entrada.cifra(n));

async function seisLlenas(page: Page, cifras: string) {
  for (let n = 1; n <= 6; n++) await expect(casilla(page, n)).toHaveValue(cifras[n - 1]);
}

test.describe('el código entra entero (RV-470)', () => {
  test('fill en la primera casilla llena las seis y el foco pasa al nombre', async ({ page }) => {
    await page.goto('/');
    await casilla(page, 1).fill('482915');
    await seisLlenas(page, '482915');
    await expect(page.getByLabel(T.entrada.nombre)).toBeFocused();
  });

  test('insertText en la primera casilla llena las seis', async ({ page }) => {
    await page.goto('/');
    await casilla(page, 1).focus();
    await page.keyboard.insertText('482915');
    await seisLlenas(page, '482915');
  });

  test('insertText en la tercera reparte hasta la sexta', async ({ page }) => {
    await page.goto('/');
    await casilla(page, 1).fill('1');
    await page.keyboard.type('2');
    await expect(casilla(page, 3)).toBeFocused();
    await page.keyboard.insertText('482915');
    await seisLlenas(page, '124829');
  });

  test('insertText detrás de una cifra ya escrita no la cuenta dos veces', async ({ page }) => {
    await page.goto('/');
    await casilla(page, 1).fill('4');
    await casilla(page, 1).focus();
    await page.keyboard.press('End');
    await page.keyboard.insertText('482915');
    await seisLlenas(page, '482915');
  });

  test('cifra a cifra sigue igual, y borrar vuelve a la casilla anterior', async ({ page }) => {
    await page.goto('/');
    await casilla(page, 1).fill('4');
    await page.keyboard.type('82915');
    await seisLlenas(page, '482915');
    await expect(casilla(page, 6)).toBeFocused();
    await page.keyboard.press('Backspace');
    await expect(casilla(page, 6)).toHaveValue('');
    await page.keyboard.press('Backspace');
    await expect(casilla(page, 5)).toBeFocused();
  });
});
