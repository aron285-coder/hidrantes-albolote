// Modo incidente: los más cercanos que funcionan, sin cobertura (FR-74, G2; docs/18 GM-03).

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conGoogle, conSesion, simularRpc, simularTablas } from './ayudas.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const O = { latitude: 37.2305, longitude: -3.656 };
const M_POR_GRADO = 111_195;
const CAUDALES = ['bueno', 'regular', 'malo', 'no_funciona'] as const;

/** 30 puntos al norte del incidente, cada 40 m, con estados y tipos mezclados. */
const CERCA = Array.from({ length: 30 }, (_, i) => {
  const hidrante = i % 3 !== 1;
  return {
    ...PUNTOS[0]!,
    id: `00000000-0000-4000-8000-00000000c${String(i).padStart(3, '0')}`,
    codigo: `${hidrante ? 'HID' : 'BOC'}-${String(7000 + i)}`,
    tipo: hidrante ? ('hidrante' as const) : ('boca_riego' as const),
    diametro_mm: hidrante ? 100 : 45,
    racor: hidrante ? null : ('granada' as const),
    // El más cercano de todos (40 m) no funciona: la hoja tiene que avisar.
    caudal: i === 0 ? ('no_funciona' as const) : CAUDALES[i % 4]!,
    lat: O.latitude + (40 * (i + 1)) / M_POR_GRADO,
    lng: O.longitude,
    radio_px: 9,
  };
});
const metros = (lat: number) => Math.round((lat - O.latitude) * M_POR_GRADO);

async function preparar(
  page: Page,
  context: import('@playwright/test').BrowserContext,
  conPosicion = true,
  precision = 8,
) {
  if (conPosicion) {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...O, accuracy: precision });
  }
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: { ...LISTADO, puntos: CERCA }, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByText(T.mapa.nPuntos(CERCA.length), { exact: false })).toBeVisible();
}

const hoja = (page: Page) => page.getByRole('region', { name: T.incidente.titulo });
const filas = (page: Page) => hoja(page).getByRole('listitem');

test('sin red: cinco que funcionan, en orden y con su distancia', async ({ page, context }) => {
  await preparar(page, context);
  await context.setOffline(true);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(filas(page)).toHaveCount(5);
  const esperados = CERCA.filter((p) => p.caudal === 'bueno' || p.caudal === 'regular').slice(0, 5);
  for (const [i, p] of esperados.entries()) {
    const fila = filas(page).nth(i);
    await expect(fila).toContainText(p.codigo);
    await expect(fila).toContainText(/bueno|regular/);
    const texto = (await fila.textContent()) ?? '';
    const m = Number(/(\d+) m · /.exec(texto)?.[1]);
    expect(Math.abs(m - metros(p.lat))).toBeLessThanOrEqual(1);
    await expect(fila).toContainText('· N ·');
  }
  // El origen del GPS lleva su momento y su precisión (RV-59).
  await expect(page).toHaveURL(/\?incidente=37\.230500,-3\.656000&gps=\d{13},8/);
  await expect(hoja(page)).toContainText(`${T.incidente.desdeTuPosicion} · ${T.incidente.precision(8)} ·`);
  await context.setOffline(false);
});

test('"Solo hidrantes" cambia la lista', async ({ page, context }) => {
  await preparar(page, context);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(filas(page).filter({ hasText: 'BOC-' })).not.toHaveCount(0);
  await hoja(page).getByRole('switch', { name: T.incidente.soloHidrantes }).check();
  await expect(filas(page)).toHaveCount(5);
  await expect(filas(page).filter({ hasText: 'BOC-' })).toHaveCount(0);
});

test('avisa de que el más cercano no funciona', async ({ page, context }) => {
  await preparar(page, context);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(hoja(page).getByRole('alert')).toHaveText(T.incidente.masCercanoNoFunciona(CERCA[0]!.codigo, '40 m'));
});

test('sin posición, la hoja lo explica y enfoca la búsqueda', async ({ page, context, isMobile }) => {
  await preparar(page, context, false);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(hoja(page)).toContainText(T.incidente.sinPosicion);
  await expect(filas(page)).toHaveCount(0);
  const buscador = isMobile
    ? page.getByRole('searchbox', { name: T.mapa.buscar }).first()
    : page.locator('#buscar-lista');
  await expect(buscador).toBeFocused();
});

test('atrás cierra el incidente y la URL vuelve a /', async ({ page, context }) => {
  await preparar(page, context);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(filas(page).first()).toBeVisible();
  await page.goBack();
  await expect(hoja(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/incidente=/);
});

test('recargar con ?incidente= lo restaura, desde el punto marcado', async ({ page, context }) => {
  await preparar(page, context, false);
  await page.goto('/?incidente=37.230500,-3.656000');
  await expect(filas(page)).toHaveCount(5);
  await expect(hoja(page)).toContainText(T.incidente.desdePuntoMarcado);
  await page.reload();
  await expect(filas(page)).toHaveCount(5);
});

test('tocar una fila abre la ficha sin cerrar el incidente', async ({ page, context }) => {
  await preparar(page, context);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  const primero = CERCA.find((p) => p.caudal === 'bueno' || p.caudal === 'regular')!;
  await filas(page).first().getByRole('button').first().click();
  await expect(page).toHaveURL(new RegExp(`incidente=.*&p=${primero.id}`));
  await expect(page.getByRole('heading', { name: primero.codigo })).toBeVisible();
  await page.goBack();
  await expect(filas(page)).toHaveCount(5);
});

// G2 (01 §A, AC-155): desde abrir la app hasta ver el punto más cercano que funciona, sin red.
test('G2: con puntos guardados y sin red, la primera fila de Cercanos en menos de 3 s @rendimiento', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(!isMobile, 'G2 se mide en el perfil móvil');
  await preparar(page, context);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // la segunda carga ya la controla el Service Worker
  await expect(page.getByText(T.mapa.nPuntos(CERCA.length), { exact: false })).toBeVisible();
  await context.setOffline(true);
  const t0 = Date.now();
  await page.goto('/');
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(filas(page).first()).toBeVisible();
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'G2', description: `${ms} ms` });
  expect(ms).toBeLessThan(3000);
  await context.setOffline(false);
});

test('desde ¿Qué hay aquí?, "Cercanos desde aquí" abre el incidente en ese sitio', async ({ page, context }) => {
  await preparar(page, context, false);
  await page.goto('/?aqui=37.230500,-3.656000');
  await page
    .getByRole('dialog', { name: T.aqui.titulo })
    .getByRole('button', { name: T.aqui.cercanosDesdeAqui })
    .click();
  await expect(page).toHaveURL(/\?incidente=37\.230500,-3\.656000$/);
  await expect(filas(page)).toHaveCount(5);
  await expect(hoja(page)).toContainText(T.incidente.desdePuntoMarcado);
});

// docs/19 RV-57: al arrancar con sesión de Google se borraban todos los parámetros de la dirección.
test('jefatura recarga /?incidente=… y el incidente sigue abierto (RV-57)', async ({ page }) => {
  await conGoogle(page, 'jefa@example.org');
  await simularTablas(page, { v_puntos_activos: CERCA, config: [] });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
    r.fulfill({ contentType: 'application/json', body: 'true' }),
  );
  await page.goto('/?incidente=37.230500,-3.656000');
  await expect(hoja(page)).toBeVisible();
  await expect(filas(page).first()).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\?incidente=37\.230500,-3\.656000/);
  await expect(hoja(page)).toBeVisible();
  await expect(hoja(page)).toContainText(T.incidente.desdePuntoMarcado);
});

// docs/19 RV-59: precisión invisible, posición vieja mal avisada y "Sin posición" mientras el GPS busca.
test.describe('Cercanos con GPS (RV-59)', () => {
  /** Un GPS que no contesta hasta que el test lo dice: `window.__fix(...)` o `window.__errorGps(código)`. */
  async function gpsManual(page: Page) {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const geo = {
        watchPosition(ok: PositionCallback, error?: PositionErrorCallback | null) {
          w.__fix = (lat: number, lng: number, accuracy: number) =>
            ok({ coords: { latitude: lat, longitude: lng, accuracy }, timestamp: Date.now() } as GeolocationPosition);
          w.__errorGps = (code: number) =>
            error?.({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
          return 1;
        },
        clearWatch() {},
        getCurrentPosition() {},
      };
      Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    });
  }
  const buscador = (page: Page, isMobile: boolean) =>
    isMobile ? page.getByRole('searchbox', { name: T.mapa.buscar }).first() : page.locator('#buscar-lista');

  test('precisión de 800 m avisa y ofrece marcar en el mapa', async ({ page, context }) => {
    await preparar(page, context, true, 800);
    await page.getByRole('button', { name: T.incidente.boton }).click();
    await expect(hoja(page)).toContainText(`${T.incidente.desdeTuPosicion} · ${T.incidente.precision(800)}`);
    await expect(
      hoja(page)
        .getByRole('status')
        .filter({ hasText: T.incidente.pocoPrecisa(800) }),
    ).toBeVisible();

    await hoja(page).getByRole('button', { name: T.incidente.marcarEnMapa }).click();
    await expect(hoja(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/incidente=/);
  });

  test('con ±8 m no hay aviso de poca precisión', async ({ page, context }) => {
    await preparar(page, context);
    await page.getByRole('button', { name: T.incidente.boton }).click();
    await expect(filas(page)).toHaveCount(5);
    await expect(hoja(page).getByRole('button', { name: T.incidente.marcarEnMapa })).toHaveCount(0);
  });

  test('tras recargar con gps=…&momento de hace 5 min se ve "hace 5 min"', async ({ page, context }) => {
    const ahora = Date.now();
    await page.clock.setFixedTime(ahora);
    await preparar(page, context, false);
    await page.goto(`/?incidente=37.230500,-3.656000&gps=${ahora - 5 * 60_000},12`);
    const cabecera = `${T.incidente.desdeTuPosicion} · ${T.incidente.precision(12)} · ${T.formato.haceMin(5)}`;
    await expect(hoja(page)).toContainText(cabecera);
    await expect(
      hoja(page)
        .getByRole('status')
        .filter({ hasText: T.incidente.posicionDe(T.formato.haceMin(5)) }),
    ).toBeVisible();
    await page.reload();
    await expect(hoja(page)).toContainText(cabecera);
    await expect(filas(page)).toHaveCount(5);
  });

  test('GPS en frío: primero "Buscando…", sin foco en el buscador; al llegar el fix, sale la lista sola', async ({
    page,
    context,
    isMobile,
  }) => {
    await gpsManual(page);
    await preparar(page, context, false);
    await page.getByRole('button', { name: T.incidente.boton }).click();
    await expect(hoja(page)).toContainText(T.incidente.buscandoPosicion);
    await expect(hoja(page)).not.toContainText(T.incidente.sinPosicion);
    await expect(buscador(page, isMobile)).not.toBeFocused();
    // El aviso flotante no lo repite.
    await expect(page.getByRole('status').filter({ hasText: T.mapa.buscandoPosicion })).toHaveCount(1);

    await page.evaluate(() =>
      (window as unknown as { __fix: (a: number, b: number, c: number) => void }).__fix(37.2305, -3.656, 10),
    );
    await expect(filas(page)).toHaveCount(5);
    await expect(page).toHaveURL(/gps=\d{13},10/);
  });

  test('denegado: "Sin posición" y foco en el buscador', async ({ page, context, isMobile }) => {
    await gpsManual(page);
    await preparar(page, context, false);
    await page.getByRole('button', { name: T.incidente.boton }).click();
    await expect(hoja(page)).toContainText(T.incidente.buscandoPosicion);
    await page.evaluate(() => (window as unknown as { __errorGps: (c: number) => void }).__errorGps(1));
    await expect(hoja(page)).toContainText(T.incidente.sinPosicion);
    await expect(buscador(page, isMobile)).toBeFocused();
  });
});

// docs/19 RV-62: cabos sueltos del modo incidente.
test.describe('cabos sueltos del modo incidente (RV-62)', () => {
  test('cerrar la ficha abierta desde Cercanos con la X y pulsar atrás una vez cierra el incidente', async ({
    page,
    context,
    isMobile,
  }) => {
    await preparar(page, context);
    await page.getByRole('button', { name: T.incidente.boton }).click();
    await filas(page).first().getByRole('button').first().click();
    await expect(page).toHaveURL(/&p=/);
    // En el móvil la ficha ocupa la pantalla y se cierra con la flecha de la barra de arriba.
    await page
      .getByRole('button', { name: isMobile ? T.entrada.volver : T.ficha.cerrar, exact: true })
      .first()
      .click();
    await expect(page).not.toHaveURL(/&p=/);
    await expect(filas(page)).toHaveCount(5);
    await page.goBack();
    await expect(page).not.toHaveURL(/incidente=/);
    await expect(hoja(page)).toHaveCount(0);
  });

  test('la lista de al lado dice "desde el incidente" y, al cerrarlo, deja de ordenar desde él', async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'la lista va al lado del mapa en ordenador (FR-70)');
    await preparar(page, context, false);
    await page.goto('/?incidente=37.230500,-3.656000');
    await expect(filas(page)).toHaveCount(5);
    const lista = page.locator('aside').filter({ has: page.locator('#buscar-lista') });
    await expect(lista.getByText(T.mapa.desdeIncidente).first()).toBeVisible();
    await expect(lista.getByText(T.mapa.desdeTi)).toHaveCount(0);
    await hoja(page).getByRole('button', { name: T.incidente.cerrarIncidente }).click();
    await expect(lista.getByText(T.mapa.desdeIncidente)).toHaveCount(0);
  });

  test('jefatura con tramos de 25 m los ve en el primer incidente y en la medición', async ({ page }) => {
    await conGoogle(page, 'jefa@example.org');
    await simularTablas(page, {
      v_puntos_activos: CERCA,
      config: (url) => (url.searchParams.get('clave') === 'eq.metros_tramo_manguera' ? [{ valor: 25 }] : []),
    });
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
      r.fulfill({ contentType: 'application/json', body: 'true' }),
    );
    // BOC-7004 está a 200 m: 8 tramos de 25 m (con los 20 m de por defecto serían 10).
    await page.goto('/?incidente=37.230500,-3.656000');
    const fila = filas(page).filter({ hasText: 'BOC-7004' });
    await expect(fila).toContainText(T.incidente.tramos(8));
    await fila.getByRole('button', { name: T.medir.tendido }).click();
    await expect(page.getByText(/tramos de 25 m/)).toBeVisible();
  });

  test('tras elegir un resultado de la búsqueda, cerrar ¿Qué hay aquí? no vuelve a enseñar "Sin posición"', async ({
    page,
    context,
    isMobile,
  }) => {
    await preparar(page, context, false);
    await page.getByRole('button', { name: T.incidente.boton }).click();
    await expect(hoja(page)).toContainText(T.incidente.sinPosicion);
    const buscador = isMobile
      ? page.getByRole('searchbox', { name: T.mapa.buscar }).first()
      : page.locator('#buscar-lista');
    await buscador.fill('37.2305, -3.656');
    await page
      .getByRole('button', { name: T.busqueda.coordenadas('37.230500, -3.656000') })
      .first()
      .click();
    const aqui = page.getByRole('dialog', { name: T.aqui.titulo });
    await expect(aqui).toBeVisible();
    await page.goBack();
    await expect(aqui).toHaveCount(0);
    await expect(page.getByText(T.incidente.sinPosicion)).toHaveCount(0);
  });
});
