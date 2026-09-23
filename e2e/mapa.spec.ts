// Fase 5: mapa, lista, búsqueda, ficha, capas, modo sin cobertura (FR-60–FR-71, FR-80–FR-81).

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conSesion, simularRpc } from './ayudas.ts';
import { readFileSync } from 'node:fs';
import { novedadesDe } from '../scripts/generar-novedades.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

async function abrir(page: Page, ruta = '/') {
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
  if (ruta !== '/') await page.goto(ruta);
}

/** Un botón con texto (resultado de búsqueda o fila de la lista), nunca un marcador del mapa. */
const boton = (page: Page, texto: string) => page.locator('button').filter({ hasText: texto }).first();

test.describe('mapa y lista', () => {
  test('sincroniza, pinta los marcadores y dice cuándo (FR-60, FR-80)', async ({ page }) => {
    await abrir(page);
    await expect(page.getByText(/Sincronizado hace/)).toBeVisible();
    // Al encuadre inicial (zoom ≤ 13) solo se ven R1 y R2 (06 §4.4).
    const visibles = await page.locator('.marcador').count();
    expect(visibles).toBeGreaterThan(0);
    expect(visibles).toBeLessThan(PUNTOS.length);
    await expect(page.getByRole('region', { name: T.mapa.leyenda })).toContainText(T.mapa.leyendaTamano);
  });

  test('buscar por calle abre la ficha, sin autores ni historial (FR-66, FR-69)', async ({ page }) => {
    await abrir(page);
    const buscador = page.getByRole('searchbox', { name: T.mapa.buscar }).first();
    await buscador.fill('real 14');
    await boton(page, 'HID-9001').click();
    await expect(page).toHaveURL(/\?p=/);
    const ficha = page.getByRole('article');
    await expect(ficha).toContainText('Calle Real 14');
    await expect(ficha).toContainText(T.formulario.bueno);
    await expect(ficha).toContainText(T.formato.mm(100));
    await expect(page.getByRole('link', { name: T.ficha.comoLlegar })).toHaveAttribute('href', /37\.2308/);
    await expect(page.getByRole('button', { name: T.ficha.proponerCambio })).toBeVisible();
  });

  test('un punto que cruza los 12 meses se ve sin revisar sin cambios en el servidor (RV-05, FR-61)', async ({
    page,
  }) => {
    // El reloj que se mueve es el del navegador; el servidor simulado contesta siempre lo mismo.
    await page.clock.install({ time: new Date('2026-09-23T10:00:00') });
    const [p0, ...resto] = PUNTOS;
    // Revisado hace 11 meses y 29 días: aún no le toca.
    const casiCaducado = { ...p0, fecha_ultima_revision: '2025-09-24', revision_caducada: false };
    await conSesion(page);
    await simularRpc(page, {
      fn_listar_puntos: {
        ...LISTADO,
        puntos: [casiCaducado, ...resto],
        config: { meses_revision: 12, escala_radios: [11, 9, 7, 5.5, 5] },
      },
      fn_registrar_error: null,
    });
    await page.goto('/lista');
    await page.getByRole('radio', { name: T.mapa.sinRevisar }).click();
    await expect(page.getByRole('button', { name: /HID-9005/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /HID-9001/ })).toHaveCount(0);

    await page.clock.setSystemTime(new Date('2026-09-25T10:00:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('button', { name: /HID-9001/ })).toBeVisible();
  });

  test('lista: filtros, estados vacíos y paso al mapa (FR-68)', async ({ page }) => {
    await abrir(page, '/lista');
    await page.getByRole('radio', { name: T.mapa.bocas }).click();
    await expect(page.getByRole('button', { name: /BOC-90/ })).toHaveCount(4);
    await page.getByRole('radio', { name: T.mapa.sinRevisar }).click();
    await expect(page.getByRole('button', { name: /HID-9005/ })).toBeVisible();
    await page.getByRole('searchbox', { name: T.mapa.buscar }).fill('no existe');
    await expect(page.getByText(T.mapa.busquedaVacia)).toBeVisible();
    await page.getByRole('searchbox', { name: T.mapa.buscar }).fill('');
    await boton(page, 'HID-9005').click();
    await expect(page.getByRole('article')).toContainText(T.ficha.caducada);
  });

  test('capas: elegir satélite se recuerda (FR-63)', async ({ page }) => {
    await abrir(page);
    await page.getByRole('button', { name: T.mapa.capas }).click();
    await page.getByRole('radio', { name: new RegExp(T.mapa.satelitePnoa.replace(/[()]/g, '\\$&')) }).click();
    await expect(page.getByText(/Instituto Geográfico Nacional/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Instituto Geográfico Nacional/)).toBeVisible();
  });
});

test.describe('sin cobertura (criterio de salida)', () => {
  test('con el mapa base descargado, mapa, búsqueda y lista funcionan en modo avión', async ({ page, context }) => {
    await abrir(page, '/ajustes');
    // Se descarga solo al arrancar con una conexión que lo permite (FR-81).
    await expect(page.getByText(/Descargado · /)).toBeVisible({ timeout: 20_000 });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByText(/Descargado · /)).toBeVisible();

    await context.setOffline(true);
    await page.goto('/');
    await expect(page.getByText(/Sin cobertura · datos de/)).toBeVisible();
    await expect(page.locator('.marcador').first()).toBeVisible();
    // El mapa base se dibuja desde el móvil: hay teselas de lienzo pintadas.
    await expect(page.locator('.leaflet-tile-container canvas, canvas.leaflet-tile').first()).toBeVisible();
    await expect(page.getByText(T.mapa.mapaNoDescargado)).toHaveCount(0);

    await page.getByRole('searchbox', { name: T.mapa.buscar }).first().fill('HID-9002');
    await boton(page, 'HID-9002').click();
    await expect(page.getByRole('article')).toContainText(T.ficha.sinDireccion);

    await page.goto('/lista');
    await expect(page.getByRole('button', { name: /HID-9001/ })).toBeVisible();

    // Una capa en línea sin cobertura sale en gris con el motivo.
    await page.goto('/');
    await page.getByRole('button', { name: T.mapa.capas }).click();
    await expect(
      page.getByRole('radio', { name: new RegExp(T.mapa.calleOsm.replace(/[()]/g, '\\$&')) }),
    ).toBeDisabled();
    await context.setOffline(false);
  });

  // FR-63 y UI-04: la capa en línea que se estaba usando deja de pintarse al perder la cobertura.
  // El Catastro también, aunque debajo siga el mapa base: desaparecería el plano sin decir por qué.
  for (const [capa, nombre] of [
    ['satelite', T.mapa.satelitePnoa],
    ['catastro', T.mapa.catastro],
  ] as const) {
    test(`sin cobertura, la capa "${capa}" dice que la necesita (FR-63)`, async ({ page, context }) => {
      await conSesion(page, { extra: { capa } });
      await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
      await page.goto('/');
      await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();

      await context.setOffline(true);
      await expect(page.getByRole('status').filter({ hasText: T.mapa.capaSinCobertura(nombre) })).toBeVisible();
      await context.setOffline(false);
    });
  }

  test('sin mapa base y sin cobertura, el mapa lo avisa en vez de quedarse en blanco (FR-81)', async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: { type: 'cellular', saveData: false } });
    });
    await abrir(page);
    await context.setOffline(true);
    await expect(page.getByText(T.mapa.mapaNoDescargado)).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('aviso del mapa base en el propio mapa (RV-10, FR-81)', () => {
  test('con red y sin mapa base, el mapa lo avisa y el botón lo descarga', async ({ page }) => {
    // Datos móviles: no se descarga solo; el aviso pregunta.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: { type: 'cellular', saveData: false } });
    });
    await page.route('**/mapabase/*.pmtiles', async (r) => {
      await new Promise((ok) => setTimeout(ok, 1500));
      await r.continue();
    });
    await abrir(page);
    const aviso = page.getByTestId('aviso-mapabase');
    await expect(aviso).toContainText(T.mapa.mapabaseFalta);
    await aviso.getByRole('button', { name: /^Descargar \(\d+,\d MB\)$/ }).click();
    await expect(aviso).toContainText(/Descargando… \d+ %/);
    await expect(aviso).toHaveCount(0, { timeout: 20_000 });
  });

  test('con una versión nueva en el despliegue, el mapa la ofrece', async ({ page }) => {
    await abrir(page, '/ajustes');
    await expect(page.getByText(/Descargado · /)).toBeVisible({ timeout: 20_000 });
    // Lo descargado es de una versión anterior a la del despliegue.
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('hidrantes.mapabase')!);
      localStorage.setItem('hidrantes.mapabase', JSON.stringify({ ...d, version: '2000-01-01' }));
    });
    await page.goto('/');
    const aviso = page.getByTestId('aviso-mapabase');
    await expect(aviso).toContainText(T.ajustes.versionNuevaMapa);
    await expect(aviso.getByRole('button', { name: T.mapa.descargarVersionNueva })).toBeVisible();
    await aviso.getByRole('button', { name: T.mapa.ocultarAviso }).click();
    await expect(aviso).toHaveCount(0);
    await page.getByRole('link', { name: T.navegacion.lista }).click();
    await page.getByRole('link', { name: T.navegacion.mapa }).click();
    await expect(page.getByTestId('aviso-mapabase')).toHaveCount(0);
  });
});

test('la foto de la ficha se pide en modo cors (RV-12)', async ({ page }) => {
  const conFoto = { ...PUNTOS[0], foto_path: 'fotos/prueba-cors.jpg' };
  await conSesion(page);
  await simularRpc(page, {
    fn_listar_puntos: { ...LISTADO, puntos: [conFoto, ...PUNTOS.slice(1)] },
    fn_registrar_error: null,
  });
  // Una <img> sin crossOrigin pide en modo no-cors y no manda Origin; con crossOrigin, sí. (La
  // intercepción de Playwright no ve las cabeceras sec-fetch-*.)
  const origenes: string[] = [];
  await page.route('**/storage/v1/object/public/**', async (r) => {
    origenes.push((await r.request().allHeaders()).origin ?? '');
    await r.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      headers: { 'access-control-allow-origin': '*' },
      body: Buffer.from(
        '/9j/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKAAAf/Z',
        'base64',
      ),
    });
  });
  await page.goto(`/?p=${conFoto.id}`);
  await expect(page.getByRole('img', { name: conFoto.codigo })).toBeVisible();
  await expect.poll(() => origenes.length).toBeGreaterThan(0);
  expect(origenes.filter((o) => !o)).toEqual([]);
});

test.describe('zoom (#136)', () => {
  // El ZOOM_MAX de src/lib/capas.ts. Aquí va el número y no el import porque este archivo se compila
  // con la resolución de Node y capas.ts importa sin extensión; capas.test.ts fija que sigan siendo
  // el mismo 21.
  const TOPE = 21;
  // Una tesela de 1×1 en JPEG: lo que se comprueba es que la capa sigue puesta al tope de zoom, no
  // lo que dibuja el IGN. Así el test no depende de www.ign.es.
  const TESELA = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////' +
      '////////////////////////2wBDAf//////////////////////////////////////////////////////////' +
      '///////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEA' +
      'AAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhED' +
      'EQA/AKAAAf/Z',
    'base64',
  );

  async function conSatelite(page: Page) {
    await page.route('https://www.ign.es/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: TESELA }));
    await abrir(page);
    await page.getByRole('button', { name: T.mapa.capas }).click();
    await page.getByRole('radio', { name: new RegExp(T.mapa.satelitePnoa.replace(/[()]/g, '\\$&')) }).click();
    await expect(page.getByText(/Instituto Geográfico Nacional/)).toBeVisible();
  }

  const zoomGuardado = (page: Page) =>
    page.evaluate(() => (JSON.parse(localStorage.getItem('hidrantes.vista') ?? 'null')?.zoom ?? 0) as number);

  test('se puede acercar hasta el tope y el satélite no se queda en blanco', async ({ page }) => {
    await conSatelite(page);
    const acercar = page.getByRole('button', { name: T.mapa.acercar });
    // Se pulsa dentro del poll porque Leaflet ignora los clics mientras dura su animación de zoom.
    await expect
      .poll(
        async () => {
          await acercar.click();
          return zoomGuardado(page);
        },
        { timeout: 20_000, intervals: [250] },
      )
      .toBe(TOPE);
    // Y al tope sigue habiendo teselas: la capa no ha desaparecido (que era el fondo blanco).
    const teselas = page.locator('img.leaflet-tile');
    await expect.poll(() => teselas.count()).toBeGreaterThan(0);
    // Las pide del último nivel que el IGN tiene (z20) y las amplía: a z21 responde 400.
    await expect(teselas.first()).toHaveAttribute('src', /tilematrix=20&/);
    // Más allá del tope no se pasa, por mucho que se insista.
    await acercar.click();
    await acercar.click();
    expect(await zoomGuardado(page)).toBe(TOPE);
  });
});

test.describe('alta con pulsación larga (#138)', () => {
  /** Lo que hace un dedo que se queda quieto: pointerdown, esperar, pointerup. */
  async function mantenerPulsado(page: Page, x: number, y: number, ms = 700) {
    await page.locator('[data-testid="mapa"]').dispatchEvent('pointerdown', {
      clientX: x,
      clientY: y,
      pointerType: 'touch',
      isPrimary: true,
    });
    await page.waitForTimeout(ms);
    // Si la pulsación ya ha abierto el alta, el mapa ya no está: levantar el dedo sobra.
    await page
      .locator('[data-testid="mapa"]')
      .dispatchEvent('pointerup', { clientX: x, clientY: y }, { timeout: 1000 })
      .catch(() => {});
  }

  test('mantener pulsado el mapa abre el alta con el pin ahí mismo', async ({ page }) => {
    await abrir(page);
    const caja = (await page.locator('[data-testid="mapa"]').boundingBox())!;
    await mantenerPulsado(page, caja.x + caja.width / 2, caja.y + caja.height / 2);

    await expect(page).toHaveURL(/\/proponer\/alta\?lat=-?\d+\.\d{6}&lng=-?\d+\.\d{6}/);
    await expect(page.getByTestId('selector-pin')).toBeVisible();
    // Y el punto es el del centro del mapa, que es donde se pulsó.
    const url = new URL(page.url());
    expect(Number(url.searchParams.get('lat'))).toBeGreaterThan(37);
    expect(Number(url.searchParams.get('lng'))).toBeLessThan(-3);
  });

  test('un toque corto no abre nada: eso es mirar el mapa', async ({ page }) => {
    await abrir(page);
    const caja = (await page.locator('[data-testid="mapa"]').boundingBox())!;
    await mantenerPulsado(page, caja.x + caja.width / 2, caja.y + caja.height / 2, 150);
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(/\/$|\/\?/);
  });

  test('sobre un marcador no: ahí lo que toca es abrir la ficha', async ({ page }) => {
    await abrir(page);
    const marcador = page.locator('.marcador').first();
    const caja = (await marcador.boundingBox())!;
    await marcador.dispatchEvent('pointerdown', {
      clientX: caja.x + caja.width / 2,
      clientY: caja.y + caja.height / 2,
      pointerType: 'touch',
      isPrimary: true,
    });
    await page.waitForTimeout(900);
    await expect(page).not.toHaveURL(/\/proponer/);
  });

  test('en escritorio, el clic derecho hace lo mismo', async ({ page }) => {
    await abrir(page);
    const caja = (await page.locator('[data-testid="mapa"]').boundingBox())!;
    await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2, { button: 'right' });
    await expect(page).toHaveURL(/\/proponer\/alta\?lat=/);
  });
});

test('Ajustes enseña tres novedades de la versión instalada (AC-127, RV-20)', async ({ page }) => {
  const novedades = novedadesDe(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  expect(novedades.lineas).toHaveLength(3);
  await abrir(page);
  // Versión nueva sin ver: un punto en la pestaña de Ajustes hasta abrirlo.
  await expect(page.getByTestId('punto-novedades')).toBeVisible();
  await page.getByRole('link', { name: T.navegacion.ajustes }).click();
  const bloque = page.getByTestId('novedades');
  for (const linea of novedades.lineas) await expect(bloque.getByText(linea)).toBeVisible();
  await expect(page.getByText(T.ajustes.nuevo, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: T.navegacion.mapa }).click();
  await expect(page.getByTestId('punto-novedades')).toHaveCount(0);
});

test('cada fila de la lista enseña la última revisión (RV-24, FR-68)', async ({ page }) => {
  await abrir(page, '/lista');
  const filas = page.locator('ul li button');
  await expect(filas.first()).toBeVisible();
  const n = await filas.count();
  for (let i = 0; i < n; i++) await expect(filas.nth(i)).toContainText(/revisado hace|Sin revisar/);
  await expect(page.getByRole('button', { name: /HID-9005/ })).toContainText(T.mapa.sinRevisar);
});

// FR-65 (RV-30): "Mi posición" centra el mapa en ti y dibuja el halo de precisión.
test('el botón de centrar lleva a la posición y dibuja el halo (FR-65)', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2381, longitude: -3.6494, accuracy: 25 });
  await abrir(page);
  await page.getByRole('button', { name: T.mapa.miPosicion }).click();
  const halo = page.locator('path.halo');
  await expect(halo).toHaveCount(1);
  // El halo queda en el centro de la parte visible del mapa: el mapa se ha movido a la posición.
  await expect
    .poll(async () => {
      const mapa = (await page.getByTestId('mapa').boundingBox())!;
      const alto = page.viewportSize()!.height;
      const visible = { x: mapa.x, y: mapa.y, w: mapa.width, h: Math.min(mapa.y + mapa.height, alto) - mapa.y };
      const h = (await halo.boundingBox())!;
      return Math.hypot(
        h.x + h.width / 2 - (visible.x + visible.w / 2),
        h.y + h.height / 2 - (visible.y + visible.h / 2),
      );
    })
    .toBeLessThan(80);
});

// docs/18 RV-42: la nota de fallo solo se enseña mientras el punto no funciona.
test('un punto bueno con descripcion_fallo antigua no la enseña', async ({ page }) => {
  const bueno = PUNTOS.find((p) => p.caudal === 'bueno')!;
  const conNotaVieja = { ...bueno, descripcion_fallo: 'Tapa soldada' };
  const noFunciona = PUNTOS.find((p) => p.caudal === 'no_funciona')!;
  const conNota = { ...noFunciona, descripcion_fallo: 'Sin presión' };
  await conSesion(page);
  await simularRpc(page, {
    fn_listar_puntos: {
      ...LISTADO,
      puntos: PUNTOS.map((p) => (p.id === bueno.id ? conNotaVieja : p.id === noFunciona.id ? conNota : p)),
    },
    fn_registrar_error: null,
  });
  await page.goto(`/?p=${bueno.id}`);
  await expect(page.getByRole('heading', { name: bueno.codigo })).toBeVisible();
  await expect(page.getByText('Tapa soldada')).toHaveCount(0);
  await page.goto(`/?p=${noFunciona.id}`);
  await expect(page.getByText('Sin presión')).toBeVisible();
});
