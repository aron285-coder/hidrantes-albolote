// Ajustes del panel (FR-140–FR-145, FR-165–FR-167; FL-29–FL-31, FL-33): código de acceso,
// administradores, parámetros, núcleos, salud del sistema, mantenimiento y novedades.

import { type Resultado, rpc } from '../api';
import { sincronizar } from '../puntos';
import { funcion, leer, leerLista } from './consultas';
import { NOVEDADES } from '../novedades';
import { type FilaExportada, pedirInventario } from './exportar';
import { hace, megas } from '../formato';
import { T } from '../textos';

// ---------- código de acceso (FR-140, FL-29) ----------

export interface CodigoAcceso {
  codigo: string | null;
  cambiadoEn: string | null;
  cambiadoPor: string | null;
}

const CLAVES_CODIGO = ['codigo_acceso', 'codigo_acceso_cambiado_en', 'codigo_acceso_cambiado_por'];

export async function cargarCodigo(): Promise<Resultado<CodigoAcceso>> {
  const r = await leerLista<{ clave: string; valor: unknown }>((c) =>
    c.from('config').select('clave, valor').in('clave', CLAVES_CODIGO),
  );
  if (!r.ok) return r;
  const valor = (clave: string) => {
    const v = r.datos.find((x) => x.clave === clave)?.valor;
    return typeof v === 'string' ? v : v == null ? null : String(v);
  };
  return {
    ok: true,
    datos: {
      codigo: valor('codigo_acceso'),
      cambiadoEn: valor('codigo_acceso_cambiado_en'),
      cambiadoPor: valor('codigo_acceso_cambiado_por'),
    },
  };
}

/** Seis cifras al azar, con el generador del navegador (nunca Math.random para algo que da acceso). */
export function generarCodigo(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, '0');
}

export const cambiarCodigo = (nuevo: string, revocarDispositivos: boolean) =>
  rpc<null>('fn_cambiar_codigo_acceso', { nuevo, revocar_dispositivos: revocarDispositivos });

/** Cuántos móviles tienen acceso ahora mismo, para explicar qué pasa al revocar. */
export const contarDispositivos = async (): Promise<number> => {
  const r = await leerLista<{ id: string }>((c) => c.from('dispositivos').select('id').is('revocado_en', null));
  return r.ok ? r.datos.length : 0;
};

// ---------- administradores (FR-141, FL-30) ----------

export interface Administrador {
  email: string;
  activo: boolean;
  creado_en: string;
  creado_por: string;
}

export const cargarAdministradores = () =>
  leerLista<Administrador>((c) => c.from('administradores').select('*').order('email'));

export const gestionarAdministrador = (email: string, activo: boolean) =>
  rpc<null>('fn_gestionar_administrador', { email: email.trim().toLowerCase(), activo });

/**
 * Correos que ya existen en la app de uniformidad, solo como sugerencia al escribir (FR-141).
 * Es su esquema: se lee y nada más; si no deja, no hay sugerencias y no pasa nada.
 */
export async function sugerenciasUniformidad(): Promise<string[]> {
  const r = await leer<{ email: string | null }[]>((c) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).schema('public').from('app_users').select('email').limit(50),
  );
  if (!r.ok || !Array.isArray(r.datos)) return [];
  return r.datos.map((x) => x.email).filter((e): e is string => !!e && e.includes('@'));
}

// ---------- parámetros (FR-142, FL-31) ----------

/** Los parámetros que fn_guardar_config admite (05 §6.2), con su valor por defecto. */
export const PARAMETROS = {
  meses_revision: 12,
  radio_duplicado_m: 25,
  dias_papelera: 30,
  buffer_zona_m: 400,
  max_subidas_dispositivo_dia: 40,
  metros_tramo_manguera: 20,
} as const;

export type ClaveParametro = keyof typeof PARAMETROS;

export interface Parametros extends Record<ClaveParametro, number> {
  escala_radios: number[];
}

export const PARAMETROS_POR_DEFECTO: Parametros = { ...PARAMETROS, escala_radios: [11, 9, 7, 5.5, 5] };

export async function cargarParametros(): Promise<Resultado<Parametros>> {
  const claves = [...Object.keys(PARAMETROS), 'escala_radios'];
  const r = await leerLista<{ clave: string; valor: unknown }>((c) =>
    c.from('config').select('clave, valor').in('clave', claves),
  );
  if (!r.ok) return r;
  const valores = { ...PARAMETROS_POR_DEFECTO };
  for (const { clave, valor } of r.datos) {
    if (clave === 'escala_radios' && Array.isArray(valor)) valores.escala_radios = valor.map(Number);
    else if (clave in PARAMETROS && Number.isFinite(Number(valor))) {
      valores[clave as ClaveParametro] = Number(valor);
    }
  }
  return { ok: true, datos: valores };
}

/** Solo viaja lo que cambia: fn_guardar_config rechaza un objeto vacío y anota lo demás en el registro. */
export function cambiosParametros(antes: Parametros, ahora: Parametros): Record<string, unknown> {
  const cambios: Record<string, unknown> = {};
  for (const clave of Object.keys(PARAMETROS) as ClaveParametro[]) {
    if (ahora[clave] !== antes[clave]) cambios[clave] = ahora[clave];
  }
  if (ahora.escala_radios.join() !== antes.escala_radios.join()) cambios.escala_radios = ahora.escala_radios;
  return cambios;
}

/** Qué impide guardar, o null (UI-02). Los rangos son los de fn_guardar_config. */
export function faltaEnParametros(v: Parametros): string | null {
  const entero = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!entero(v.meses_revision, 1, 60)) return 'meses_revision';
  if (!entero(v.radio_duplicado_m, 1, 500)) return 'radio_duplicado_m';
  if (!entero(v.dias_papelera, 1, 365)) return 'dias_papelera';
  if (!entero(v.buffer_zona_m, 0, 5000)) return 'buffer_zona_m';
  if (!entero(v.max_subidas_dispositivo_dia, 1, 500)) return 'max_subidas_dispositivo_dia';
  if (!entero(v.metros_tramo_manguera, 10, 30)) return 'metros_tramo_manguera';
  if (v.escala_radios.length !== 5 || v.escala_radios.some((r) => !(r >= 2 && r <= 30))) return 'escala_radios';
  return null;
}

export async function guardarParametros(cambios: Record<string, unknown>): Promise<Resultado<null>> {
  const r = await rpc<null>('fn_guardar_config', { cambios });
  // Los radios y los meses cambian lo que se ve en el mapa: se recarga.
  if (r.ok) void sincronizar(null);
  return r;
}

// ---------- núcleos (FR-166) ----------

export interface Nucleo {
  nombre: string;
  municipio: string;
  manual: boolean;
}

export const cargarNucleos = () =>
  leerLista<Nucleo>((c) => c.from('nucleos').select('nombre, municipio, manual').order('nombre'));

export async function renombrarNucleo(actual: string, nuevo: string): Promise<Resultado<null>> {
  const r = await rpc<null>('fn_renombrar_nucleo', { nombre_actual: actual, nombre_nuevo: nuevo });
  if (r.ok) void sincronizar(null);
  return r;
}

export async function anadirNucleo(nombre: string, lat: number, lng: number): Promise<Resultado<null>> {
  const r = await rpc<null>('fn_anadir_nucleo', { nombre, lat, lng });
  if (r.ok) void sincronizar(null);
  return r;
}

// ---------- salud del sistema (FR-143) ----------

export interface Salud {
  pendientes_14d: number;
  incidencias_abiertas: number;
  errores_7d: number;
  sin_direccion: number;
  ultimo_respaldo: string | null;
  storage_bytes: number | null;
  version_zona: string | null;
  version_mapabase: string | null;
  /** Versión del callejero sin conexión (docs/18 GM-04); ausente con una base anterior a 0028. */
  version_callejero?: string | null;
  /** Cuándo corrió vigilancia.yml y si fue bien (TR-102). */
  ultima_vigilancia: string | null;
  vigilancia_ok: boolean | null;
  dispositivos_activos: number;
  /** Intentos del código de las últimas 24 h (RV-14); ausentes con una base anterior a 0015. */
  intentos_fallidos_24h?: number;
  topes_alcanzados_24h?: number;
  topes_globales_24h?: number;
  /** Tamaño de toda la base de datos (compartida con uniformidad) y de nuestro esquema (RV-22). */
  bd_bytes?: number;
  esquema_bytes?: number;
  /** Lo que anotó la vigilancia de cada tarea de pg_cron (TR-54). */
  tareas?: TareaProgramada[] | null;
  /**
   * De dónde salen `tareas` (0031, docs/22 RV-92, DEC-132): `en_vivo` de pg_cron, o `vigilancia` si
   * pg_cron no dejó leer y se enseña la foto de la última vigilancia. Ausente con una base anterior.
   */
  tareas_origen?: 'en_vivo' | 'vigilancia';
  /** Cuándo tomó la vigilancia esa foto; solo con `tareas_origen = 'vigilancia'`. */
  tareas_medidas_en?: string | null;
  /** SQLSTATE por el que no se pudo leer en vivo; para diagnóstico, no se enseña. */
  tareas_error?: string | null;
}

export interface TareaProgramada {
  tarea: string;
  ultima: string | null;
  fallo: boolean;
  /** Es de las que tiene que haber y no está en pg_cron (docs/19 RV-56). */
  falta?: boolean;
  problema: boolean;
}

/** Los 500 MB de base de datos del plan gratuito, compartidos con uniformidad (TR-53). */
export const CUOTA_BD_BYTES = 500 * 1024 ** 2;

export const cargarSalud = () => rpc<Salud>('fn_salud');

/**
 * A partir de cuántas horas "Última vigilancia" va en tono de aviso (docs/22 RV-93). GitHub puede
 * retrasarla varias horas, y con dos pasadas al día menos de 14 h es lo normal; más de 26 h, no.
 */
export const VIGILANCIA_ATRASADA_H = 26;

export function vigilanciaAtrasada(ultima: string | null, ahora: Date = new Date()): boolean {
  if (!ultima) return false;
  const desde = new Date(ultima).getTime();
  if (Number.isNaN(desde)) return false;
  return ahora.getTime() - desde >= VIGILANCIA_ATRASADA_H * 3_600_000;
}

/** Debajo de "Tareas programadas": si son de ahora mismo o de la foto de la vigilancia (RV-92). */
export function origenTareas(s: Salud, ahora: Date = new Date()): string {
  if (s.tareas_origen === 'en_vivo') return T.panelAjustes.tareasAhora;
  if (s.tareas_medidas_en) return T.panelAjustes.tareasSegunVigilancia(hace(s.tareas_medidas_en, ahora));
  return T.panelAjustes.tareasSegunUltimaVigilancia;
}

/** "Almacenamiento usado": 0 bytes, con el bucket vacío, también es un dato (docs/22 RV-94). */
export function textoAlmacenamiento(bytes: number | null | undefined): string {
  return bytes != null ? `${megas(bytes)} MB` : T.panelAjustes.sinDato;
}

/** La cota gratuita de fotos de TR-53: 1 GB. */
export const CUOTA_FOTOS_BYTES = 1024 ** 3;
const AVISAR_DESDE = 0.9;

/**
 * Porcentaje ocupado del gigabyte gratuito cuando pasa del 90 %, y `null` mientras haya sitio: a
 * partir de ahí Salud del sistema lo avisa para que dé tiempo a liberar espacio antes de que la
 * aplicación deje de aceptar fotos (TR-53, 09 Fase 8).
 */
export function avisoAlmacenamiento(bytes: number | null): number | null {
  if (!bytes || bytes <= 0) return null;
  const parte = bytes / CUOTA_FOTOS_BYTES;
  return parte >= AVISAR_DESDE ? Math.min(Math.round(parte * 100), 100) : null;
}

// ---------- mantenimiento (FR-144, FR-165, FL-33) ----------

export type Workflow = 'purgar-fotos' | 'regenerar-zona' | 'regenerar-mapabase' | 'respaldo';

export const lanzarWorkflow = (workflow: Workflow) =>
  funcion<{ lanzada: boolean }>('/api/lanzar-workflow', { metodo: 'POST', cuerpo: { workflow } });

/** Descarga de consulta en JSON (FR-144). No es el respaldo: eso vive en 15. */
export async function descargarInventarioJson(): Promise<Resultado<number>> {
  const r = await pedirInventario({});
  if (!r.ok) return r;
  const filas: FilaExportada[] = Array.isArray(r.datos) ? r.datos : [];
  const blob = new Blob([JSON.stringify(filas, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hidrantes-albolote-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { ok: true, datos: filas.length };
}

// ---------- novedades (FR-167) ----------

export interface Novedad {
  version: string;
  texto: string;
}

/**
 * Las novedades salen del build (src/generado/novedades.json, RV-20), no de fn_novedades: nada las
 * cargaba en config y el panel decía siempre "Todavía no hay novedades publicadas".
 */
export async function cargarNovedades(): Promise<Resultado<Novedad[]>> {
  const { version, lineas } = NOVEDADES;
  return { ok: true, datos: version ? lineas.map((texto) => ({ version, texto })) : [] };
}
