// Inventario, papelera, registro y revisiones caducadas del panel (FR-120–FR-125, FL-24–FL-26).
// Lo que se calcula (filtros, orden, páginas, días de papelera) es puro y tiene tests; las acciones
// van por RPC (05 §6.2) y devuelven Resultado.

import { type Resultado, rpc } from '../api';
import { type Caudal, type Punto, type TipoPunto, sincronizar } from '../puntos';
import type { FiltrosExportacion } from './exportar';
import { T } from '../textos';
import { leerLista, leerPagina } from './consultas';
import { sinAcentos } from './cola';

/** Filas por página en el inventario y en el registro (09, Fase 7). */
export const POR_PAGINA = 50;

export type Columna = 'codigo' | 'tipo' | 'diametro_mm' | 'caudal' | 'direccion' | 'nucleo' | 'fecha_ultima_revision';

export interface Orden {
  columna: Columna;
  ascendente: boolean;
}

/**
 * Filtros del inventario (FR-120): tipo **y** estado, combinables, más revisión, núcleo y diámetro
 * (RV-24). No reutiliza el filtro de chips de la Lista del móvil, que es de uno en uno (FR-68).
 */
export interface FiltrosInventario {
  tipo: 'todos' | TipoPunto;
  caudal: 'todos' | Caudal;
  sin_revisar: boolean;
  nucleo: string;
  diametro: string;
  busqueda: string;
}

/** Lo mismo en la forma de fn_exportar_inventario (05 §6.2); la búsqueda se aplica aparte. */
export function filtrosExportacion(f: FiltrosInventario): FiltrosExportacion {
  return {
    ...(f.tipo !== 'todos' ? { tipo: f.tipo } : {}),
    ...(f.caudal !== 'todos' ? { caudal: f.caudal } : {}),
    ...(f.sin_revisar ? { revision_caducada: true } : {}),
    ...(f.nucleo ? { nucleo: f.nucleo } : {}),
    ...(f.diametro ? { diametro_mm: Number(f.diametro) } : {}),
  };
}

const ORDEN_CAUDAL = { bueno: 0, regular: 1, malo: 2, no_funciona: 3 };

/** Inventario en pantalla: filtros de FR-120 más la búsqueda global (FR-145). */
export function inventario(puntos: Punto[], f: FiltrosInventario): Punto[] {
  const texto = sinAcentos(f.busqueda.trim());
  return puntos.filter(
    (p) =>
      (f.tipo === 'todos' || p.tipo === f.tipo) &&
      (f.caudal === 'todos' || p.caudal === f.caudal) &&
      (!f.sin_revisar || p.revision_caducada) &&
      (!f.nucleo || p.nucleo === f.nucleo) &&
      (!f.diametro || String(p.diametro_mm) === f.diametro) &&
      (!texto ||
        sinAcentos([p.codigo, p.direccion, p.nucleo, p.descripcion].filter(Boolean).join(' ')).includes(texto)),
  );
}

export function ordenarPor(puntos: Punto[], { columna, ascendente }: Orden): Punto[] {
  const signo = ascendente ? 1 : -1;
  return [...puntos].sort((a, b) => {
    if (columna === 'caudal') return signo * (ORDEN_CAUDAL[a.caudal] - ORDEN_CAUDAL[b.caudal]);
    if (columna === 'diametro_mm') return signo * (a.diametro_mm - b.diametro_mm);
    const x = a[columna] ?? '';
    const y = b[columna] ?? '';
    return signo * String(x).localeCompare(String(y), 'es', { numeric: true });
  });
}

export const paginas = (total: number) => Math.max(1, Math.ceil(total / POR_PAGINA));

export const pagina = <T>(filas: T[], n: number) => filas.slice(n * POR_PAGINA, (n + 1) * POR_PAGINA);

/** Núcleos presentes, para el desplegable (y para Ajustes). */
export const nucleosDe = (puntos: Punto[]) =>
  [...new Set(puntos.map((p) => p.nucleo).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'es'));

// ---------- papelera (FR-124) ----------

export interface Borrado {
  id: string;
  codigo: string;
  tipo: Punto['tipo'];
  diametro_mm: number;
  borrado_en: string;
}

export const cargarPapelera = () =>
  leerLista<Borrado>((c) =>
    c
      .from('puntos')
      .select('id, codigo, tipo, diametro_mm, borrado_en')
      .eq('situacion', 'borrado')
      .order('borrado_en', { ascending: false }),
  );

/** Días que le quedan a un borrado antes de la purga (FR-124). Nunca menos de cero. */
export function diasQueQuedan(borradoEn: string, diasPapelera: number, ahora = new Date()): number {
  const pasados = (ahora.getTime() - new Date(borradoEn).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(diasPapelera - pasados));
}

// ---------- registro (FR-123) ----------

export interface EntradaRegistro {
  id: number;
  momento: string;
  actor: string;
  es_admin: boolean;
  accion: string;
  codigo: string | null;
  resumen: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

/** Vocabulario de `registro.accion` (05 §8) en palabras de jefatura. */
export const NOMBRE_ACCION: Record<string, string> = {
  propuesta_creada: T.panelRegistro.propuestaCreada,
  propuesta_retirada_autor: T.panelRegistro.propuestaRetiradaAutor,
  aprobacion: T.panelRegistro.aprobacion,
  aprobacion_con_correcciones: T.panelRegistro.aprobacionCorrecciones,
  rechazo: T.panelRegistro.rechazo,
  fusion: T.panelRegistro.fusion,
  edicion_admin: T.panelRegistro.edicionAdmin,
  retirada: T.panelRegistro.retirada,
  borrado: T.panelRegistro.borrado,
  restauracion: T.panelRegistro.restauracion,
  purga_papelera: T.panelRegistro.purgaPapelera,
  codigo_cambiado: T.panelRegistro.codigoCambiado,
  dispositivos_revocados: T.panelRegistro.dispositivosRevocados,
  administrador_alta: T.panelRegistro.administradorAlta,
  administrador_baja: T.panelRegistro.administradorBaja,
  config_cambiada: T.panelRegistro.configCambiada,
  incidencia_resuelta: T.panelRegistro.incidenciaResuelta,
  anonimizacion: T.panelRegistro.anonimizacion,
  exportacion: T.panelRegistro.exportacion,
  workflow_lanzado: T.panelRegistro.workflowLanzado,
};

export const nombreAccion = (a: string) => NOMBRE_ACCION[a] ?? a;

export type PaginaRegistro = { filas: EntradaRegistro[]; total: number };

/** Una página del registro, con filtro de acción y búsqueda por actor, código o resumen. */
export function cargarRegistro(accion: string, busqueda: string, n: number): Promise<Resultado<PaginaRegistro>> {
  const texto = escapar(busqueda);
  return leerPagina<EntradaRegistro>((c) => {
    let q = c.from('v_registro').select('*', { count: 'exact' });
    if (accion) q = q.eq('accion', accion);
    if (texto) q = q.or(`actor.ilike.%${texto}%,codigo.ilike.%${texto}%,resumen.ilike.%${texto}%`);
    return q.order('momento', { ascending: false }).range(n * POR_PAGINA, (n + 1) * POR_PAGINA - 1);
  });
}

/** Comas, comillas y comodines romperían el filtro `or` de PostgREST. */
export const escapar = (texto: string) => texto.replace(/[,()"%*]/g, ' ').trim();

/** Historial de un punto (FR-123, FL-24). */
export const historialPunto = (puntoId: string) => rpc<EntradaRegistro[]>('fn_historial_punto', { punto_id: puntoId });

// ---------- revisiones caducadas (FR-121, FR-122) ----------

export interface GrupoCaducadas {
  nucleo: string;
  puntos: Punto[];
  /** Cuántos puntos activos tiene ese núcleo en total. */
  total: number;
}

/** Caducadas agrupadas por núcleo, de más urgente (más caducadas) a menos (FR-121). */
export function caducadasPorNucleo(puntos: Punto[]): GrupoCaducadas[] {
  const totales = new Map<string, number>();
  const caducadas = new Map<string, Punto[]>();
  for (const p of puntos) {
    const n = p.nucleo ?? T.panelCola.sinNucleo;
    totales.set(n, (totales.get(n) ?? 0) + 1);
    if (p.revision_caducada) caducadas.set(n, [...(caducadas.get(n) ?? []), p]);
  }
  return [...caducadas.entries()]
    .map(([nucleo, lista]) => ({
      nucleo,
      puntos: [...lista].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })),
      total: totales.get(nucleo) ?? lista.length,
    }))
    .sort((a, b) => b.puntos.length - a.puntos.length || a.nucleo.localeCompare(b.nucleo, 'es'));
}

// ---------- acciones sobre un punto (FR-120, FR-124) ----------

function refrescar<T>(r: Resultado<T>): Resultado<T> {
  if (r.ok) void sincronizar(null);
  return r;
}

export interface CambiosPunto {
  tipo?: Punto['tipo'];
  diametro_mm?: number;
  caudal?: Punto['caudal'];
  racor?: Punto['racor'];
  descripcion_fallo?: string | null;
  descripcion?: string | null;
  direccion?: string | null;
}

export async function editarPunto(id: string, cambios: CambiosPunto): Promise<Resultado<null>> {
  return refrescar(await rpc<null>('fn_editar_punto', { punto_id: id, cambios }));
}

export async function retirarPunto(id: string, motivo: string): Promise<Resultado<null>> {
  return refrescar(await rpc<null>('fn_retirar_punto', { punto_id: id, motivo: motivo.trim() }));
}

export async function borrarPunto(id: string, motivo: string): Promise<Resultado<null>> {
  return refrescar(await rpc<null>('fn_borrar_punto', { punto_id: id, motivo: motivo.trim() }));
}

export async function restaurarPunto(id: string): Promise<Resultado<null>> {
  return refrescar(await rpc<null>('fn_restaurar_punto', { punto_id: id }));
}

export const purgarPapelera = () => rpc<number>('fn_purgar_papelera');

/** Lo que cambia respecto al punto actual: `fn_editar_punto` rechaza un objeto vacío. */
export function cambiosDe(p: Punto, v: CambiosPunto): CambiosPunto {
  const c: CambiosPunto = {};
  // Un campo que no viene en el formulario no se toca; uno vacío sí borra el valor.
  const cambia = (campo: keyof CambiosPunto, a: string | null | undefined, b: string | null) =>
    campo in v && (a?.trim() || null) !== b;
  // El tipo no se cambia desde el inventario: se retira el punto y se da de alta el correcto (DEC-090).
  const tipoFinal = p.tipo;
  if (tipoFinal === 'hidrante' && v.diametro_mm && v.diametro_mm !== p.diametro_mm) c.diametro_mm = v.diametro_mm;
  if (v.caudal && v.caudal !== p.caudal) c.caudal = v.caudal;
  if (tipoFinal === 'boca_riego' && cambia('racor', v.racor, p.racor)) c.racor = v.racor ?? null;
  const caudalFinal = v.caudal ?? p.caudal;
  if (caudalFinal === 'no_funciona' && cambia('descripcion_fallo', v.descripcion_fallo, p.descripcion_fallo)) {
    c.descripcion_fallo = v.descripcion_fallo?.trim() || null;
  }
  if (cambia('descripcion', v.descripcion, p.descripcion)) c.descripcion = v.descripcion?.trim() || null;
  if (cambia('direccion', v.direccion, p.direccion)) c.direccion = v.direccion?.trim() || null;
  return c;
}

// ---------- parámetros que el panel necesita leer (05 §2.10) ----------

/** Un parámetro de `config`, con su valor por defecto si aún no está guardado. */
export async function leerParametro(clave: string, porDefecto: number): Promise<number> {
  const r = await leerLista<{ valor: unknown }>((c) => c.from('config').select('valor').eq('clave', clave));
  const v = r.ok ? Number(r.datos[0]?.valor) : NaN;
  return Number.isFinite(v) ? v : porDefecto;
}

export const DIAS_PAPELERA_POR_DEFECTO = 30;
