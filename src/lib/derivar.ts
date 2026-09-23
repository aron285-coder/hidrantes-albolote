// Campos que v_puntos_activos calcula al leer (0002_vistas.sql) y que el móvil tiene que recalcular
// por su cuenta (RV-05, DEC-082): tras la primera sincronización solo recibe los puntos que
// cambiaron, así que un punto que cruza los 12 meses sin tocarse nunca le llegaría como "sin
// revisar", ni un cambio de escala_radios cambiaría el tamaño de los que no se modificaron.
// FR-61, FR-142 y 05 §10: el móvil aplica la config recibida en su siguiente sincronización.

import type { Caudal, Punto } from '../tipos/punto.ts';

export type EscalaRadios = [number, number, number, number, number];

export interface ConfigMovil {
  meses_revision: number;
  escala_radios: EscalaRadios;
  /** Longitud del tramo de manguera para FR-74 y FR-76 (FR-142, docs/18 GM-01). */
  metros_tramo_manguera: number;
}

/** El tramo que se usa si la config no lo trae o no sirve (05 §2.10). */
export const METROS_TRAMO_POR_DEFECTO = 20;

export const CONFIG_POR_DEFECTO: ConfigMovil = {
  meses_revision: 12,
  escala_radios: [11, 9, 7, 5.5, 5],
  metros_tramo_manguera: METROS_TRAMO_POR_DEFECTO,
};

/** Un entero de 10 a 30, como lo valida fn_guardar_config; si no, el de por defecto. */
export function leerMetrosTramo(v: unknown): number {
  const n = numero(v);
  return n !== null && Number.isInteger(n) && n >= 10 && n <= 30 ? n : METROS_TRAMO_POR_DEFECTO;
}

const PUNTOS_DIAMETRO: Record<number, number> = { 100: 3, 70: 2, 45: 1 };
const FACTOR_CAUDAL: Record<Caudal, number> = { bueno: 1, regular: 0.66, malo: 0.33, no_funciona: 0 };

/** Réplica exacta de hidrantes.fn_radio_px (0002_vistas.sql). */
export function radioPx(diametro_mm: number, caudal: Caudal, escala: EscalaRadios): number {
  const puntuacion = (PUNTOS_DIAMETRO[diametro_mm] ?? 0) * (FACTOR_CAUDAL[caudal] ?? 0);
  const indice = puntuacion >= 3.0 ? 0 : puntuacion >= 1.9 ? 1 : puntuacion >= 0.9 ? 2 : puntuacion > 0 ? 3 : 4;
  return escala[indice];
}

const dos = (n: number) => String(n).padStart(2, '0');

/**
 * Réplica de `fecha_ultima_revision < current_date - make_interval(months => meses)`. Como Postgres,
 * la resta de meses se queda en el último día del mes si el día no existe (31-mar − 1 mes = 28 o
 * 29-feb). `hoy` es la fecha local del móvil (Europe/Madrid); el servidor usa la suya, así que
 * alrededor de medianoche pueden diferir un día. Es aceptable: el aviso "sin revisar" no es exacto
 * al minuto.
 */
export function revisionCaducada(fecha: string, meses: number, hoy: Date = new Date()): boolean {
  const total = hoy.getFullYear() * 12 + hoy.getMonth() - meses;
  const anio = Math.floor(total / 12);
  const mes = total - anio * 12; // 0–11
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  const limite = `${anio}-${dos(mes + 1)}-${dos(Math.min(hoy.getDate(), diasDelMes))}`;
  return fecha.slice(0, 10) < limite;
}

export function derivar(p: Punto, c: ConfigMovil, hoy: Date = new Date()): Punto {
  return {
    ...p,
    radio_px: radioPx(p.diametro_mm, p.caudal, c.escala_radios),
    revision_caducada: revisionCaducada(p.fecha_ultima_revision, c.meses_revision, hoy),
  };
}

function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** La `config` de fn_listar_puntos, validada; null si no sirve (y entonces se usa la guardada). */
export function leerConfig(bruta: unknown): ConfigMovil | null {
  if (!bruta || typeof bruta !== 'object') return null;
  const c = bruta as Record<string, unknown>;
  const meses = numero(c.meses_revision);
  if (meses === null || meses < 1 || !Number.isInteger(meses)) return null;
  if (!Array.isArray(c.escala_radios) || c.escala_radios.length !== 5) return null;
  const escala = c.escala_radios.map(numero);
  if (escala.some((r) => r === null || r <= 0)) return null;
  return {
    meses_revision: meses,
    escala_radios: escala as EscalaRadios,
    metros_tramo_manguera: leerMetrosTramo(c.metros_tramo_manguera),
  };
}

/** Fecha local "AAAA-MM-DD", para saber si cambió el día desde la última derivación. */
export const diaLocal = (hoy: Date = new Date()) =>
  `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
