// docs/21 RV-88: capturas de las pantallas principales, en claro y en oscuro, a 412 × 915 (proyecto
// móvil, Pixel 7) y a 1280 × 800 (escritorio), para que una persona las mire antes de fusionar (skill
// revisar-pantallas). No se comparan con nada: van adjuntas al informe con testInfo.attach, y el
// trabajo ci-vistas las sube como artefacto. Datos simulados (e2e/puntos.ts); nunca un servidor real.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { T } from '../src/lib/textos.ts';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, conSesion, simularRpc, simularTablas } from './ayudas.ts';
import { LISTADO, PUNTOS } from './puntos.ts';

const [P0, P1] = PUNTOS;
const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** Dos propuestas de la cola con los campos de v_cola_revision (05 §6); nombres ficticios. */
function propuesta(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    estado: 'pendiente',
    autor_nombre: 'Voluntaria',
    autor_apellido: 'Pruebas',
    dispositivo_id: 'd1',
    tipo_actual: null,
    foto_path: null,
    foto_path_actual: null,
    direccion_sugerida: null,
    direccion_actual: null,
    lat: null,
    lng: null,
    antes: null,
    despues: null,
    origen_ubicacion: null,
    precision_gps_m: null,
    distancia_gps_m: null,
    distancia_exif_m: null,
    fuera_de_zona: false,
    meses_desde_revision: null,
    duplicado_de: null,
    distancia_duplicado_m: null,
    codigo_duplicado: null,
    otra_medida: false,
    desactualizada: false,
    nucleo: 'Albolote',
    punto_actualizado_en: null,
    ...extra,
  };
}

const COLA = [
  propuesta({
    id: 'v1',
    operacion: 'estado',
    creada_en: hace(2),
    punto_id: P0.id,
    codigo: P0.codigo,
    datos: { caudal: 'regular', nota: 'Sale menos fuerza' },
    antes: { caudal: 'bueno' },
    direccion_actual: P0.direccion,
    meses_desde_revision: 1,
  }),
  propuesta({
    id: 'v2',
    operacion: 'revision',
    creada_en: hace(5),
    punto_id: P1.id,
    codigo: P1.codigo,
    datos: {},
    nucleo: 'El Chaparral',
  }),
];

async function voluntario(page: Page) {
  await conSesion(page);
  await simularRpc(page, {
    fn_listar_puntos: LISTADO,
    fn_ficha_punto: P0,
    fn_mis_propuestas: [],
    fn_registrar_error: null,
  });
}

async function jefatura(page: Page) {
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: COLA,
    propuestas: (url) => (url.searchParams.get('estado') === 'eq.pendiente' ? COLA : []),
    puntos: [],
    config: [],
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    const json = (d: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
    if (nombre === 'fn_es_admin') return json(true);
    if (nombre === 'fn_exportar_inventario') return json(PUNTOS);
    if (nombre === 'fn_registrar_error') return json(null);
    return route.abort('connectionrefused');
  });
  await page.route('**/api/direccion?*', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ direccion: null, fuente: null }) }),
  );
}

interface Vista {
  nombre: string;
  ruta: string;
  preparar: (p: Page) => Promise<void>;
  lista: (p: Page) => Promise<void>;
  /** Solo en escritorio: el panel es de ordenador (FR-100). */
  soloEscritorio?: boolean;
}

const VISTAS: Vista[] = [
  {
    nombre: 'mapa',
    ruta: '/',
    preparar: voluntario,
    lista: (p) => expect(p.getByText(T.mapa.nPuntos(PUNTOS.length), { exact: false })).toBeVisible(),
  },
  {
    nombre: 'mapa-incidente',
    ruta: `/?incidente=${P0.lat.toFixed(6)},${P0.lng.toFixed(6)}`,
    preparar: voluntario,
    lista: (p) =>
      expect(p.getByRole('region', { name: T.incidente.titulo }).getByRole('listitem').first()).toBeVisible(),
  },
  {
    nombre: 'mapa-ficha',
    ruta: `/?p=${P0.id}`,
    preparar: voluntario,
    lista: (p) => expect(p.getByRole('article')).toBeVisible(),
  },
  {
    nombre: 'lista',
    ruta: '/lista',
    preparar: voluntario,
    lista: (p) => expect(p.getByRole('button', { name: new RegExp(P0.codigo) }).first()).toBeVisible(),
  },
  {
    nombre: 'ajustes',
    ruta: '/ajustes',
    preparar: voluntario,
    lista: (p) => expect(p.getByText(T.ajustes.firma)).toBeVisible(),
  },
  {
    nombre: 'panel-cola',
    ruta: '/admin/cola',
    preparar: jefatura,
    lista: (p) => expect(p.getByRole('region', { name: T.panelCola.colaRevision })).toBeVisible(),
    soloEscritorio: true,
  },
  {
    nombre: 'panel-inventario',
    ruta: '/admin/inventario',
    preparar: jefatura,
    lista: (p) => expect(p.getByText(P0.codigo).first()).toBeVisible(),
    soloEscritorio: true,
  },
];

async function capturar(page: Page, info: TestInfo, nombre: string) {
  // Sin animaciones a medias ni el cursor del campo de búsqueda parpadeando.
  await page.waitForLoadState('networkidle');
  const ruta = info.outputPath(`${nombre}.png`);
  await page.screenshot({ path: ruta, animations: 'disabled', caret: 'hide' });
  await info.attach(nombre, { path: ruta, contentType: 'image/png' });
}

for (const tema of ['claro', 'oscuro'] as const) {
  for (const vista of VISTAS) {
    test(`${vista.nombre} · ${tema}`, async ({ page, isMobile }, info) => {
      test.skip(!!isMobile && !!vista.soloEscritorio, 'el panel de jefatura es de ordenador');
      // Escritorio a 1280 × 800; el móvil es el Pixel 7 del proyecto (412 × 915).
      if (!isMobile) await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
      await vista.preparar(page);
      await page.goto(vista.ruta);
      await vista.lista(page);
      await capturar(page, info, `${vista.nombre}-${isMobile ? '412' : '1280'}-${tema}`);
    });
  }
}
