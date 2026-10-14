// docs/36 RV-470: el código que entra de golpe en una casilla, sin evento de pegar (el portapapeles del
// teclado, la sugerencia del sistema), llena las seis casillas; no se queda en una cifra.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { FIRMA } from './ayudas.ts';

const casilla = (page: Page, n: number) => page.getByLabel(T.entrada.cifra(n));

async function seisLlenas(page: Page, cifras: string) {
  for (let n = 1; n <= 6; n++) await expect(casilla(page, n)).toHaveValue(cifras[n - 1]);
}

/** Pegar con el menú: un evento `paste` con el texto en el portapapeles. */
async function pegar(page: Page, n: number, texto: string) {
  await casilla(page, n).evaluate((el, t) => {
    const datos = new DataTransfer();
    datos.setData('text', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: datos, bubbles: true, cancelable: true }));
  }, texto);
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
    await casilla(page, 1).fill('4');
    await page.keyboard.type('8');
    await expect(casilla(page, 3)).toBeFocused();
    await page.keyboard.insertText('2915');
    await seisLlenas(page, '482915');
  });

  test('un código entero insertado en la tercera va desde la primera', async ({ page }) => {
    await page.goto('/');
    await casilla(page, 1).fill('1');
    await page.keyboard.type('2');
    await page.keyboard.insertText('482915');
    await seisLlenas(page, '482915');
  });

  for (const [tecla, cuando] of [
    ['End', 'detrás'],
    ['Home', 'delante'],
  ] as const) {
    test(`insertText ${cuando} de una cifra ya escrita no la cuenta, aunque el código empiece igual`, async ({
      page,
    }) => {
      await page.goto('/');
      await casilla(page, 1).fill('4');
      await casilla(page, 1).focus();
      await page.keyboard.press(tecla);
      await page.keyboard.insertText('482 915');
      await seisLlenas(page, '482915');
    });
  }

  test('pegar desde el menú en la primera y en la cuarta', async ({ page }) => {
    await page.goto('/');
    await pegar(page, 1, '482915');
    await seisLlenas(page, '482915');
    await page.reload();
    await casilla(page, 1).fill('4');
    await page.keyboard.type('82');
    await pegar(page, 4, '915');
    await seisLlenas(page, '482915');
  });

  test('con el nombre ya escrito, el foco pasa al apellido; con los dos, a Entrar', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(T.entrada.nombre).fill(FIRMA.nombre);
    await casilla(page, 1).fill('482915');
    await expect(page.getByLabel(T.entrada.apellido)).toBeFocused();
    await page.getByLabel(T.entrada.apellido).fill(FIRMA.apellido);
    await casilla(page, 1).fill('');
    await casilla(page, 1).fill('482915');
    await expect(page.getByRole('button', { name: T.entrada.entrar, exact: true })).toBeFocused();
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
