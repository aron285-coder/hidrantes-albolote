// AC-140 · TR-110 · UI-01: ningún control muerto. Un recorrido que pulsa, uno por uno, todos los
// controles visibles de cada pantalla y comprueba que algo cambia: la pantalla, un diálogo o un
// aviso. Es la prueba que pide 03 §11 y la única forma de que un botón que dejó de hacer algo —
// porque se le quitó el `onClick`, porque la ruta cambió— no llegue a la calle sin que nadie lo note.
//
// Cada pulsación parte de la pantalla recién cargada: así un control no depende de lo que hiciera el
// anterior y el fallo dice exactamente cuál se quedó mudo.

import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { conGoogle, conSesion, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { T } from '../src/lib/textos.ts';
import mapabase from '../datos/mapabase.json' with { type: 'json' };

// Con el permiso de ubicación concedido, como lo tendrá un voluntario que acepte la primera vez: si
// no, el aviso de "sin permiso" ya está en pantalla antes de pulsar y no se podría distinguir un
// botón que no hace nada de uno cuyo efecto ya se está viendo.
test.use({ permissions: ['geolocation'], geolocation: { latitude: 37.2309, longitude: -3.6558 } });

// El recorrido recarga la pantalla antes de cada pulsación, y hay pantallas con veinte controles:
// tarda más que una prueba normal a propósito, porque la alternativa es no comprobarlo.
test.describe.configure({ timeout: 180_000 });

/** Controles que no se pulsan, con el motivo. No es una lista de excepciones a UI-01: se comprueban
 *  en su propia prueba, donde se puede preparar lo que hace falta. */
const NO_SE_PULSAN = new Map<string, string>([
  [T.ajustes.descargar, 'se traería el mapa base entero (megas) desde una red simulada'],
  [T.ajustes.actualizar, 'ídem'],
  // El aviso del mapa base en el propio mapa (RV-10): se comprueba en mapa.spec.ts, con el archivo
  // retenido para ver el progreso.
  [T.mapa.descargarMapabase((mapabase.bytes / 1024 / 1024).toFixed(1).replace('.', ',')), 'ídem'],
  [T.mapa.descargarVersionNueva, 'ídem'],
  [T.ficha.comoLlegar, 'abre la aplicación de mapas del móvil, fuera del navegador (FR-161)'],
  // El menú de compartir del móvil también queda fuera de la página; sin él, copia y avisa. Lo
  // cubren los tests de compartir de mapa.spec.ts (FR-75).
  [T.compartir.boton, 'abre el menú de compartir del móvil, fuera del navegador (FR-75)'],
  [T.aqui.compartirUbicacion, 'ídem'],
  [T.incidente.compartirIncidente, 'ídem'],
]);

const RESPUESTAS = {
  fn_listar_puntos: LISTADO,
  fn_ficha_punto: PUNTOS[0],
  fn_mis_propuestas: [],
  fn_registrar_error: null,
  fn_reportar_incidencia: '0f1e2d3c-4b5a-4968-8776-6a5b4c3d2e1f',
};

interface Pantalla {
  nombre: string;
  ruta: string;
  /** Algo que solo está cuando la pantalla ha terminado de montarse. */
  listo: (page: Page) => Locator;
  sesion?: boolean;
  /** Lo que hay que hacer, ya montada, para llegar al estado que se recorre (escribir en la búsqueda). */
  preparar?: (page: Page) => Promise<void>;
}

const PANTALLAS: Pantalla[] = [
  { nombre: 'entrada', ruta: '/', listo: (p) => p.getByLabel(T.entrada.nombre), sesion: false },
  { nombre: 'mapa', ruta: '/', listo: (p) => p.getByTestId('mapa') },
  { nombre: 'lista', ruta: '/lista', listo: (p) => p.getByPlaceholder(T.mapa.buscar) },
  { nombre: 'ficha', ruta: `/?p=${PUNTOS[0].id}`, listo: (p) => p.getByRole('article') },
  { nombre: 'alta', ruta: '/proponer/alta', listo: (p) => p.getByTestId('selector-pin') },
  // docs/18 GM-06: la barra de la medición.
  { nombre: 'medir', ruta: '/?medir=1', listo: (p) => p.getByRole('region', { name: T.medir.titulo }) },
  // docs/18 GM-03: el modo incidente, con su hoja de cercanos.
  {
    nombre: 'incidente',
    ruta: '/?incidente=37.230500,-3.656000',
    listo: (p) => p.getByRole('region', { name: T.incidente.titulo }),
  },
  // docs/18 GM-04: la búsqueda con coordenadas, puntos, calles y una dirección simulada.
  {
    nombre: 'búsqueda',
    ruta: '/',
    listo: (p) => p.getByTestId('mapa'),
    preparar: async (p) => {
      await p.route('**/api/geocodificar', (r) =>
        r.fulfill({
          json: {
            resultados: [
              {
                etiqueta: 'Calle Real, 12, Albolote',
                tipo: 'portal',
                lat: 37.231929,
                lng: -3.657528,
                municipio: 'albolote',
              },
            ],
            fuente: 'CartoCiudad (IGN/CNIG)',
          },
        }),
      );
      await p.getByRole('searchbox', { name: T.mapa.buscar }).fill('real 12');
      await expect(p.getByRole('group', { name: T.busqueda.direcciones }).getByRole('button')).toBeVisible();
    },
  },
  // docs/18 GM-02: la hoja de la pulsación larga.
  {
    nombre: 'qué hay aquí',
    ruta: '/?aqui=37.2305,-3.656',
    listo: (p) => p.getByRole('dialog', { name: T.aqui.titulo }),
  },
  { nombre: 'mis propuestas', ruta: '/mis-propuestas', listo: (p) => p.getByRole('heading').first() },
  { nombre: 'ajustes', ruta: '/ajustes', listo: (p) => p.getByText(T.ajustes.firma) },
  { nombre: 'incidencia', ruta: '/incidencia', listo: (p) => p.getByLabel(T.incidencia.queHaPasado) },
];

/**
 * Servidor simulado que tarda un poco, como uno de verdad. Con respuestas instantáneas, estados como
 * "Sincronizando…" nacen y mueren dentro del mismo fotograma y no habría forma de ver que el control
 * hizo algo; en la calle, con 3G, ese aviso se ve siempre.
 */
async function simularRpcLento(page: Page, respuestas: Record<string, unknown>, ms = 150) {
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, async (route: Route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    await new Promise((listo) => setTimeout(listo, ms));
    if (nombre in respuestas) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respuestas[nombre]) });
    }
    return route.abort('connectionrefused');
  });
}

/** Lo que una persona puede pulsar: botones y enlaces visibles y habilitados. */
const pulsables = (page: Page) => page.locator('button:not([disabled]), a[href]').filter({ visible: true });

/**
 * ¿Se puede pulsar de verdad? Dos cosas no cuentan como control muerto y hay que descartarlas antes:
 * lo que está tapado por otra capa (la ficha a pantalla completa cubre la navegación de abajo) y lo
 * que ya está elegido (pulsar la opción activa de un segmentado o el destino en el que ya estás no
 * tiene por qué cambiar nada).
 */
const cuenta = (control: Locator) =>
  control
    .evaluate(
      (e) => {
        if (e.getAttribute('aria-current') || e.getAttribute('aria-checked') === 'true') return false;
        if (e.getAttribute('aria-selected') === 'true') return false;
        const c = e.getBoundingClientRect();
        const encima = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
        return !!encima && (e.contains(encima) || encima.contains(e));
      },
      undefined,
      { timeout: 5000 },
    )
    // Si el control ya no está (la pantalla se ha vuelto a pintar con menos filas), no se pulsa.
    .catch(() => false);

async function abrir(page: Page, pantalla: Pantalla) {
  await page.goto(pantalla.ruta);
  await expect(pantalla.listo(page)).toBeVisible();
  await pantalla.preparar?.(page);
  // El mapa sigue pintando teselas un rato; sin esta pausa, el "algo ha cambiado" podría ser el mapa
  // y no el control que se acaba de pulsar.
  await page.waitForTimeout(300);
  // Y la pantalla crece cuando llegan los puntos: se espera a que el número de controles se quede
  // quieto, para que el que se va a pulsar sea el que se contó.
  for (let previo = -1, i = 0; i < 20; i++) {
    const n = await pulsables(page).count();
    if (n === previo) return;
    previo = n;
    await page.waitForTimeout(150);
  }
}

/** Nombre accesible con el que una persona reconocería el control. */
async function nombreDe(control: Locator): Promise<string> {
  const etiqueta = (await control.getAttribute('aria-label')) ?? '';
  const texto = (await control.textContent()) ?? '';
  const titulo = (await control.getAttribute('title')) ?? '';
  return (etiqueta || texto || titulo).replace(/\s+/g, ' ').trim();
}

/** Los nombres de los controles de la pantalla, en orden. */
async function nombresDe(page: Page): Promise<string[]> {
  const controles = pulsables(page);
  const total = await controles.count();
  const nombres: string[] = [];
  for (let i = 0; i < total; i++) nombres.push(await nombreDe(controles.nth(i)));
  return nombres;
}

/**
 * Dónde está ahora el control que se llamaba así. Se busca por nombre y no por posición porque la
 * pantalla se vuelve a montar antes de cada pulsación y no siempre en el mismo orden (una foto que
 * llega tarde añade botones); con la posición se acabaría pulsando otra cosa y culpando a esta.
 */
async function indiceDe(page: Page, nombre: string, repeticion: number): Promise<number> {
  let vistas = 0;
  for (const [i, n] of (await nombresDe(page)).entries()) {
    if (n !== nombre) continue;
    if (vistas === repeticion) return i;
    vistas++;
  }
  return -1;
}

/**
 * El recorrido: pulsa uno a uno los controles de la pantalla recién cargada y exige que cada uno
 * cambie algo. Los de `noSePulsan` se saltan con su motivo; los de `descargas` cuentan si sale
 * una descarga (su efecto es un archivo, no el DOM).
 */
async function recorrer(
  page: Page,
  pantalla: Pantalla,
  noSePulsan: Map<string, string>,
  descargas = new Set<string>(),
  /** Veces que se pulsa un control repetido (la misma acción en cada fila de una tabla). */
  maxRepeticiones = Infinity,
) {
  const nombres = await nombresDe(page);

  const mudos: string[] = [];
  const repeticiones = new Map<string, number>();
  let pulsados = 0;
  for (const nombre of nombres) {
    const repeticion = repeticiones.get(nombre) ?? 0;
    repeticiones.set(nombre, repeticion + 1);
    if (noSePulsan.has(nombre) || repeticion >= maxRepeticiones) continue;
    await abrir(page, pantalla);
    const i = await indiceDe(page, nombre, repeticion);
    if (i < 0) continue; // ya no está en la pantalla recién cargada
    const control = pulsables(page).nth(i);
    if (!(await cuenta(control))) continue;

    const antes = { url: page.url(), html: await page.locator('body').innerHTML() };
    // Abrir la cámara o el carrete es cosa del móvil, no del DOM: si sale el selector de
    // archivos, el control ha hecho lo suyo (FR-21).
    const selector = page.waitForEvent('filechooser', { timeout: 3000 }).then(
      () => true,
      () => false,
    );
    const descarga = descargas.has(nombre)
      ? page.waitForEvent('download', { timeout: 5000 }).then(
          () => true,
          () => false,
        )
      : Promise.resolve(false);
    // Un control puede desaparecer al pulsarlo (una hoja que se cierra): se pulsa a la fuerza,
    // sin esperar a que siga ahí después.
    await control.click({ timeout: 5000 }).catch(() => undefined);
    pulsados++;

    const cambio = await page
      .waitForFunction(
        ([url, html]) => location.href !== url || document.body.innerHTML !== html,
        [antes.url, antes.html] as const,
        { timeout: 3000 },
      )
      .then(() => true)
      .catch(() => selector);
    if (!(await cambio) && !(await descarga)) mudos.push(nombre);
  }
  expect(pulsados, `${pantalla.nombre} · no se ha llegado a pulsar nada`).toBeGreaterThan(0);
  expect(mudos, `${pantalla.nombre} · controles que no hacen nada al pulsarlos`).toEqual([]);
}

for (const pantalla of PANTALLAS) {
  test.describe(`controles de ${pantalla.nombre}`, () => {
    test.beforeEach(async ({ page }) => {
      if (pantalla.sesion !== false) await conSesion(page);
      await simularRpcLento(page, RESPUESTAS);
    });

    // UI-22 y accesibilidad: un control sin nombre no se puede ni decir en voz alta.
    test('todos tienen nombre', async ({ page }) => {
      await abrir(page, pantalla);
      const controles = pulsables(page);
      const total = await controles.count();
      expect(total, `${pantalla.nombre} no tiene ningún control`).toBeGreaterThan(0);

      const mudos: string[] = [];
      for (let i = 0; i < total; i++) {
        const control = controles.nth(i);
        if (!(await nombreDe(control))) mudos.push(await control.evaluate((e) => e.outerHTML.slice(0, 120)));
      }
      expect(mudos, `${pantalla.nombre} · controles sin nombre accesible`).toEqual([]);
    });

    // El recorrido completo, solo en el móvil: es donde se usa la aplicación, cada pulsación exige
    // recargar la pantalla y repetirlo en escritorio duplicaría el tiempo de CI para comprobar el
    // mismo código. Lo propio del escritorio (lista lateral y ficha flotante) lo cubre anchos.spec.ts (FR-70).
    test('ninguno se queda mudo al pulsarlo (UI-01)', async ({ page, isMobile }) => {
      test.skip(!isMobile, 'el recorrido completo se hace en el móvil');
      await abrir(page, pantalla);
      await recorrer(page, pantalla, NO_SE_PULSAN);
    });
  });
}

// ---------- panel de jefatura (AC-140, docs/17 RV-30) ----------

const PANTALLAS_PANEL: Pantalla[] = [
  { nombre: 'cola', ruta: '/admin/cola', listo: (p) => p.getByRole('region', { name: T.panelCola.colaRevision }) },
  {
    nombre: 'inventario',
    ruta: '/admin/inventario',
    listo: (p) => p.getByText(T.panel.mostrando(PUNTOS.length, PUNTOS.length)),
  },
  { nombre: 'caducadas', ruta: '/admin/caducadas', listo: (p) => p.getByRole('main') },
  { nombre: 'registro', ruta: '/admin/registro', listo: (p) => p.getByRole('main') },
  { nombre: 'voluntarios', ruta: '/admin/voluntarios', listo: (p) => p.getByRole('main') },
  { nombre: 'papelera', ruta: '/admin/papelera', listo: (p) => p.getByRole('main') },
  { nombre: 'ajustes', ruta: '/admin/ajustes', listo: (p) => p.getByRole('region', { name: T.panel.saludSistema }) },
];

/** Controles del panel cuyo efecto es un archivo: se pulsan y se espera la descarga. */
const DESCARGAS_PANEL = new Set([T.panel.excel, T.panel.csv, T.panel.geojson, T.panel.descargarInventario]);

/** Controles del panel que no se pulsan en el recorrido, con el motivo. */
const NO_SE_PULSAN_PANEL = new Map<string, string>([
  [T.jefatura.irAlMapa, 'sale del panel a la app; lo cubre acceso.spec.ts'],
  [T.ajustes.cerrarSesionGoogle, 'cierra la sesión y deja el panel; lo cubre acceso.spec.ts'],
  [T.panel.salir, 'ídem, desde la cabecera del panel'],
]);

async function prepararPanel(page: Page) {
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: [],
    v_registro: [],
    propuestas: [],
    puntos: [],
    incidencias_app: [],
    config: [],
    administradores: [
      { email: 'jefe@example.org', activo: true, creado_en: '2026-08-01T10:00:00Z', creado_por: 'migracion' },
    ],
    dispositivos: [],
    nucleos: [],
  });
  await simularRpcLento(page, {
    fn_es_admin: true,
    fn_salud: { pendientes_14d: 0, incidencias_abiertas: 0, errores_7d: 0, sin_direccion: 0, dispositivos_activos: 3 },
    fn_actividad_voluntarios: [],
    fn_exportar_inventario: [],
    fn_registrar_error: null,
  });
  await page.route('**/api/push', (r) => r.fulfill({ contentType: 'application/json', body: '{"enviadas":0}' }));
  await page.route('**/api/lanzar-workflow', (r) =>
    r.fulfill({ contentType: 'application/json', status: 202, body: '{"lanzada":true}' }),
  );
}

for (const pantalla of PANTALLAS_PANEL) {
  test.describe(`controles del panel · ${pantalla.nombre}`, () => {
    test.beforeEach(async ({ page }) => prepararPanel(page));

    test('todos tienen nombre', async ({ page, isMobile }) => {
      test.skip(!!isMobile, 'el panel es de escritorio (FR-100)');
      await abrir(page, pantalla);
      const controles = pulsables(page);
      const total = await controles.count();
      const mudos: string[] = [];
      for (let i = 0; i < total; i++) {
        const control = controles.nth(i);
        if (!(await nombreDe(control))) mudos.push(await control.evaluate((e) => e.outerHTML.slice(0, 120)));
      }
      expect(mudos, `panel ${pantalla.nombre} · controles sin nombre accesible`).toEqual([]);
    });

    test('ninguno se queda mudo al pulsarlo (UI-01)', async ({ page, isMobile }) => {
      test.skip(!!isMobile, 'el panel es de escritorio (FR-100)');
      await abrir(page, pantalla);
      // En las tablas del panel cada fila repite las mismas acciones: con la primera basta.
      await recorrer(page, pantalla, NO_SE_PULSAN_PANEL, DESCARGAS_PANEL, 1);
    });
  });
}
