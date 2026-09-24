// El presupuesto de rendimiento que se puede medir en CI (TR-10, TR-14), con la red frenada a 3G:
// 1,6 Mbit/s y 300 ms de latencia, como dice 03. Lo mide en el móvil emulado, que es donde importa.
//
// TR-11 (tamaño del JavaScript inicial) lo mide `npm run presupuesto`; TR-13 (búsqueda con 1.000
// puntos), los unitarios de src/lib/rendimiento.test.ts; TR-12 (fluidez al arrastrar el mapa) pide
// un móvil real y se anota a mano en la verificación de la fase.

import { expect, test, type Page } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { conGoogle, conSesion, simularRpc, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';

/** 3G de 03: 1,6 Mbit/s de bajada, 750 kbit/s de subida, 300 ms de ida y vuelta. */
async function frenarA3G(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 300,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

/** Mil puntos como los que habrá dentro de unos años, con los campos que usa el mapa. */
function milPuntos() {
  const base = PUNTOS[0];
  return Array.from({ length: 1000 }, (_, i) => ({
    ...base,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    codigo: `HID-${String(i + 1).padStart(4, '0')}`,
    descripcion: `[PRUEBA] Punto ${i}`,
    direccion: `Calle Prueba ${i}`,
    lat: 37.2 + (i % 100) * 0.0004,
    lng: -3.66 + Math.floor(i / 100) * 0.0004,
  }));
}

/**
 * Doscientas propuestas pendientes, que es el atasco del que habla TR-16: una semana de piloto sin
 * que jefatura entre a moderar. Cada una con su diff y sus señales, como las de verdad.
 */
function doscientasPropuestas() {
  const punto = PUNTOS[0];
  return Array.from({ length: 200 }, (_, i) => ({
    id: `c${i}`,
    operacion: (['alta', 'revision', 'estado', 'datos', 'ubicacion', 'retirada'] as const)[i % 6],
    estado: 'pendiente',
    creada_en: new Date(Date.now() - i * 60_000).toISOString(),
    autor_nombre: 'Voluntaria',
    autor_apellido: `Prueba ${i}`,
    dispositivo_id: `d${i % 20}`,
    punto_id: punto.id,
    codigo: punto.codigo,
    tipo_actual: punto.tipo,
    datos: { caudal: 'regular', nota: `[PRUEBA] ${i}` },
    antes: { caudal: 'bueno' },
    despues: { caudal: 'regular' },
    foto_path: null,
    foto_path_actual: null,
    direccion_sugerida: null,
    direccion_actual: `Calle Prueba ${i}`,
    lat: punto.lat,
    lng: punto.lng,
    origen_ubicacion: 'gps',
    precision_gps_m: 8,
    distancia_gps_m: 3,
    distancia_exif_m: null,
    fuera_de_zona: false,
    meses_desde_revision: 13,
    duplicado_de: null,
    distancia_duplicado_m: null,
    codigo_duplicado: null,
    otra_medida: false,
    desactualizada: false,
    nucleo: 'Albolote',
    punto_actualizado_en: null,
  }));
}

// El panel es de escritorio (FR-100) y la cola se mide sin frenar la red: TR-16 habla de banda
// ancha, así que lo que se está midiendo es lo que tarda el panel en pintar doscientas propuestas.
// @rendimiento: miden tiempos y compiten por CPU con otros workers; se corren aparte y de uno en uno
// (npm run e2e, RV-27).
test.describe('presupuesto del panel @rendimiento', () => {
  test.skip(({ isMobile }) => !!isMobile, 'el panel se mide en escritorio');

  test('la cola con 200 propuestas pendientes se ve en menos de 2 s (TR-16)', async ({ page }) => {
    await conGoogle(page, 'jefa@example.org');
    const propuestas = doscientasPropuestas();
    await simularTablas(page, {
      v_puntos_activos: PUNTOS,
      v_cola_revision: propuestas,
      // El contador de la pestaña sale de un HEAD con count sobre propuestas (FR-110).
      propuestas: (url) => (url.searchParams.get('estado') === 'eq.pendiente' ? propuestas : []),
    });
    await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (r) =>
      r.fulfill({ contentType: 'application/json', body: 'true' }),
    );

    const lista = page.getByRole('region', { name: T.panelCola.colaRevision });
    const contador = page.getByRole('link', { name: `${T.panelCola.colaRevision} 200` });
    const cargada = async () => {
      await expect(lista.getByRole('button').first()).toBeVisible();
      await expect(contador).toBeVisible();
    };

    // La primera vez se descarga y se compila todo el panel; lo que mide TR-16 es lo de después:
    // abrir la cola y pintar las doscientas. El número en frío se imprime igual, para tenerlo.
    const frio = Date.now();
    await page.goto('/admin/cola');
    await cargada();
    console.log(`TR-16 · cola con 200 propuestas, primera carga: ${((Date.now() - frio) / 1000).toFixed(2)} s`);

    const empezado = Date.now();
    await page.reload();
    await cargada();
    const tardado = Date.now() - empezado;

    console.log(`TR-16 · cola con 200 propuestas: ${(tardado / 1000).toFixed(2)} s`);
    expect(tardado).toBeLessThan(2000);
  });
});

// Solo en el móvil emulado: en escritorio el mismo frenado mediría otra cosa y duplicaría el tiempo
// de CI sin decir nada nuevo.
test.describe('presupuesto de rendimiento @rendimiento', () => {
  test.skip(({ isMobile }) => !isMobile, 'se mide en el móvil emulado');

  test('la primera pantalla útil llega en menos de 3 s con 3G (TR-10)', async ({ page }) => {
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await frenarA3G(page);

    const empezado = Date.now();
    await page.goto('/');
    // Útil = el mapa con sus puntos, no un armazón vacío (TR-10).
    await expect(page.getByTestId('mapa')).toBeVisible();
    await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
    const tardado = Date.now() - empezado;

    console.log(`TR-10 · primera pantalla útil con 3G: ${(tardado / 1000).toFixed(2)} s`);
    expect(tardado).toBeLessThan(3000);
  });

  // docs/20 RV-80: con `lazy` y `Suspense`, React 19 dejaba "Cargando…" al menos 300 ms aunque la
  // porción con sesión ya estuviera descargada por la precarga. Se mide en la página, cuadro a cuadro,
  // para no depender de cada cuánto mira Playwright.
  test('con sesión, "Cargando…" no se queda a la vista cuando la porción ya ha llegado (RV-80)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { marcas: { cargando?: number; mapa?: number } };
      w.marcas = {};
      const mirar = () => {
        const texto = document.body?.innerText ?? '';
        if (w.marcas.cargando === undefined && texto.includes('Cargando…')) w.marcas.cargando = performance.now();
        if (document.querySelector('[data-testid=mapa]')) w.marcas.mapa = performance.now();
        else requestAnimationFrame(mirar);
      };
      requestAnimationFrame(mirar);
    });
    await conSesion(page);
    await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
    await frenarA3G(page);
    await page.goto('/');
    await expect(page.getByTestId('mapa')).toBeVisible();
    const { cargando, mapa } = await page.evaluate(
      () => (window as unknown as { marcas: { cargando?: number; mapa: number } }).marcas,
    );
    const visto = cargando === undefined ? 0 : mapa - cargando;
    console.log(`RV-80 · "Cargando…" a la vista: ${Math.round(visto)} ms`);
    expect(visto).toBeLessThan(250);
  });

  test('sincronizar 1.000 puntos con 3G termina en menos de 10 s (TR-14)', async ({ page }) => {
    const puntos = milPuntos();
    await conSesion(page);
    await simularRpc(page, {
      fn_listar_puntos: { ...LISTADO, puntos, sincronizado_en: '2026-09-19T10:00:00Z' },
      fn_registrar_error: null,
    });
    await frenarA3G(page);

    const empezado = Date.now();
    await page.goto('/');
    await expect(page.getByText(T.mapa.nPuntos(1000), { exact: false })).toBeVisible({ timeout: 30_000 });
    const tardado = Date.now() - empezado;

    console.log(`TR-14 · 1.000 puntos sincronizados con 3G: ${(tardado / 1000).toFixed(2)} s`);
    expect(tardado).toBeLessThan(10_000);
  });

  test('con 1.000 puntos, buscar en el móvil responde al momento (TR-13 en pantalla)', async ({ page }) => {
    const puntos = milPuntos();
    await conSesion(page);
    await simularRpc(page, {
      fn_listar_puntos: { ...LISTADO, puntos, sincronizado_en: '2026-09-19T10:00:00Z' },
      fn_registrar_error: null,
    });
    await page.goto('/');
    await expect(page.getByText(T.mapa.nPuntos(1000), { exact: false })).toBeVisible({ timeout: 30_000 });

    // La búsqueda es local: sin red de por medio, el límite de TR-13 es el del algoritmo.
    const empezado = Date.now();
    await page.getByPlaceholder(T.mapa.buscar).fill('HID-0500');
    await expect(page.getByText('HID-0500').first()).toBeVisible();
    expect(Date.now() - empezado).toBeLessThan(1000);
  });
});

// TR-117: el callejero no forma parte del arranque. El Service Worker lo precachea por su cuenta; la
// página solo lo pide cuando se usa la búsqueda.
test('el callejero no se pide al arrancar, solo al buscar (TR-117) @rendimiento', async ({ page }) => {
  const pedidos: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/callejero.json')) pedidos.push(r.url());
  });
  await conSesion(page);
  await simularRpc(page, { fn_listar_puntos: LISTADO, fn_registrar_error: null });
  await page.goto('/');
  await expect(page.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(pedidos).toEqual([]);
  const callejero = page.waitForResponse((r) => r.url().endsWith('/callejero.json'));
  await page.getByRole('searchbox', { name: T.mapa.buscar }).fill('real');
  await callejero;
  expect(pedidos).toHaveLength(1);
});

// TR-103: la pantalla de entrada no descarga el mapa (Leaflet y las pantallas con sesión van en la
// porción de RutasDentro) ni el mapa base, que se baja al entrar. Si vuelven al arranque, Lighthouse
// se queda en el umbral de rendimiento y el LCP puede contar los 4 MB del mapa base.
test.describe('la pantalla de entrada no carga el mapa (TR-103)', () => {
  const delMapa = (url: string) => /\/assets\/RutasDentro-|\/mapabase\/albolote\.pmtiles$/.test(url);

  test('sin sesión no se pide la porción con sesión ni el mapa base', async ({ page }) => {
    const pedidos: string[] = [];
    page.on('request', (r) => {
      if (delMapa(r.url())) pedidos.push(r.url());
    });
    await page.goto('/');
    await expect(page.getByLabel(T.entrada.cifra(1))).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(pedidos).toEqual([]);
  });

  // La precarga de config/precarga.ts: con sesión, index.html pide la porción por su cuenta, en
  // paralelo con el JavaScript inicial (TR-10). Se comprueba con el script de entrada bloqueado:
  // así solo puede haberla pedido la precarga, y se ve también que sin sesión no pide nada.
  for (const conCuenta of [true, false]) {
    test(`la precarga ${conCuenta ? 'pide' : 'no pide'} la porción ${conCuenta ? 'con' : 'sin'} sesión`, async ({
      page,
    }) => {
      if (conCuenta) await conSesion(page);
      await page.route(/\/assets\/index-[^/]+\.js$/, (r) => r.abort());
      const pedidos: string[] = [];
      page.on('request', (r) => {
        if (delMapa(r.url())) pedidos.push(r.url());
      });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      expect(pedidos.some((u) => u.includes('/assets/RutasDentro-'))).toBe(conCuenta);
      expect(pedidos.some((u) => u.endsWith('.pmtiles'))).toBe(false);
    });
  }
});
