// docs/39 RV-520 (DEC-221): si jefatura revoca el acceso de los móviles mientras alguien rellena un alta, el
// formulario no se pierde: lo dice, deja guardar en el móvil, salta a la entrada al salir y, al volver a entrar, el
// alta se envía. Servidor simulado (nunca uno de verdad).

import { expect, test, type Page, type Route } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion } from './ayudas.ts';
import { LISTADO } from './puntos.ts';

const SB = 'https://supabase.invalid';
const REVOCADO = { code: 'P0001', message: 'TOKEN_REVOCADO: El acceso de este móvil se ha revocado' };

async function servidor(page: Page) {
  const s = { revocado: false, propuestas: [] as Record<string, unknown>[], subidas: 0 };
  const json = (r: Route, b: unknown, status = 200) =>
    r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route('**/api/url-subida', (r) =>
    // Con el acceso revocado, la reserva de la foto tampoco sale: lo guardado espera en el móvil.
    s.revocado
      ? r.abort('connectionrefused')
      : json(r, { foto_path: `fotos/${++s.subidas}.jpg`, url: `${SB}/storage/subir` }),
  );
  await page.route(`${SB}/storage/subir`, (r) => r.fulfill({ status: 200, body: '{}' }));
  await page.route('**/api/push', (r) => json(r, { enviadas: 0 }));
  await page.route(`${SB}/rest/v1/rpc/*`, (r) => {
    const nombre = new URL(r.request().url()).pathname.split('/').pop();
    const cuerpo = r.request().postDataJSON() ?? {};
    if (s.revocado && (nombre === 'fn_listar_puntos' || nombre === 'fn_proponer')) return json(r, REVOCADO, 400);
    if (nombre === 'fn_listar_puntos') return json(r, LISTADO);
    if (nombre === 'fn_proponer') {
      if (!s.propuestas.some((p) => p.clave_local === cuerpo.clave_local)) s.propuestas.push(cuerpo);
      return json(r, { propuesta_id: cuerpo.clave_local, estado: 'pendiente', aplicada: false, codigo: null });
    }
    if (nombre === 'fn_mis_propuestas') return json(r, []);
    return json(r, null);
  });
  return s;
}

async function foto(page: Page, testId: string) {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 900;
    c.getContext('2d')!.fillRect(0, 0, 1200, 900);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page.getByTestId(testId).setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(bytes) });
  await expect(page.getByTestId(`hueco-${testId}`).getByText(/\d+ kB/)).toBeVisible();
}

test('un alta a medias sobrevive a la revocación y se envía al volver a entrar', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(!isMobile, 'en el móvil');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2309, longitude: -3.6566, accuracy: 9 });
  await conSesion(page);
  const s = await servidor(page);
  await page.goto('/proponer/alta');
  await page.getByRole('radio', { name: T.formulario.bocaRiego }).click();
  await page.getByRole('radio', { name: T.formulario.d45 }).click();
  await page.getByRole('radio', { name: T.formulario.granada }).click();
  await page.getByRole('radio', { name: T.formulario.bueno }).click();
  await foto(page, 'entrada-foto');
  await foto(page, 'entrada-foto-sitio');

  // Jefatura revoca el móvil; la siguiente comprobación (al volver la conexión) recibe TOKEN_REVOCADO.
  s.revocado = true;
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(page.getByRole('alert').filter({ hasText: T.envio.accesoCaducadoFormulario })).toBeVisible({
    timeout: 15_000,
  });
  // Lo escrito sigue ahí, y no se ha ido a la entrada.
  await expect(page.getByRole('radio', { name: T.formulario.bocaRiego })).toBeChecked();
  await expect(page.getByTestId('hueco-entrada-foto').getByText(/\d+ kB/)).toBeVisible();
  await expect(page.getByText(T.entrada.accesoCaducado)).toHaveCount(0);

  // Guardar en el móvil: la pantalla de resultado lo dice.
  await page.getByRole('button', { name: T.envio.guardarEnMovil, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: T.envio.guardadoEnMovil })).toBeVisible();
  await expect(page.getByText(T.envio.guardadoHastaEntrar)).toBeVisible();
  expect(s.propuestas).toHaveLength(0);

  // Al salir, la entrada.
  await page.getByRole('button', { name: T.envio.volverAlMapa }).click();
  await expect(page.getByText(T.entrada.accesoCaducado)).toBeVisible();

  // Volver a entrar (simulado: un token nuevo en el móvil) envía lo guardado.
  s.revocado = false;
  await page.evaluate(() => localStorage.setItem('hidrantes.token', JSON.stringify('b'.repeat(43))));
  await page.goto('/');
  await expect.poll(() => s.propuestas.length, { timeout: 20_000 }).toBe(1);
  expect(s.propuestas[0].operacion).toBe('alta');
});
