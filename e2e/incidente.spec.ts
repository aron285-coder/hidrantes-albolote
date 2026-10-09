// Modo incidente: los más cercanos que funcionan, sin cobertura (FR-74, G2; docs/18 GM-03).

import { AxeBuilder } from '@axe-core/playwright';
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
    await expect(fila).toContainText(/Bueno|Regular/);
    // La distancia y el rumbo van aparte, a la derecha: "… · Regular" + "80 m" + "N" (RV-114).
    const texto = (await fila.textContent()) ?? '';
    const [, m, rumbo] = /(\d+) m(N|NE|E|SE|S|SO|O|NO)$/.exec(texto.trim()) ?? [];
    expect(Math.abs(Number(m) - metros(p.lat))).toBeLessThanOrEqual(1);
    expect(rumbo).toBe('N');
  }
  // El origen del GPS lleva su momento y su precisión (RV-59). Con el GPS al día y preciso, el
  // subtítulo solo dice "en línea recta" (DEC-165).
  await expect(page).toHaveURL(/\?incidente=37\.230500,-3\.656000&gps=\d{13},8/);
  await expect(hoja(page).locator('[data-subtitulo]')).toHaveText(`· ${T.incidente.lineaRecta}`);
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

// docs/27 RV-114: el más cercano de todos no funciona, pero la hoja ya no lo dice: no sale en la lista.
test('el que no funciona no sale ni se avisa de él, y no hay "Compartir el incidente"', async ({ page, context }) => {
  await preparar(page, context);
  await page.getByRole('button', { name: T.incidente.boton }).click();
  await expect(filas(page)).toHaveCount(5);
  await expect(filas(page).filter({ hasText: CERCA[0]!.codigo })).toHaveCount(0);
  await expect(hoja(page).getByRole('alert')).toHaveCount(0);
  await expect(hoja(page)).not.toContainText('El más cercano');
  await expect(hoja(page).getByRole('button', { name: /Compartir/ })).toHaveCount(0);
  await expect(hoja(page)).not.toContainText(/tramo|revisado|Datos de/);
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
    // En la misma línea del subtítulo, sin recuadro (DEC-165).
    await expect(hoja(page).getByRole('status')).toHaveText(
      `· ${T.incidente.lineaRecta} · ${T.incidente.pocoPrecisa(800)}`,
    );

    await hoja(page).getByRole('button', { name: T.incidente.marcarEnMapa }).click();
    await expect(hoja(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/incidente=/);
    // La hoja se cierra, pero el mapa dice qué hacer ahora (RV-114).
    const aviso = page.getByRole('status').filter({ hasText: T.incidente.marcaElSitio });
    await expect(aviso).toBeVisible();
    // Al mantener pulsado el mapa se abre ¿Qué hay aquí? y el aviso se va.
    const mapa = page.locator('[data-testid="mapa"]');
    const caja = (await mapa.boundingBox())!;
    const centro = { clientX: caja.x + caja.width / 2, clientY: caja.y + caja.height / 2 };
    await mapa.dispatchEvent('pointerdown', { ...centro, pointerType: 'touch', isPrimary: true });
    await page.waitForTimeout(700);
    await mapa.dispatchEvent('pointerup', centro, { timeout: 1000 }).catch(() => {});
    await expect(page.getByRole('dialog', { name: T.aqui.titulo })).toBeVisible();
    await expect(aviso).toHaveCount(0);
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
    const subtitulo = `· ${T.incidente.lineaRecta} · ${T.incidente.posicionDe(T.formato.haceMin(5))}`;
    await expect(hoja(page).getByRole('status')).toHaveText(subtitulo);
    await page.reload();
    await expect(hoja(page).getByRole('status')).toHaveText(subtitulo);
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
    // En ordenador Cercanos ocupa la columna (RV-60): la lista, con "Volver a la lista".
    await hoja(page).getByRole('button', { name: T.incidente.volverALista }).click();
    const lista = page.locator('aside').filter({ has: page.locator('#buscar-lista') });
    await expect(lista.getByText(T.mapa.desdeIncidente).first()).toBeVisible();
    await expect(lista.getByText(T.mapa.desdeTi)).toHaveCount(0);
    await page.getByRole('button', { name: T.incidente.volverACercanos }).click();
    await hoja(page).getByRole('button', { name: T.incidente.cerrarIncidente }).click();
    await expect(lista.getByText(T.mapa.desdeIncidente)).toHaveCount(0);
  });

  // Los tramos ya no van en la fila de Cercanos (docs/27 RV-114): se miden con Medir, que sigue
  // usando la longitud de la config también para jefatura (RV-62).
  test('jefatura con tramos de 25 m los ve en la medición desde el sitio del incidente', async ({ page }) => {
    await conGoogle(page, 'jefa@example.org');
    await simularTablas(page, {
      v_puntos_activos: CERCA,
      config: (url) => (url.searchParams.get('clave') === 'eq.metros_tramo_manguera' ? [{ valor: 25 }] : []),
    });
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/fn_es_admin`, (r) =>
      r.fulfill({ contentType: 'application/json', body: 'true' }),
    );
    // El sitio, 30 m al sur del incidente de CERCA: HID-7000 queda a 70 m, 3 tramos de 25 m (con los
    // 20 m de por defecto serían 4). A z18 está a unos 150 px, lejos de los demás marcadores.
    const sur = (O.latitude - 30 / M_POR_GRADO).toFixed(6);
    await page.addInitScript(
      (lat) => sessionStorage.setItem('hidrantes.vista', JSON.stringify({ centro: [Number(lat), -3.656], zoom: 18 })),
      sur,
    );
    await page.goto(`/?aqui=${sur},-3.656000`);
    await page.getByRole('dialog', { name: T.aqui.titulo }).getByRole('button', { name: T.medir.desdeAqui }).click();
    const marcador = page.locator(`.marcador[title="${CERCA[0]!.codigo}"]`);
    await expect(marcador).toBeVisible();
    // El mapa aún puede estar moviéndose: se toca cuando dos lecturas seguidas coinciden.
    let previa = '';
    await expect
      .poll(async () => {
        const b = await marcador.boundingBox();
        const ahora = b ? `${Math.round(b.x)},${Math.round(b.y)}` : '';
        const quieto = !!ahora && ahora === previa;
        previa = ahora;
        return quieto;
      })
      .toBe(true);
    const b = (await marcador.boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(page.getByRole('region', { name: T.medir.titulo })).toContainText(/70 m · 3 tramos de 25 m/);
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

// docs/19 RV-61: en el móvil, "Cercanos" solo enseñaba un candidato sin desplazarse.
test.describe('hoja de Cercanos en el móvil (RV-61)', () => {
  // docs/27 RV-114: a 412 × 915 (el Android del desarrollador), con la hoja a media altura, también
  // con el aviso más largo, el de poco precisa con su enlace.
  for (const precision of [8, 80]) {
    test(`a 412 × 915, tres candidatos se ven enteros sin desplazar (±${precision} m)`, async ({
      page,
      context,
      isMobile,
    }) => {
      test.skip(!isMobile, 'la hoja es del móvil');
      await page.setViewportSize({ width: 412, height: 915 });
      await preparar(page, context, true, precision);
      await page.getByRole('button', { name: T.incidente.boton }).click();
      await expect(filas(page)).toHaveCount(5);
      await expect(hoja(page).getByRole('button', { name: T.incidente.ampliarHoja })).toBeVisible();
      const barra = (await page.getByRole('navigation', { name: T.app.nombreCorto }).boundingBox())!;
      const caja = (await hoja(page).boundingBox())!;
      expect(await hoja(page).evaluate((h) => h.scrollTop), 'la hoja sin desplazar').toBe(0);
      for (const i of [0, 1, 2]) {
        const fila = (await filas(page).nth(i).boundingBox())!;
        expect(fila.y, `la fila ${i + 1} empieza dentro de la hoja`).toBeGreaterThanOrEqual(caja.y);
        expect(fila.y + fila.height, `la fila ${i + 1} termina por encima de la barra`).toBeLessThanOrEqual(barra.y);
        expect(fila.y + fila.height, `y dentro de la hoja`).toBeLessThanOrEqual(caja.y + caja.height);
      }
    });
  }

  test('el asa y su botón cambian entre 55 % y 90 %, y la altura se recuerda en la sesión', async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(!isMobile, 'la hoja es del móvil');
    await preparar(page, context);
    await page.getByRole('button', { name: T.incidente.boton }).click();
    await expect(filas(page)).toHaveCount(5);
    const media = (await hoja(page).boundingBox())!.height;
    await hoja(page).getByRole('button', { name: T.incidente.ampliarHoja }).click();
    await expect(hoja(page).getByRole('button', { name: T.incidente.reducirHoja })).toBeVisible();
    await expect.poll(async () => (await hoja(page).boundingBox())!.height).toBeGreaterThan(media);
    await page.reload();
    await expect(hoja(page).getByRole('button', { name: T.incidente.reducirHoja })).toBeVisible();
    // Arrastrar el asa hacia abajo la deja en la media.
    const asa = (await page.getByTestId('asa-cercanos').boundingBox())!;
    await page.mouse.move(asa.x + asa.width / 2, asa.y + asa.height / 2);
    await page.mouse.down();
    await page.mouse.move(asa.x + asa.width / 2, asa.y + 120, { steps: 5 });
    await page.mouse.up();
    await expect(hoja(page).getByRole('button', { name: T.incidente.ampliarHoja })).toBeVisible();
  });

  // docs/27 RV-114: un solo botón por fila, "Cómo llegar", que abre la app de mapas con el punto.
  test('cada fila tiene un solo botón, "Cómo llegar", de 44 px, que abre la app de mapas', async ({
    page,
    context,
    isMobile,
  }) => {
    await preparar(page, context);
    await page.getByRole('button', { name: T.incidente.boton }).click();
    await expect(filas(page)).toHaveCount(5);
    const primero = CERCA.find((p) => p.caudal === 'bueno' || p.caudal === 'regular')!;
    for (const i of [0, 1, 2, 3, 4]) {
      const fila = filas(page).nth(i);
      await expect(fila.getByRole('link')).toHaveCount(1);
      await expect(fila.getByRole('button')).toHaveCount(1); // la propia fila, que abre la ficha
      await expect(fila.getByRole('button', { name: /Medir/ })).toHaveCount(0);
    }
    const enlace = filas(page).first().getByRole('link', { name: T.ficha.comoLlegar });
    await expect(enlace).toBeVisible();
    await expect(enlace).toHaveAttribute('title', T.ficha.comoLlegar);
    await expect(enlace).toHaveAttribute('target', '_blank');
    const coords = `${primero.lat.toFixed(6)},${primero.lng.toFixed(6)}`;
    // Android abre la app de mapas con geo:; en ordenador, Google Maps (FR-161).
    await expect(enlace).toHaveAttribute(
      'href',
      isMobile
        ? `geo:${coords}?q=${coords}(${primero.codigo})`
        : `https://www.google.com/maps/dir/?api=1&destination=${coords}`,
    );
    const b = (await enlace.boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
  });

  // Accesibilidad de la hoja abierta, con el aviso y su enlace, en claro y en oscuro (TR-30).
  for (const tema of ['light', 'dark'] as const) {
    test(`axe sobre la hoja abierta con aviso, en ${tema === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
      context,
    }) => {
      await page.emulateMedia({ colorScheme: tema });
      await preparar(page, context, true, 80);
      await page.getByRole('button', { name: T.incidente.boton }).click();
      await expect(filas(page)).toHaveCount(5);
      await expect(hoja(page).getByRole('button', { name: T.incidente.marcarEnMapa })).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .include(`section[aria-label="${T.incidente.titulo}"]`)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(violations.flatMap((v) => v.nodes.map((n) => `${v.id} · ${n.target.join(' ')}`))).toEqual([]);
    });
  }
});
