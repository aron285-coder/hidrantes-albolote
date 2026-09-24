// Las seis operaciones (FR-40–FR-46, 05 §7): qué falta para poder enviar (el motivo que se escribe
// bajo el botón deshabilitado, UI-02) y qué se manda a fn_proponer. Funciones puras: sin red ni
// pantalla, para poder probar cada regla.

import type { Caudal, Punto, Racor, TipoPunto } from '../tipos/punto';
import { T } from './textos';

export type Operacion = 'alta' | 'revision' | 'estado' | 'datos' | 'ubicacion' | 'retirada';
export const OPERACIONES_SOBRE_PUNTO: Operacion[] = ['revision', 'estado', 'datos', 'ubicacion', 'retirada'];
export type MotivoRapido = 'obras' | 'asfaltado' | 'sustituido' | 'otro';

export interface Coordenadas {
  lat: number;
  lng: number;
}

/**
 * Ruta del alta con el pin ya puesto donde se pulsó el mapa (DEC-077). Seis decimales, que son los
 * ~10 cm de TR-61: más dígitos serían precisión inventada.
 */
export const rutaAltaEn = (lat: number, lng: number) => `/proponer/alta?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`;

/** Las coordenadas de esa ruta, o null si no vienen, no son números o no son de este planeta. */
export function coordenadasDe(lat: string | null, lng: string | null): Coordenadas | null {
  const a = Number(lat);
  const b = Number(lng);
  if (lat === null || lng === null || lat.trim() === '' || lng.trim() === '') return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lng: b };
}

export interface Formulario {
  operacion: Operacion;
  tipo?: TipoPunto;
  diametro?: 70 | 100 | 'otro';
  diametroOtro?: string;
  racor?: Racor;
  caudal?: Caudal;
  fallo?: string;
  descripcion?: string;
  nota?: string;
  motivoRapido?: MotivoRapido;
  motivo?: string;
  /** Pin elegido (alta, ubicación). */
  pin?: Coordenadas;
  /** El pin se movió respecto al GPS. */
  pinMovido?: boolean;
  gps?: (Coordenadas & { precision: number }) | null;
  exif?: Coordenadas | null;
  hayFoto?: boolean;
}

const lleno = (s?: string) => !!s && s.trim().length > 0;

/**
 * Campos que cambian en "corregir datos" respecto al punto (FR-44). El tipo no está entre ellos: no
 * se cambia una vez creado; se corrige retirando el punto y dando de alta el correcto (FR-11, DEC-090).
 */
export function cambiosDatos(f: Formulario, p: Punto): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (p.tipo === 'boca_riego') {
    if (p.diametro_mm !== 45) c.diametro_mm = 45;
    if ((f.racor ?? p.racor) !== p.racor) c.racor = f.racor ?? p.racor;
  } else {
    const d = f.diametro === 70 || f.diametro === 100 ? f.diametro : p.diametro_mm;
    if (d !== p.diametro_mm) c.diametro_mm = d;
  }
  const desc = f.descripcion ?? p.descripcion ?? '';
  if (desc.trim() !== (p.descripcion ?? '').trim()) c.descripcion = desc.trim() || null;
  return c;
}

/**
 * Lo primero que falta para poder enviar, en el orden en que se rellena la pantalla; null si está
 * completo. Los textos son los de 06 Apéndice A.
 */
export function queFalta(f: Formulario, p: Punto | null): string | null {
  const a = T.avisosFormulario;
  switch (f.operacion) {
    case 'alta':
      if (!f.pin) return a.muevePin;
      if (!f.tipo) return a.eligeTipo;
      if (f.tipo === 'hidrante' && !f.diametro) return a.eligeDiametro;
      if (f.tipo === 'hidrante' && f.diametro === 'otro' && !medidaValida(f.diametroOtro)) return a.indicaMedida;
      if (f.tipo === 'boca_riego' && !f.racor) return a.eligeRacor;
      if (!f.caudal) return a.eligeEstado;
      if (f.caudal === 'no_funciona' && !lleno(f.fallo)) return a.describeFallo;
      if (!f.hayFoto) return a.faltaFoto;
      return null;
    case 'revision':
      return f.hayFoto ? null : a.faltaFoto;
    case 'estado':
      if (!f.caudal) return a.eligeEstado;
      if (f.caudal === 'no_funciona' && !lleno(f.fallo)) return a.describeFallo;
      return f.hayFoto ? null : a.faltaFoto;
    case 'datos': {
      if (!p) return a.sinCambios;
      if (p.tipo === 'boca_riego' && !(f.racor ?? p.racor)) return a.eligeRacor;
      return Object.keys(cambiosDatos(f, p)).length ? null : a.sinCambios;
    }
    case 'ubicacion':
      if (!f.pin || !p || !f.pinMovido) return a.muevePin;
      return f.hayFoto ? null : a.faltaFoto;
    case 'retirada':
      if (!f.motivoRapido) return a.eligeMotivo;
      if (!lleno(f.motivo)) return a.explicaMotivo;
      return f.hayFoto ? null : a.faltaFoto;
  }
}

export function medidaValida(texto?: string): boolean {
  const n = Number(String(texto ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 20 && n <= 300;
}

/** Argumentos de fn_proponer salvo token y foto_path, que se ponen al enviar (05 §6, §7). */
export interface ArgumentosPropuesta {
  clave_local: string;
  autor_nombre: string;
  autor_apellido: string;
  operacion: Operacion;
  punto_id: string | null;
  datos: Record<string, unknown>;
  origen: 'gps' | 'manual' | null;
  lat: number | null;
  lng: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  precision_gps_m: number | null;
  exif_lat: number | null;
  exif_lng: number | null;
}

const sinVacios = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

/** `datos` de 05 §7: solo lo que la operación admite. */
export function datosDe(f: Formulario, p: Punto | null): Record<string, unknown> {
  const nota = lleno(f.nota) ? f.nota!.trim() : undefined;
  switch (f.operacion) {
    case 'alta': {
      const hidrante = f.tipo === 'hidrante';
      return sinVacios({
        tipo: f.tipo,
        diametro_mm: hidrante ? (f.diametro === 'otro' ? undefined : f.diametro) : 45,
        diametro_otro: hidrante && f.diametro === 'otro' ? Number(String(f.diametroOtro).replace(',', '.')) : undefined,
        racor: hidrante ? undefined : f.racor,
        caudal: f.caudal,
        descripcion_fallo: f.caudal === 'no_funciona' ? f.fallo?.trim() : undefined,
        descripcion: f.descripcion?.trim(),
      });
    }
    case 'revision':
    case 'ubicacion':
      return sinVacios({ nota });
    case 'estado':
      return sinVacios({
        caudal: f.caudal,
        descripcion_fallo: f.caudal === 'no_funciona' ? f.fallo?.trim() : undefined,
        nota,
      });
    case 'datos':
      return p ? cambiosDatos(f, p) : {};
    case 'retirada':
      return { motivo_rapido: f.motivoRapido, motivo: f.motivo?.trim() };
  }
}

export function argumentos(
  f: Formulario,
  p: Punto | null,
  autor: { nombre: string; apellido: string },
  claveLocal: string,
): ArgumentosPropuesta {
  const conPin = f.operacion === 'alta' || f.operacion === 'ubicacion';
  return {
    clave_local: claveLocal,
    autor_nombre: autor.nombre,
    autor_apellido: autor.apellido,
    operacion: f.operacion,
    punto_id: f.operacion === 'alta' ? null : (p?.id ?? null),
    datos: datosDe(f, p),
    origen: conPin ? (f.pinMovido || !f.gps ? 'manual' : 'gps') : null,
    lat: conPin ? (f.pin?.lat ?? null) : null,
    lng: conPin ? (f.pin?.lng ?? null) : null,
    gps_lat: f.gps?.lat ?? null,
    gps_lng: f.gps?.lng ?? null,
    precision_gps_m: f.gps ? Math.round(f.gps.precision) : null,
    exif_lat: f.exif?.lat ?? null,
    exif_lng: f.exif?.lng ?? null,
  };
}

/** Las operaciones que llevan foto obligatoria (FR-21; corregir datos no, 05 §6). */
export const necesitaFoto = (o: Operacion) => o !== 'datos';
