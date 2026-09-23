// Botón propio para instalar la app y "Mi posición" en el mapa del formulario (DEC-064).

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO } from './puntos.ts';

/** El navegador ofrece instalar (lo que hace Chrome cuando la app cumple los requisitos). */
async function ofrecerInstalacion(page: Page) {
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: unknown };
    e.prompt = async () => {
      (window as unknown as { instalacionPedida: boolean }).instalacionPedida = true;
    };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2309, longitude: -3.6566, accuracy: 8 });
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_mis_propuestas: [], fn_registrar_error: null });
});

test('la app ofrece su propio botón de instalar y lo quita al instalarla', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(T.instalar.aviso)).toHaveCount(0);
  await ofrecerInstalacion(page);
  await expect(page.getByText(T.instalar.aviso)).toBeVisible();
  await page.getByRole('button', { name: T.instalar.boton, exact: true }).click();
  await expect(page.getByText(T.instalar.aviso)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { instalacionPedida?: boolean }).instalacionPedida)).toBe(
    true,
  );
  await page.getByRole('link', { name: T.navegacion.ajustes }).click();
  await expect(page.getByText(T.instalar.instalada)).toBeVisible();
});

test('sin oferta del navegador, Ajustes explica cómo instalar', async ({ page }) => {
  await page.goto('/ajustes');
  await expect(page.getByRole('group', { name: T.instalar.titulo })).toContainText(T.instalar.menu);
});

test('el aviso del mapa se puede cerrar y no vuelve', async ({ page }) => {
  await page.goto('/');
  await ofrecerInstalacion(page);
  await page.getByRole('button', { name: T.ficha.cerrar }).click();
  await expect(page.getByText(T.instalar.aviso)).toHaveCount(0);
  await page.reload();
  await ofrecerInstalacion(page);
  await expect(page.getByText(T.instalar.aviso)).toHaveCount(0);
});

test('alta: "Mi posición" devuelve el pin al GPS después de moverlo a mano', async ({ page }) => {
  await page.goto('/proponer/alta');
  const mapa = page.getByTestId('selector-pin');
  await expect(mapa).toBeVisible();
  const caja = (await mapa.boundingBox())!;
  await mapa.click({ position: { x: caja.width / 2 + 80, y: caja.height / 2 + 40 } });
  await page.getByRole('button', { name: T.mapa.miPosicion }).click();

  // Se envía y se comprueba que el pin volvió a la posición GPS (origen "gps").
  let propuesta: Record<string, unknown> | null = null;
  await page.route('https://supabase.invalid/rest/v1/rpc/fn_proponer', async (r) => {
    propuesta = r.request().postDataJSON();
    await r.fulfill({ contentType: 'application/json', body: '{"estado":"pendiente","aplicada":false,"codigo":null}' });
  });
  await page.route('**/api/url-subida', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: '{"foto_path":"fotos/1.jpg","url":"https://supabase.invalid/subir"}',
    }),
  );
  await page.route('https://supabase.invalid/subir', (r) => r.fulfill({ status: 200, body: '{}' }));
  await page.getByRole('radio', { name: T.formulario.hidrante }).click();
  await page.getByRole('radio', { name: T.formulario.d70 }).click();
  await page.getByRole('radio', { name: T.formulario.bueno }).click();
  const jpeg = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 300;
    c.getContext('2d')!.fillRect(0, 0, 400, 300);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page
    .getByTestId('entrada-foto')
    .setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
  await page.getByRole('button', { name: T.envio.enviarRevision, exact: true }).click();
  await expect.poll(() => propuesta).not.toBeNull();
  expect(propuesta).toMatchObject({ origen: 'gps' });
  expect(propuesta!.lat as number).toBeCloseTo(37.2309, 5);
  expect(propuesta!.lng as number).toBeCloseTo(-3.6566, 5);
});

test('el alta recupera el GPS tras un primer timeout (RV-09)', async ({ page }) => {
  // El primer intento del GPS se agota antes del primer fix, como en la calle; el fix llega después.
  await page.addInitScript(() => {
    const geo = navigator.geolocation;
    const original = geo.watchPosition.bind(geo);
    geo.watchPosition = (ok, ko, opciones) => {
      setTimeout(
        () => ko?.({ code: 3, message: 'Timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
        0,
      );
      return original((p) => setTimeout(() => ok(p), 800), ko, opciones);
    };
  });
  await page.goto('/proponer/alta');
  await expect(page.getByText(T.mapa.posicionNoDisponible)).toBeVisible();
  // Sin tocar nada, llega el fix: el aviso desaparece y el pin sale del GPS.
  await expect(page.getByText(T.mapa.posicionNoDisponible)).toHaveCount(0);
  await expect(page.getByText(T.avisosFormulario.muevePin)).toHaveCount(0);
});

// docs/18 RV-40: una posición que el GPS dejó de refrescar no coloca el pin del alta ni viaja como
// gps_*. El GPS del navegador se sustituye por uno que el test maneja.
test.describe('alta con una posición que no está al día (RV-40)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __gps?: { ok: PositionCallback; ko?: PositionErrorCallback | null } };
      navigator.geolocation.watchPosition = (ok, ko) => {
        w.__gps = { ok, ko };
        return 1;
      };
      navigator.geolocation.clearWatch = () => undefined;
    });
  });

  const fix = (page: Page, lat: number, lng: number) =>
    page.evaluate(
      ([la, ln]) =>
        (window as unknown as { __gps: { ok: (p: unknown) => void } }).__gps.ok({
          coords: { latitude: la, longitude: ln, accuracy: 9 },
          timestamp: Date.now(),
        }),
      [lat, lng],
    );
  const timeout = (page: Page) =>
    page.evaluate(() =>
      (window as unknown as { __gps: { ko: (e: unknown) => void } }).__gps.ko({
        code: 3,
        message: 'Timeout',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      }),
    );

  async function altaConPosicionVieja(page: Page) {
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { __gps?: unknown }).__gps)).toBe(true);
    await fix(page, 37.2309, -3.6566);
    await timeout(page);
    await page.getByRole('button', { name: T.navegacion.nuevoPunto }).click();
    await expect(page.getByTestId('selector-pin')).toBeVisible();
  }

  test('el pin no se coloca con ella, lo dice y la propuesta va sin gps', async ({ page }) => {
    await altaConPosicionVieja(page);
    await expect(page.getByText(T.avisosFormulario.posicionNoAlDia)).toBeVisible();
    await expect(page.getByText(T.avisosFormulario.muevePin)).toBeVisible();

    let propuesta: Record<string, unknown> | null = null;
    await page.route('https://supabase.invalid/rest/v1/rpc/fn_proponer', async (r) => {
      propuesta = r.request().postDataJSON();
      await r.fulfill({
        contentType: 'application/json',
        body: '{"estado":"pendiente","aplicada":false,"codigo":null}',
      });
    });
    await page.route('**/api/url-subida', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: '{"foto_path":"fotos/1.jpg","url":"https://supabase.invalid/subir"}',
      }),
    );
    await page.route('https://supabase.invalid/subir', (r) => r.fulfill({ status: 200, body: '{}' }));
    const mapa = page.getByTestId('selector-pin');
    const caja = (await mapa.boundingBox())!;
    await mapa.click({ position: { x: caja.width / 2, y: caja.height / 2 } });
    await page.getByRole('radio', { name: T.formulario.hidrante }).click();
    await page.getByRole('radio', { name: T.formulario.d70 }).click();
    await page.getByRole('radio', { name: T.formulario.bueno }).click();
    const jpeg = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 300;
      c.getContext('2d')!.fillRect(0, 0, 400, 300);
      const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await page
      .getByTestId('entrada-foto')
      .setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
    await page.getByRole('button', { name: T.envio.enviarRevision, exact: true }).click();
    await expect.poll(() => propuesta).not.toBeNull();
    expect(propuesta).toMatchObject({ origen: 'manual', gps_lat: null, gps_lng: null, precision_gps_m: null });
  });

  test('en cuanto llega un fix nuevo, el pin se coloca solo', async ({ page }) => {
    await altaConPosicionVieja(page);
    await expect(page.getByText(T.avisosFormulario.muevePin)).toBeVisible();
    await fix(page, 37.231, -3.6567);
    await expect(page.getByText(T.avisosFormulario.posicionNoAlDia)).toHaveCount(0);
    await expect(page.getByText(T.avisosFormulario.muevePin)).toHaveCount(0);
    await expect(page.getByText(T.avisosFormulario.ajustaPin(9))).toBeVisible();
  });
});
