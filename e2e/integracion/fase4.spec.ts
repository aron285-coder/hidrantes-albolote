// Integración de la Fase 4 contra la pila local real (INTEGRACION=1, ci-sql): `wrangler pages dev`
// en :8788 con el build local, Supabase local con migraciones y el seed de staging (código 000000).
// Comprueba el criterio de salida: entrar con el código y que un error provocado llegue a
// hidrantes.errores_cliente.

import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { T } from '../../src/lib/textos.ts';

const BD = process.env.BD_PRUEBAS ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres'; // detectar-secretos:permitir (Supabase local efímero)

function consulta(sql: string): string {
  return execFileSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', BD, '-c', sql], { encoding: 'utf8' }).trim();
}

test('entrar con el código del seed y registrar un error provocado', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(T.entrada.cifra(1)).fill('0');
  await page.keyboard.type('00000');
  await page.getByLabel(T.entrada.nombre).fill('Integración');
  await page.getByLabel(T.entrada.apellido).fill('Fase Cuatro');
  await page.getByRole('button', { name: T.entrada.entrar, exact: true }).click();

  await page.getByRole('button', { name: T.bienvenida.saltar }).click();
  await expect(page.getByTestId('mapa')).toBeVisible();
  // El token recién emitido vale para las RPC: no aparece el aviso de servidor.
  await page.reload();
  await expect(page.getByTestId('mapa')).toBeVisible();
  await expect(page.getByText(T.mapa.sinServidor, { exact: true })).toBeHidden();

  const dispositivo = await page.evaluate(() => JSON.parse(localStorage.getItem('hidrantes.dispositivo_id')!));
  expect(consulta(`select count(*) from hidrantes.dispositivos where dispositivo_id = '${dispositivo}'`)).toBe('1');

  await page.evaluate(() => localStorage.setItem('hidrantes.forzar_fallo', JSON.stringify('/lista')));
  await page.getByRole('link', { name: T.navegacion.lista }).click();
  await expect(page.getByRole('alert')).toContainText(T.fallo.titulo);

  await expect
    .poll(() =>
      consulta(
        `select count(*) from hidrantes.errores_cliente
          where dispositivo_id = '${dispositivo}' and mensaje = 'Fallo provocado en /lista' and ruta = '/lista'`,
      ),
    )
    .toBe('1');
  // La cola local queda vacía una vez enviado.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hidrantes.errores_pendientes') ?? '[]').length))
    .toBe(0);
});
