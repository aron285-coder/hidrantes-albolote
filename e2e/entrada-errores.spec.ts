// docs/32 RV-242: al entrar, cada error del servidor tiene su mensaje. Uno que la app no conoce dice
// su código y no "Sin conexión", que mandaba a buscar cobertura cuando el servidor sí había contestado.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { FIRMA, simularRpc } from './ayudas.ts';

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

// docs/37 RV-491 (DEC-211): con «mucha gente entrando a la vez», la app espera lo que dice el servidor
// más un poco al azar (aquí, sin azar) y lo intenta sola, como mucho tres veces seguidas.
test.describe('entrar con mucha gente entrando: reintento solo (RV-491)', () => {
  const ocupado = (segundos: number) => ({
    status: 503,
    contentType: 'application/json',
    headers: { 'Retry-After': String(segundos) },
    body: JSON.stringify({ error: 'OCUPADO', reintentar_en_s: segundos }),
  });

  test.beforeEach(async ({ page }) => {
    // Sin azar: la espera es exactamente reintentar_en_s.
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
  });

  test('OCUPADO y después bien: entra sin pulsar nada', async ({ page }) => {
    let llamadas = 0;
    await page.route('**/api/verificar-codigo', (r) => {
      llamadas++;
      return r.fulfill(
        llamadas === 1
          ? ocupado(1)
          : {
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ token: 'r'.repeat(32), caduca_en: '2027-09-19T00:00:00Z' }),
            },
      );
    });
    await simularRpc(page, { fn_listar_puntos: { puntos: [], bajas: [] } });
    await page.goto('/');
    await entrar(page);
    await expect(page.getByText(T.entrada.ocupadoReintento(1))).toBeVisible();
    await expect(page.getByRole('heading', { name: T.bienvenida.pantallas[0]!.titulo })).toBeVisible();
    expect(llamadas).toBe(2);
  });

  test('tres reintentos con OCUPADO: el texto de siempre y Entrar a mano', async ({ page }) => {
    let llamadas = 0;
    await page.route('**/api/verificar-codigo', (r) => {
      llamadas++;
      return r.fulfill(ocupado(1));
    });
    await page.goto('/');
    await entrar(page);
    await expect(page.getByRole('alert')).toHaveText(T.entrada.ocupado, { timeout: 15_000 });
    // El intento a mano y tres solos.
    expect(llamadas).toBe(4);
    await expect(page.getByRole('button', { name: T.entrada.cancelarReintento })).toBeHidden();
    const boton = page.getByRole('button', { name: T.entrada.entrar, exact: true });
    await expect(boton).toBeEnabled();
    await boton.click();
    await expect.poll(() => llamadas).toBe(5);
  });

  test('Cancelar para la espera', async ({ page }) => {
    let llamadas = 0;
    await page.route('**/api/verificar-codigo', (r) => {
      llamadas++;
      return r.fulfill(ocupado(2));
    });
    await page.goto('/');
    await entrar(page);
    const espera = page.getByText(/Lo vuelvo a intentar en \d+ s/);
    await expect(espera).toBeVisible();
    // Lo que oye un lector de pantalla: una vez, sin la cuenta atrás.
    await expect(page.getByRole('status').filter({ hasText: T.entrada.ocupadoReintentoAnuncio })).toBeAttached();
    await expect(page.getByRole('button', { name: T.entrada.entrar, exact: true })).toBeDisabled();
    await page.getByRole('button', { name: T.entrada.cancelarReintento }).click();
    await expect(espera).toBeHidden();
    await expect(page.getByRole('button', { name: T.entrada.entrar, exact: true })).toBeEnabled();
    await page.waitForTimeout(3_000);
    expect(llamadas).toBe(1);
  });

  test('cambiar el nombre cancela la espera', async ({ page }) => {
    let llamadas = 0;
    await page.route('**/api/verificar-codigo', (r) => {
      llamadas++;
      return r.fulfill(ocupado(2));
    });
    await page.goto('/');
    await entrar(page);
    const espera = page.getByText(/Lo vuelvo a intentar en \d+ s/);
    await expect(espera).toBeVisible();
    await page.getByLabel(T.entrada.nombre).fill(`${FIRMA.nombre}a`);
    await expect(espera).toBeHidden();
    await page.waitForTimeout(3_000);
    expect(llamadas).toBe(1);
  });
});
