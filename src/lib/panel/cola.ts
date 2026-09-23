// Cola de revisión del panel (FR-100–FR-110, FL-21–FL-23): qué hay pendiente, qué cambia cada
// propuesta (diff), qué señales de fiabilidad tiene y las acciones de jefatura (05 §6.2).
// Lo que se calcula aquí no toca la red y tiene tests; las acciones devuelven Resultado.

import { type Resultado, rpc } from '../api';
import { nombreCaudal, nombreRacor, nombreTipo } from '../ficha';
import { distancia, fechaCorta, hace } from '../formato';
import type { MotivoRapido, Operacion } from '../propuestas';
import { type Caudal, type Punto, type Racor, type TipoPunto, metros, sincronizar } from '../puntos';
import { T } from '../textos';
import { funcion, leerLista } from './consultas';
import { pedirEnvioComoJefatura } from './push-jefatura';

export type EstadoModeracion = 'pendiente' | 'aprobada' | 'rechazada' | 'retirada_por_autor';

/** Una propuesta tal como la ve el panel: fila de v_cola_revision o, en el historial, de propuestas. */
export interface PropuestaPanel {
  id: string;
  operacion: Operacion;
  estado: EstadoModeracion;
  creada_en: string;
  autor_nombre: string;
  autor_apellido: string;
  punto_id: string | null;
  codigo: string | null;
  datos: Record<string, unknown>;
  foto_path: string | null;
  direccion_sugerida: string | null;
  direccion_actual: string | null;
  lat: number | null;
  lng: number | null;
  antes: Record<string, unknown> | null;
  origen_ubicacion: 'gps' | 'manual' | null;
  precision_gps_m: number | null;
  distancia_gps_m: number | null;
  distancia_exif_m: number | null;
  fuera_de_zona: boolean | null;
  meses_desde_revision: number | null;
  duplicado_de: string | null;
  distancia_duplicado_m: number | null;
  codigo_duplicado: string | null;
  otra_medida: boolean;
  desactualizada: boolean;
  nucleo: string | null;
  punto_actualizado_en: string | null;
  // solo en el historial
  motivo_rechazo?: string | null;
  correcciones?: Record<string, unknown> | null;
  revisada_por?: string | null;
  revisada_en?: string | null;
}

// ---------- lecturas ----------

export function cargarCola(): Promise<Resultado<PropuestaPanel[]>> {
  return leerLista<PropuestaPanel>((c) =>
    c.from('v_cola_revision').select('*').order('creada_en', { ascending: false }),
  );
}

interface FilaHistorial {
  id: string;
  operacion: Operacion;
  estado: EstadoModeracion;
  creada_en: string;
  autor_nombre: string;
  autor_apellido: string;
  punto_id: string | null;
  datos: Record<string, unknown>;
  foto_path: string | null;
  direccion_sugerida: string | null;
  motivo_rechazo: string | null;
  correcciones: Record<string, unknown> | null;
  revisada_por: string | null;
  revisada_en: string | null;
  punto: { codigo: string; direccion: string | null; nucleo: string | null } | null;
}

/** Cuántas decididas se traen: el historial completo está en el Registro (FR-123). */
export const LIMITE_HISTORIAL = 300;

/** Historial de lo decidido (FR-109): solo lectura, con quién, cuándo y el motivo o las correcciones. */
export async function cargarHistorial(
  estado: Exclude<EstadoModeracion, 'pendiente'>,
): Promise<Resultado<PropuestaPanel[]>> {
  const r = await leerLista<FilaHistorial>((c) =>
    c
      .from('propuestas')
      .select(
        'id, operacion, estado, creada_en, autor_nombre, autor_apellido, punto_id, datos, foto_path, ' +
          'direccion_sugerida, motivo_rechazo, correcciones, revisada_por, revisada_en, ' +
          'punto:puntos!punto_id(codigo, direccion, nucleo)',
      )
      .eq('estado', estado)
      .order('revisada_en', { ascending: false, nullsFirst: false })
      .order('creada_en', { ascending: false })
      .limit(LIMITE_HISTORIAL),
  );
  if (!r.ok) return r;
  return { ok: true, datos: r.datos.map(desdeHistorial) };
}

export function desdeHistorial(f: FilaHistorial): PropuestaPanel {
  return {
    id: f.id,
    operacion: f.operacion,
    estado: f.estado,
    creada_en: f.creada_en,
    autor_nombre: f.autor_nombre,
    autor_apellido: f.autor_apellido,
    punto_id: f.punto_id,
    codigo: f.punto?.codigo ?? null,
    datos: f.datos ?? {},
    foto_path: f.foto_path,
    direccion_sugerida: f.direccion_sugerida,
    direccion_actual: f.punto?.direccion ?? null,
    lat: null,
    lng: null,
    antes: null,
    origen_ubicacion: null,
    precision_gps_m: null,
    distancia_gps_m: null,
    distancia_exif_m: null,
    fuera_de_zona: null,
    meses_desde_revision: null,
    duplicado_de: null,
    distancia_duplicado_m: null,
    codigo_duplicado: null,
    otra_medida: false,
    desactualizada: false,
    nucleo: f.punto?.nucleo ?? null,
    punto_actualizado_en: null,
    motivo_rechazo: f.motivo_rechazo,
    correcciones: f.correcciones,
    revisada_por: f.revisada_por,
    revisada_en: f.revisada_en,
  };
}

// ---------- lo que se ve de cada propuesta ----------

export const autor = (p: Pick<PropuestaPanel, 'autor_nombre' | 'autor_apellido'>) =>
  [p.autor_nombre, p.autor_apellido].filter(Boolean).join(' ');

/** Dirección que se enseña en la lista: la del punto, o la deducida para un alta. */
export const direccionDe = (p: PropuestaPanel) => p.direccion_actual ?? p.direccion_sugerida;

/** "Autor · hace 2 h · C/ Real 14 · Albolote" (UI-11). */
export function lineaCola(p: PropuestaPanel, ahora = new Date()): string {
  return [
    autor(p),
    hace(p.creada_en, ahora),
    direccionDe(p) ?? T.ficha.sinDireccion,
    p.nucleo ?? (p.fuera_de_zona ? T.panelCola.fueraDeZona : T.panelCola.sinNucleo),
  ].join(' · ');
}

/** ¿Lleva algún aviso que merezca el ⚠ en la lista? */
export const tieneAviso = (p: PropuestaPanel) =>
  p.desactualizada || p.otra_medida || !!p.duplicado_de || !!p.fuera_de_zona || senales(p).some((s) => s.aviso);

/** Búsqueda global (FR-145): código, dirección o nombre de quien propuso. */
export function coincide(p: PropuestaPanel, texto: string): boolean {
  const t = sinAcentos(texto.trim());
  if (!t) return true;
  return sinAcentos([p.codigo, autor(p), direccionDe(p), p.nucleo].filter(Boolean).join(' ')).includes(t);
}

export const sinAcentos = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export interface FilaDiff {
  campo: string;
  antes?: string;
  despues: string;
  sinCambios?: boolean;
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const entreComillas = (v: unknown) => `"${texto(v)}"`;

function valorDe(campo: string, v: unknown): string {
  switch (campo) {
    case 'tipo':
      return nombreTipo[v as TipoPunto] ?? texto(v);
    case 'diametro_mm':
      return T.formato.mm(texto(v));
    case 'caudal':
      return nombreCaudal[v as Caudal] ?? texto(v);
    case 'racor':
      return v ? nombreRacor(texto(v)) : T.panelCola.ninguno;
    default:
      return texto(v) || T.panelCola.ninguno;
  }
}

const ETIQUETA_CAMPO: Record<string, string> = {
  tipo: T.panelCola.campoTipo,
  diametro_mm: T.panelCola.campoDiametro,
  caudal: T.panelCola.campoEstado,
  racor: T.panelCola.campoRacor,
  descripcion_fallo: T.panelCola.campoFallo,
  descripcion: T.panelCola.campoDescripcion,
  nota: T.panelCola.campoNota,
  direccion: T.ficha.direccion,
};

export const etiquetaCampo = (campo: string) => ETIQUETA_CAMPO[campo] ?? campo;

const MOTIVO_RAPIDO: Record<MotivoRapido, string> = {
  obras: T.formulario.obras,
  asfaltado: T.formulario.asfaltado,
  sustituido: T.formulario.sustituido,
  otro: T.formulario.otro,
};

/** El antes y el después campo a campo (FR-102). `punto` es el estado actual, si existe. */
export function filasDiff(p: PropuestaPanel, punto?: Punto): FilaDiff[] {
  const d = p.datos ?? {};
  const antes = p.antes ?? {};
  const filas: FilaDiff[] = [];
  const nota = () => {
    if (texto(d.nota)) filas.push({ campo: T.panelCola.campoNota, despues: entreComillas(d.nota) });
  };
  switch (p.operacion) {
    case 'alta':
      filas.push({ campo: T.panelCola.campoTipo, despues: valorDe('tipo', d.tipo) });
      filas.push({
        campo: T.panelCola.campoDiametro,
        despues:
          d.tipo === 'boca_riego'
            ? T.formato.mm(45)
            : d.diametro_otro != null
              ? T.panelCola.otraMedida(texto(d.diametro_otro))
              : valorDe('diametro_mm', d.diametro_mm),
      });
      if (d.racor) filas.push({ campo: T.panelCola.campoRacor, despues: valorDe('racor', d.racor) });
      filas.push({ campo: T.panelCola.campoEstado, despues: valorDe('caudal', d.caudal) });
      if (texto(d.descripcion_fallo))
        filas.push({ campo: T.panelCola.campoFallo, despues: entreComillas(d.descripcion_fallo) });
      if (texto(d.descripcion))
        filas.push({ campo: T.panelCola.campoDescripcion, despues: entreComillas(d.descripcion) });
      break;
    case 'revision':
      if (punto) {
        filas.push({
          campo: T.panelCola.campoEstado,
          despues: T.panelCola.sinCambios(nombreCaudal[punto.caudal]),
          sinCambios: true,
        });
        filas.push({
          campo: T.panelCola.campoRevision,
          antes: fechaCorta(punto.fecha_ultima_revision),
          despues: fechaCorta(p.creada_en),
        });
      } else {
        filas.push({ campo: T.panelCola.campoRevision, despues: fechaCorta(p.creada_en) });
      }
      nota();
      break;
    case 'estado':
      filas.push({
        campo: T.panelCola.campoEstado,
        antes: antes.caudal != null ? valorDe('caudal', antes.caudal) : undefined,
        despues: valorDe('caudal', d.caudal),
      });
      if (texto(d.descripcion_fallo))
        filas.push({ campo: T.panelCola.campoFallo, despues: entreComillas(d.descripcion_fallo) });
      nota();
      break;
    case 'datos':
      for (const campo of ['tipo', 'diametro_mm', 'racor', 'descripcion']) {
        if (!(campo in d)) continue;
        filas.push({
          campo: etiquetaCampo(campo),
          antes: campo in antes ? valorDe(campo, antes[campo]) : undefined,
          despues: valorDe(campo, d[campo]),
        });
      }
      break;
    case 'ubicacion':
      if (punto && p.lat != null && p.lng != null) {
        filas.push({
          campo: T.panelCola.campoDesplazamiento,
          despues: distancia(metros(punto, { lat: p.lat, lng: p.lng })),
        });
      }
      nota();
      break;
    case 'retirada':
      filas.push({ campo: T.panelCola.campoSituacion, antes: T.panelCola.activo, despues: T.panelCola.retirado });
      filas.push({
        campo: T.panelCola.campoMotivo,
        despues: [MOTIVO_RAPIDO[d.motivo_rapido as MotivoRapido], texto(d.motivo) && entreComillas(d.motivo)]
          .filter(Boolean)
          .join(' · '),
      });
      break;
  }
  return filas;
}

export interface Senal {
  texto: string;
  aviso: boolean;
}

/** Por encima de esto, la precisión del GPS se señala (m). */
export const GPS_IMPRECISO_M = 20;
/** Si la foto se hizo más lejos del pin que esto, se señala (m). */
export const FOTO_LEJOS_M = 30;

/** Señales automáticas de fiabilidad (FR-104). Las de aviso llevan ⚠; las buenas, ✓. */
export function senales(p: PropuestaPanel): Senal[] {
  const s: Senal[] = [];
  if (p.origen_ubicacion === 'gps') {
    s.push({
      texto: T.panelCola.senalGps(
        Math.round(p.precision_gps_m ?? 0),
        p.distancia_gps_m == null ? '—' : distancia(p.distancia_gps_m),
      ),
      aviso: false,
    });
  } else if (p.origen_ubicacion === 'manual') {
    s.push({
      texto:
        p.distancia_gps_m == null
          ? T.panelCola.senalManual
          : T.panelCola.senalManualLejos(distancia(p.distancia_gps_m)),
      aviso: true,
    });
  }
  if (p.precision_gps_m != null && p.precision_gps_m > GPS_IMPRECISO_M) {
    s.push({ texto: T.panelCola.senalGpsImpreciso(Math.round(p.precision_gps_m)), aviso: true });
  }
  if (p.distancia_exif_m != null && p.distancia_exif_m > FOTO_LEJOS_M) {
    s.push({ texto: T.panelCola.senalFotoLejos(distancia(p.distancia_exif_m)), aviso: true });
  }
  if (p.fuera_de_zona) s.push({ texto: T.panelCola.fueraDeZona, aviso: true });
  if (p.meses_desde_revision != null) {
    s.push({
      texto: T.panelCola.senalRevisionAnterior(
        p.meses_desde_revision < 1
          ? T.panelCola.esteMes
          : p.meses_desde_revision === 1
            ? T.formato.haceUnMes
            : T.formato.haceMeses(p.meses_desde_revision),
      ),
      aviso: false,
    });
  }
  if (p.duplicado_de) {
    s.push({
      texto: T.panelCola.senalDuplicado(p.codigo_duplicado ?? '—', distancia(p.distancia_duplicado_m ?? 0)),
      aviso: true,
    });
  }
  if (p.otra_medida) s.push({ texto: T.panelCola.senalOtraMedida, aviso: true });
  if (p.foto_path) s.push({ texto: T.panelCola.conFoto, aviso: false });
  if (p.desactualizada) s.push({ texto: T.panelCola.senalDesactualizada, aviso: true });
  return s;
}

/** ¿Tiene pin (y por tanto minimapa y dirección deducida editable)? (FR-103, FR-105) */
export const conUbicacion = (p: PropuestaPanel) =>
  (p.operacion === 'alta' || p.operacion === 'ubicacion') && p.lat != null && p.lng != null;

// ---------- aprobar con correcciones (FR-106) ----------

export interface ValoresPunto {
  tipo: TipoPunto;
  diametro_mm: number | null;
  caudal: Caudal;
  racor: Racor | null;
  descripcion_fallo: string;
  descripcion: string;
}

/** Cómo quedaría el punto si se aprueba tal cual: el estado actual con lo que la propuesta cambia. */
export function valoresPropuestos(p: PropuestaPanel, punto?: Punto): ValoresPunto {
  const d = p.datos ?? {};
  const tipo = (d.tipo as TipoPunto | undefined) ?? punto?.tipo ?? 'hidrante';
  const diametro =
    tipo === 'boca_riego'
      ? 45
      : d.diametro_otro != null
        ? null
        : ((d.diametro_mm as number | undefined) ?? punto?.diametro_mm ?? null);
  return {
    tipo,
    diametro_mm: diametro,
    caudal: (d.caudal as Caudal | undefined) ?? punto?.caudal ?? 'bueno',
    racor: tipo === 'boca_riego' ? ((d.racor as Racor | undefined) ?? punto?.racor ?? null) : null,
    descripcion_fallo: texto(d.descripcion_fallo ?? punto?.descripcion_fallo),
    descripcion: texto(d.descripcion ?? punto?.descripcion),
  };
}

/** Lo que jefatura ha cambiado respecto a lo propuesto: eso es `correcciones` (05 §7). */
export function correccionesDe(propuesto: ValoresPunto, final: ValoresPunto): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (final.tipo !== propuesto.tipo) c.tipo = final.tipo;
  if (final.tipo !== 'boca_riego' && final.diametro_mm !== propuesto.diametro_mm) c.diametro_mm = final.diametro_mm;
  if (final.caudal !== propuesto.caudal) c.caudal = final.caudal;
  if (final.tipo === 'boca_riego' && final.racor !== propuesto.racor) c.racor = final.racor;
  if (final.caudal === 'no_funciona' && final.descripcion_fallo.trim() !== propuesto.descripcion_fallo.trim()) {
    c.descripcion_fallo = final.descripcion_fallo.trim();
  }
  if (final.descripcion.trim() !== propuesto.descripcion.trim()) c.descripcion = final.descripcion.trim();
  return c;
}

/** Qué impide guardar el formulario de correcciones, o null si se puede (UI-02). */
export function faltaEnCorrecciones(v: ValoresPunto): string | null {
  if (v.tipo === 'hidrante' && v.diametro_mm !== 70 && v.diametro_mm !== 100) return T.panelCola.fijaDiametro;
  if (v.tipo === 'boca_riego' && !v.racor) return T.avisosFormulario.eligeRacor;
  if (v.caudal === 'no_funciona' && !v.descripcion_fallo.trim()) return T.avisosFormulario.describeFallo;
  return null;
}

/** La dirección escrita en el panel va en las correcciones solo si difiere de la deducida (FR-105). */
export function conDireccion(c: Record<string, unknown>, escrita: string, sugerida: string | null) {
  const d = escrita.trim();
  return d && d !== (sugerida ?? '').trim() ? { ...c, direccion: d } : c;
}

// ---------- fusionar con el existente (FR-51, FR-106) ----------

export type Prevalece = 'propuesta' | 'existente';
export type CampoFusion = 'racor' | 'caudal' | 'diametro_mm' | 'descripcion' | 'ubicacion';

export interface DiferenciaFusion {
  campo: CampoFusion;
  propuesta: string;
  existente: string;
}

/** Campos que difieren entre el alta y el punto existente: para cada uno, jefatura elige. */
export function diferenciasFusion(p: PropuestaPanel, existente: Punto): DiferenciaFusion[] {
  const d = p.datos ?? {};
  const difs: DiferenciaFusion[] = [];
  if (d.diametro_mm != null && Number(d.diametro_mm) !== existente.diametro_mm) {
    difs.push({
      campo: 'diametro_mm',
      propuesta: valorDe('diametro_mm', d.diametro_mm),
      existente: valorDe('diametro_mm', existente.diametro_mm),
    });
  }
  if (d.caudal && d.caudal !== existente.caudal) {
    difs.push({
      campo: 'caudal',
      propuesta: valorDe('caudal', d.caudal),
      existente: valorDe('caudal', existente.caudal),
    });
  }
  if (d.racor && d.racor !== existente.racor) {
    difs.push({ campo: 'racor', propuesta: valorDe('racor', d.racor), existente: valorDe('racor', existente.racor) });
  }
  // FR-106: "cada campo que difiere", y la descripción difiere a menudo (RV-18).
  const descripcion = typeof d.descripcion === 'string' ? d.descripcion.trim() : '';
  if (descripcion && descripcion !== (existente.descripcion ?? '').trim()) {
    difs.push({
      campo: 'descripcion',
      propuesta: valorDe('descripcion', descripcion),
      existente: valorDe('descripcion', existente.descripcion),
    });
  }
  if (p.lat != null && p.lng != null) {
    difs.push({
      campo: 'ubicacion',
      propuesta: T.panelCola.pinPropuesto(distancia(metros(existente, { lat: p.lat, lng: p.lng }))),
      existente: T.panelCola.ubicacionDe(existente.codigo),
    });
  }
  return difs;
}

// ---------- acciones (05 §6.2) ----------

/**
 * Tras moderar, el voluntario recibe su aviso al momento: se pide el envío a /api/push, una vez por
 * acción (también en los lotes), en vez de esperar a avisos.yml (RV-08, FR-163).
 */
function avisar<T>(r: Resultado<T>): Resultado<T> {
  if (r.ok) void pedirEnvioComoJefatura();
  return r;
}

/** Tras cambiar puntos, el inventario y el mapa se refrescan y se avisa. */
function refrescar<T>(r: Resultado<T>): Resultado<T> {
  if (r.ok) void sincronizar(null);
  return avisar(r);
}

export async function aprobar(
  id: string,
  correcciones: Record<string, unknown> | null,
  confirmarDesactualizada: boolean,
): Promise<Resultado<{ punto_id: string; codigo: string }>> {
  return refrescar(
    await rpc('fn_aprobar', {
      propuesta_id: id,
      correcciones: correcciones && Object.keys(correcciones).length ? correcciones : null,
      confirmar_desactualizada: confirmarDesactualizada,
    }),
  );
}

export interface ResultadoLote {
  propuesta_id: string;
  resultado: 'aprobada' | 'omitida';
  motivo: string | null;
}

export async function aprobarLote(ids: string[]): Promise<Resultado<ResultadoLote[]>> {
  const r = refrescar(await rpc<ResultadoLote[]>('fn_aprobar_lote', { propuesta_ids: ids }));
  if (r.ok && !Array.isArray(r.datos)) return { ok: false, codigo: 'ERROR_INTERNO' };
  return r;
}

const rechazarUna = (id: string, motivo: string) =>
  rpc<null>('fn_rechazar', { propuesta_id: id, motivo: motivo.trim() });

export const rechazar = async (id: string, motivo: string) => avisar(await rechazarUna(id, motivo));

/** Rechazo de varias con un motivo común: una a una; devuelve cuántas se rechazaron. */
export async function rechazarLote(ids: string[], motivo: string): Promise<{ hechas: number; fallos: string[] }> {
  const fallos: string[] = [];
  let hechas = 0;
  for (const id of ids) {
    const r = await rechazarUna(id, motivo);
    if (r.ok) hechas++;
    else fallos.push(r.codigo);
  }
  // Un solo envío de avisos para todo el lote.
  if (hechas) void pedirEnvioComoJefatura();
  return { hechas, fallos };
}

export async function fusionar(
  id: string,
  puntoId: string,
  prevalece: Partial<Record<CampoFusion, Prevalece>>,
): Promise<Resultado<{ punto_id: string; codigo: string }>> {
  return refrescar(await rpc('fn_fusionar_con_existente', { propuesta_id: id, punto_id: puntoId, prevalece }));
}

/** Dirección deducida con Nominatim (FR-105). Nunca bloquea: sin respuesta, null. */
export async function deducirDireccion(p: PropuestaPanel): Promise<string | null> {
  if (p.lat == null || p.lng == null) return null;
  const q = new URLSearchParams({ lat: String(p.lat), lng: String(p.lng), propuesta_id: p.id });
  const r = await funcion<{ direccion: string | null }>(`/api/direccion?${q}`);
  return r.ok ? r.datos.direccion : null;
}

// ---------- resultados en palabras (TR-36, UI-04) ----------

/** Por qué quedó fuera una propuesta del lote (FR-107). */
export function motivoOmitida(codigo: string | null): string {
  if (codigo?.startsWith('PROPUESTA_DESACTUALIZADA')) return T.panelCola.omitidaDesactualizada;
  if (codigo?.startsWith('PUNTO_NO_ACTIVO')) return T.panelCola.omitidaPuntoNoActivo;
  if (codigo?.startsWith('DIAMETRO_SIN_FIJAR')) return T.panelCola.omitidaDiametro;
  if (codigo?.startsWith('PROPUESTA_NO_PENDIENTE')) return T.panelCola.omitidaYaResuelta;
  if (codigo?.startsWith('PUNTO_OCUPADO')) return T.panelErrores.puntoOcupado;
  return T.panelCola.omitidaDatos;
}

/** Resumen del lote: "N aprobadas" y, si alguna quedó fuera, cuál y por qué. */
export function resumenLote(res: ResultadoLote[], nombre: (id: string) => string): string {
  const aprobadas = res.filter((r) => r.resultado === 'aprobada').length;
  const fuera = res.filter((r) => r.resultado === 'omitida');
  const base = T.panelCola.loteAprobadas(aprobadas);
  if (!fuera.length) return base;
  return `${base} ${T.panelCola.loteOmitidas(fuera.map((r) => `${nombre(r.propuesta_id)}: ${motivoOmitida(r.motivo)}`).join('; '))}`;
}
