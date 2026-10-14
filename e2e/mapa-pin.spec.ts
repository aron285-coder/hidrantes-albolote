// docs/32 RV-243: el mapa del pin lleva su atribución y avisa sin cobertura y sin mapa base; y
// «N sin enviar» de la barra de estado se puede tocar entero (sus 44 px no quedan bajo la cabecera).
// docs/35 RV-423: en un alta, si el GPS llega tarde, el pin no se queda fuera de la pantalla.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

test.describe('alta con el GPS que llega tarde (RV-423)', () => {
  // Lejos del centro con el que abre el mapa del pin (a unos 700 m): al zoom del alta, fuera de la vista.
  const LEJOS = { latitude: 37.2345, longitude: -3.65 };

  test.beforeEach(async ({ page }) => {
    // GPS del navegador sustituido por uno que el test maneja: la posición llega cuando el test la manda.
    await page.addInitScript((pos) => {
      const w = window as unknown as { __fix?: () => void };
      navigator.geolocation.watchPosition = (ok) => {
        w.__fix = () => ok({ coords: { ...pos, accuracy: 8 }, timestamp: Date.now() } as never);
        return 1;
      };
      navigator.geolocation.clearWatch = () => undefined;
    }, LEJOS);
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_ficha_punto: PUNTOS[0], fn_registrar_error: null });
  });

  const abrir = async (page: Page, ruta = '/proponer/alta') => {
    await page.goto(ruta);
    await expect(page.getByTestId('selector-pin')).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof (window as { __fix?: unknown }).__fix)).toBe('function');
  };

  /** Manda la primera posición y espera a que el formulario la tenga («Buscando tu posición…» se va). */
  const fijarGps = async (page: Page) => {
    const buscando = page.getByText(T.mapa.buscandoPosicion);
    await expect(buscando.first()).toBeVisible();
    await page.evaluate(() => (window as unknown as { __fix: () => void }).__fix());
    await expect(buscando).toHaveCount(0);
  };
  const pin = (page: Page) => page.getByTestId('selector-pin').locator('.leaflet-marker-icon');
  const desplazamiento = (page: Page) =>
    page
      .getByTestId('selector-pin')
      .locator('.leaflet-map-pane')
      .evaluate((e) => (e as HTMLElement).style.transform);

  test('con la primera posición, el mapa se centra y el pin queda a la vista', async ({ page }) => {
    await abrir(page);
    await fijarGps(page);
    const mapa = (await page.getByTestId('selector-pin').boundingBox())!;
    const p = (await pin(page).boundingBox())!;
    const centro = { x: p.x + p.width / 2, y: p.y + p.height / 2 };
    expect(centro.x).toBeGreaterThan(mapa.x);
    expect(centro.x).toBeLessThan(mapa.x + mapa.width);
    expect(centro.y).toBeGreaterThan(mapa.y);
    expect(centro.y).toBeLessThan(mapa.y + mapa.height);
  });

  // De no regresión: al corregir la ubicación, el mapa abre en el punto y ahí se queda. El caso que
  // depende de que solo el alta lo pida es el diálogo de núcleos (panel-ajustes.spec.ts).
  test('al corregir la ubicación, la posición que llega no mueve el mapa', async ({ page }) => {
    await abrir(page, `/proponer/ubicacion?p=${PUNTOS[0]!.id}`);
    const caja = async () => (await pin(page).boundingBox())!;
    const antes = await caja();
    await fijarGps(page);
    const despues = await caja();
    // Unos píxeles de margen por el texto de debajo del mapa, que cambia al llegar la posición; centrar
    // en ella movería el pin más de 1.000 px.
    expect(Math.abs(despues.x - antes.x)).toBeLessThan(5);
    expect(Math.abs(despues.y - antes.y)).toBeLessThan(5);
  });

  test('si antes se ha movido el mapa, no salta', async ({ page }) => {
    await abrir(page);
    const mapa = (await page.getByTestId('selector-pin').boundingBox())!;
    const x = mapa.x + mapa.width / 2;
    const y = mapa.y + mapa.height * 0.75;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y - 40, { steps: 8 });
    await page.mouse.up();
    // Tras soltar, el mapa sigue un poco por inercia: se espera a que se quede quieto.
    let movido = '';
    await expect
      .poll(
        async () => {
          const anterior = movido;
          movido = await desplazamiento(page);
          return movido !== '' && movido === anterior;
        },
        { intervals: [300] },
      )
      .toBe(true);
    const antes = await pin(page).evaluate((e) => (e as HTMLElement).style.transform);
    await fijarGps(page);
    // El pin va al GPS; el mapa se queda donde lo dejó el voluntario.
    await expect.poll(() => pin(page).evaluate((e) => (e as HTMLElement).style.transform)).not.toBe(antes);
    expect(await desplazamiento(page)).toBe(movido);
  });
});

test.describe('mapa del pin (RV-243)', () => {
  test('lleva la atribución de lo que se ve', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await page.goto('/proponer/alta');
    await expect(page.getByTestId('selector-pin')).toBeVisible();
    await expect(page.getByTestId('atribucion-pin')).toHaveText(T.mapa.atribucionBase);
  });

  test('sin conexión y sin mapa base descargado, lo avisa encima del mapa', async ({ page, context }) => {
    // Datos móviles: el mapa base no se descarga solo (FR-81).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: { type: 'cellular', saveData: false } });
    });
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await page.goto('/proponer/alta');
    await expect(page.getByTestId('selector-pin')).toBeVisible();
    await expect(page.getByTestId('aviso-pin-sin-mapa')).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.getByTestId('aviso-pin-sin-mapa')).toHaveText(T.operaciones.pinSinMapa);
    await context.setOffline(false);
    await expect(page.getByTestId('aviso-pin-sin-mapa')).toHaveCount(0);
  });
});

test('«N sin enviar» se toca en sus cuatro bordes (RV-243, UI-15)', async ({ page }) => {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByTestId('estado-sincro')).toHaveAttribute('data-puntos', String(PUNTOS.length));
  await page.evaluate(
    () =>
      new Promise<void>((ok, ko) => {
        const abrir = indexedDB.open('hidrantes');
        abrir.onerror = () => ko(abrir.error);
        abrir.onsuccess = () => {
          const t = abrir.result.transaction('cola', 'readwrite');
          t.objectStore('cola').put({
            clave_local: 'k-borde',
            creada_en: Date.now(),
            args: { clave_local: 'k-borde', operacion: 'estado', punto_id: 'x', datos: {} },
            foto: null,
            foto_path: null,
            codigo: 'HID-9001',
            intentos: 0,
            proximo: 0,
            fallo: 'PAYLOAD_INVALIDO(caudal)',
          });
          t.oncomplete = () => ok();
        };
      }),
  );
  await page.reload();
  const enlace = page.getByRole('link', { name: T.mapa.sinEnviar(1) });
  await expect(enlace).toBeVisible();
  // El sello de la barra cambia de texto al sincronizar y mueve el enlace: se mide y se toca en el
  // mismo instante, y se espera a que quede quieto.
  const fuera = () =>
    enlace.evaluate((a) => {
      const c = a.getBoundingClientRect();
      const bordes: Record<string, [number, number]> = {
        arriba: [c.x + c.width / 2, c.y + 1],
        abajo: [c.x + c.width / 2, c.bottom - 1],
        izquierda: [c.x + 1, c.y + c.height / 2],
        derecha: [c.right - 1, c.y + c.height / 2],
      };
      const malos = Object.entries(bordes)
        .filter(([, [x, y]]) => !a.contains(document.elementFromPoint(x, y)))
        .map(([b]) => b);
      return c.height >= 44 ? malos : ['menos de 44 px', ...malos];
    });
  await expect.poll(fuera, { message: 'bordes de «N sin enviar» que no se pueden tocar' }).toEqual([]);
});
