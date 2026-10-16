// El panel de jefatura simulado (docs/38 RV-510): la cola, el inventario, el registro, la papelera y Ajustes con
// datos de prueba, para las capturas de vistas.spec.ts y las pruebas de anchos de listas-anchos.spec.ts. Nombres
// ficticios y correos example.org (repositorio público, DEC-053); nunca un servidor real.

import type { Page } from '@playwright/test';
import { SUPABASE_PRUEBAS } from '../playwright.config.ts';
import { conGoogle, simularTablas } from './ayudas.ts';
import { PUNTOS } from './puntos.ts';

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

export const COLA = [
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

const SALUD_STAGING = {
  pendientes_14d: 2,
  incidencias_abiertas: 0,
  errores_7d: 0,
  sin_direccion: 0,
  // Staging tiene respaldo semanal (DEC-203); sin él, Salud avisa (docs/39 RV-522).
  ultimo_respaldo: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  storage_bytes: null,
  version_zona: '2026-07-14',
  version_mapabase: '2026-07-14',
  ultima_vigilancia: hace(3),
  vigilancia_ok: true,
  dispositivos_activos: 4,
  bd_bytes: 38 * 1024 * 1024,
  esquema_bytes: 3 * 1024 * 1024,
  tareas: [],
  tareas_origen: 'en_vivo',
};

/**
 * docs/30 RV-127: entradas del Registro como las deja la base de datos (0006, 0038), para mirar el
 * detalle legible: una edición con movimiento, un alta, un borrado y un cambio de parámetros.
 */
export const REGISTRO = [
  // docs/36 RV-472: la entrada y los móviles, con palabras y en hora de Albolote.
  {
    id: 6,
    momento: hace(0.2),
    actor: 'jefe@example.org',
    es_admin: true,
    accion: 'entrada_abierta',
    punto_id: null,
    codigo: null,
    resumen: 'entrada_abierta · hasta, horas, motivo',
    antes: null,
    despues: { hasta: '2026-10-14T22:00:00+00:00', horas: 24, motivo: 'codigo_nuevo_revocando' },
  },
  {
    id: 5,
    momento: hace(0.5),
    actor: 'jefe@example.org',
    es_admin: true,
    accion: 'dispositivos_revocados',
    punto_id: null,
    codigo: null,
    resumen: 'dispositivos_revocados · desde, dispositivos',
    antes: null,
    despues: { dispositivos: 3, desde: '2026-10-13T22:00:00+00:00' },
  },
  {
    id: 4,
    momento: hace(1),
    actor: 'jefe@example.org',
    es_admin: true,
    accion: 'edicion_admin',
    punto_id: P0.id,
    codigo: P0.codigo,
    resumen: `edicion_admin · ${P0.codigo} · actualizado_en, caudal, codigo, desplazamiento_m, lat, lng`,
    antes: { ...P0, caudal: 'no_funciona', descripcion_fallo: '[PRUEBA] Tapa soldada' },
    despues: { ...P0, caudal: 'regular', descripcion_fallo: null, lat: P0.lat + 0.00005, desplazamiento_m: 5.6 },
  },
  {
    id: 3,
    momento: hace(3),
    actor: 'jefe@example.org',
    es_admin: true,
    accion: 'aprobacion',
    punto_id: P1.id,
    codigo: P1.codigo,
    resumen: `aprobacion · ${P1.codigo} · caudal, codigo, tipo`,
    antes: null,
    despues: P1,
  },
  {
    id: 2,
    momento: hace(20),
    actor: 'jefe@example.org',
    es_admin: true,
    accion: 'borrado',
    punto_id: P1.id,
    codigo: P1.codigo,
    resumen: `borrado · ${P1.codigo} · motivo, situacion`,
    antes: P1,
    despues: { situacion: 'borrado', motivo: '[PRUEBA] Duplicado de otro punto' },
  },
  {
    id: 1,
    momento: hace(50),
    actor: 'jefe@example.org',
    es_admin: true,
    accion: 'config_cambiada',
    punto_id: null,
    codigo: null,
    resumen: 'config_cambiada · dias_papelera',
    antes: { dias_papelera: 30 },
    despues: { dias_papelera: 45 },
  },
];

/** Lo que falta en el panel de siempre para verlo entero: la papelera con puntos y lo que lee Ajustes (docs/38). */
export const PANEL_COMPLETO = {
  puntos: [
    { id: 'b1', codigo: 'BOC-0042', tipo: 'boca_riego', diametro_mm: 45, borrado_en: hace(48) },
    { id: 'b2', codigo: 'HID-0108', tipo: 'hidrante', diametro_mm: 80, borrado_en: hace(29 * 24 + 2) },
  ],
  config: [
    { clave: 'codigo_acceso', valor: '482917' },
    { clave: 'codigo_acceso_cambiado_en', valor: '2026-09-02T10:00:00Z' },
    { clave: 'codigo_acceso_cambiado_por', valor: 'jefe@example.org' },
    { clave: 'meses_revision', valor: 12 },
    { clave: 'radio_duplicado_m', valor: 25 },
    { clave: 'dias_papelera', valor: 30 },
    { clave: 'buffer_zona_m', valor: 400 },
    { clave: 'max_subidas_dispositivo_dia', valor: 40 },
    { clave: 'metros_tramo_manguera', valor: 20 },
    { clave: 'escala_radios', valor: [11, 9, 7, 5.5, 5] },
  ],
  administradores: [
    { email: 'jefe@example.org', activo: true, creado_en: '2026-08-01T10:00:00Z', creado_por: 'migracion' },
    {
      email: 'jefatura-de-pruebas-con-correo-largo@example.org',
      activo: false,
      creado_en: '2026-09-03T10:00:00Z',
      creado_por: 'jefe@example.org',
    },
  ],
  dispositivos: [{ id: 'x1' }, { id: 'x2' }],
  nucleos: [
    { nombre: 'Albolote', municipio: 'albolote', manual: false },
    { nombre: 'Pretel', municipio: 'albolote', manual: true },
  ],
};

/** Jefatura con el panel simulado; `tablas` añade o sustituye tablas (la papelera, los administradores…). */
export async function jefatura(page: Page, tablas: Parameters<typeof simularTablas>[1] = {}) {
  await conGoogle(page, 'jefe@example.org');
  await simularTablas(page, {
    v_puntos_activos: PUNTOS,
    v_cola_revision: COLA,
    v_registro: REGISTRO,
    propuestas: (url) => (url.searchParams.get('estado') === 'eq.pendiente' ? COLA : []),
    puntos: [],
    config: [],
    ...tablas,
  });
  await page.route(`${SUPABASE_PRUEBAS}/rest/v1/rpc/*`, (route) => {
    const nombre = new URL(route.request().url()).pathname.split('/').pop()!;
    const json = (d: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
    if (nombre === 'fn_es_admin') return json(true);
    if (nombre === 'fn_exportar_inventario') return json(PUNTOS);
    // Salud del sistema como en staging: sin respaldo ni medida del bucket (docs/23 RV-98).
    if (nombre === 'fn_salud') return json(SALUD_STAGING);
    if (nombre === 'fn_registrar_error') return json(null);
    if (nombre === 'fn_historial_punto') return json(REGISTRO.filter((e) => e.punto_id).reverse());
    // Ajustes → Mantenimiento (docs/32 RV-260): un pedido sin despachar, como en staging.
    if (nombre === 'fn_pedidos_recientes')
      return json([
        {
          id: 1,
          workflow: 'regenerar-zona',
          pedido_en: new Date(Date.now() - 20 * 60_000).toISOString(),
          lanzado_en: null,
          estado: 'pedido',
          resultado: null,
        },
      ]);
    return route.abort('connectionrefused');
  });
  await page.route('**/api/direccion?*', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ direccion: null, fuente: null }) }),
  );
}
