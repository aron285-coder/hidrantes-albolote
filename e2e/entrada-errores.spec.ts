// docs/32 RV-242: al entrar, cada error del servidor tiene su mensaje. Uno que la app no conoce dice
// su código y no "Sin conexión", que mandaba a buscar cobertura cuando el servidor sí había contestado.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { FIRMA } from './ayudas.ts';

async function entrar(page: Page) {
  await page.getByLabel(T.entrada.cifra(1)).fill('4');
  await page.keyboard.type('82915');
  await page.getByLabel(T.entrada.nombre).fill(FIRMA.nombre);
  await page.getByLabel(T.entrada.apellido).fill(FIRMA.apellido);
  await page.getByRole('button', { name: T.entrada.entrar, exact: true }).click();
}

const responder = (page: Page, status: number, error: string) =>
  page.route('**/api/verificar-codigo', (r) =>
    r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error }) }),
  );

test.describe('entrar: un mensaje por error (RV-242)', () => {
  for (const [status, codigo, texto] of [
    [409, 'DISPOSITIVO_RESERVADO', T.entrada.dispositivoReservado],
    [429, 'CUOTA_CANJES_AGOTADA', T.entrada.cuota],
    [401, 'TOKEN_REVOCADO', T.entrada.tokenNoVale],
    [400, 'ALGO_NUEVO', T.entrada.errorDesconocido('ALGO_NUEVO')],
  ] as const) {
    test(`${codigo}: «${texto}»`, async ({ page }) => {
      await responder(page, status, codigo);
      await page.goto('/');
      await entrar(page);
      await expect(page.getByRole('alert')).toHaveText(texto);
    });
  }

  test('demasiados intentos dice a qué hora se puede volver a intentar', async ({ page }) => {
    await responder(page, 429, 'DEMASIADOS_INTENTOS');
    await page.goto('/');
    await entrar(page);
    await expect(page.getByRole('alert')).toHaveText(
      /^Demasiados intentos\. Podrás volver a intentarlo a las \d\d:\d\d\.$/,
    );
  });
});
