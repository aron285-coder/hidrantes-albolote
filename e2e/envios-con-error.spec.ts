// docs/39 RV-521 (DEC-221): un envío que falla para siempre se ve en rojo («1 con error») con un aviso que lleva a
// Mis propuestas, donde se puede reintentar o descartar. Jefatura, que también usa la cola («Aplicar ahora»), llega a
// su parte de la cola desde la pastilla. Servidor simulado.

import { expect, test, type Page, type Route } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conGoogle, conSesion, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

test.skip(({ isMobile }) => !isMobile, 'en el móvil');

const SB = 'https://supabase.invalid';
const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

/** fn_proponer contesta siempre PUNTO_NO_ACTIVO: un error que no se arregla reintentando sola. */
async function servidor(page: Page, jefatura = false) {
  await page.route('**/api/url-subida', (r) => json(r, { foto_path: 'fotos/1.jpg', url: `${SB}/storage/subir` }));
  await page.route(`${SB}/storage/subir`, (r) => r.fulfill({ status: 200, body: '{}' }));
  await page.route('**/api/push', (r) => json(r, { enviadas: 0 }));
  await page.route(`${SB}/rest/v1/rpc/*`, (r) => {
    const nombre = new URL(r.request().url()).pathname.split('/').pop();
    if (nombre === 'fn_es_admin') return json(r, jefatura);
    if (nombre === 'fn_listar_puntos') return json(r, LISTADO);
    if (nombre === 'fn_proponer')
      return json(r, { code: 'P0001', message: 'PUNTO_NO_ACTIVO: El punto ya no está activo' }, 400);
    if (nombre === 'fn_mis_propuestas') return json(r, []);
    return json(r, null);
  });
}

async function revisionQueFalla(page: Page, boton: string) {
  const hid = PUNTOS[0];
  await page.goto(`/?p=${hid.id}`);
  await page.getByRole('button', { name: T.ficha.proponerCambio }).click();
  await page.getByRole('button', { name: new RegExp(`^${T.operaciones.sigueIgual}`) }).click();
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 600;
    c.getContext('2d')!.fillRect(0, 0, 800, 600);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page
    .getByTestId('entrada-foto')
    .setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(bytes) });
  await expect(page.getByTestId('hueco-entrada-foto').getByText(/\d+ kB/)).toBeVisible();
  await page.getByRole('button', { name: boton, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: T.envio.noEnviado })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: T.envio.volverAlMapa }).click();
}

test('voluntario: una revisión que falla sale en rojo y lleva a Mis propuestas con Reintentar y Descartar', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2309, longitude: -3.6566, accuracy: 9 });
  await conSesion(page);
  await servidor(page);
  await revisionQueFalla(page, T.envio.enviarRevision);

  const pastilla = page.getByRole('link', { name: T.mapa.envios(1, 0), exact: true });
  await expect(pastilla).toBeVisible();
  await expect(pastilla.locator('span')).toHaveClass(/bg-tinte-rojo/);
  await expect(page.getByRole('link', { name: T.mapa.avisoConError(1) })).toBeVisible();
  await pastilla.click();
  await expect(page).toHaveURL(/\/mis-propuestas$/);
  await expect(page.getByRole('button', { name: T.misPropuestas.reintentar })).toBeVisible();
  await expect(page.getByRole('button', { name: T.misPropuestas.descartar })).toBeVisible();
});

test('jefatura en el móvil: un «Aplicar ahora» con error lleva a su cola, que deja descartarlo', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2309, longitude: -3.6566, accuracy: 9 });
  await conGoogle(page, 'jefa@example.org');
  await simularTablas(page, { v_puntos_activos: PUNTOS, v_cola_revision: [], propuestas: [], puntos: [] });
  await servidor(page, true);
  await revisionQueFalla(page, T.envio.aplicarAhora);

  await page.getByRole('link', { name: T.mapa.envios(1, 0), exact: true }).click();
  await expect(page).toHaveURL(/\/mis-propuestas$/);
  await page.getByRole('button', { name: T.misPropuestas.descartar }).click();
  await page.getByRole('dialog').getByRole('button', { name: T.misPropuestas.descartar }).click();
  await expect(page.getByText(T.misPropuestas.vacioJefatura)).toBeVisible();
});
