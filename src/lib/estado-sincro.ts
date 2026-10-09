// La píldora de la cabecera (docs/33 RV-311, U2): el estado de la sincronización en dos palabras, a
// la derecha de «Puntos de agua». Sustituye a la franja «Sincronizado hace…» y a la de sin conexión.

import type { EstadoConexion } from './conexion';
import { hace } from './formato';
import { T } from './textos';

/**
 * Hasta aquí los datos están «al día». Se sincroniza al abrir y al volver la conexión; con más de una
 * hora el sello pasa a ámbar y dice cuánto («hace 2 h»), como el mockup de U2.
 */
export const AL_DIA_MS = 3600_000;

export type Punto = 'verde' | 'ambar' | 'gris';

export type Pildora = { tipo: 'sin_servidor'; texto: string } | { tipo: 'normal'; texto: string; punto: Punto };

export function pildora(
  conexion: EstadoConexion,
  guardadoEn: number | null,
  sincronizando: boolean,
  puntos: number,
  ahora = Date.now(),
): Pildora {
  if (conexion === 'sin_servidor') return { tipo: 'sin_servidor', texto: T.mapa.sinServidor };
  // Sin cobertura, gris, y con la fecha de los datos a la vista (FR-80): «sin conexión · hace 2 h».
  if (conexion === 'sin_cobertura') {
    const texto = guardadoEn ? T.mapa.sinConexionHace(hace(guardadoEn, new Date(ahora))) : T.mapa.sinConexion;
    return { tipo: 'normal', texto, punto: 'gris' };
  }
  if (!guardadoEn) {
    return { tipo: 'normal', texto: sincronizando ? T.mapa.sincronizando : T.ajustes.sinSincronizar, punto: 'gris' };
  }
  if (ahora - guardadoEn < AL_DIA_MS) {
    return { tipo: 'normal', texto: T.mapa.alDia(puntos), punto: 'verde' };
  }
  return { tipo: 'normal', texto: hace(guardadoEn, new Date(ahora)), punto: 'ambar' };
}

/**
 * Lo que oye el lector de pantalla: solo el estado, que cambia pocas veces. El «hace N» cambia cada
 * minuto y no se anuncia (docs/31 RV-157).
 */
export function estadoAnunciado(conexion: EstadoConexion, guardadoEn: number | null, sincronizando: boolean): string {
  if (conexion === 'sin_servidor') return T.mapa.sinServidor;
  if (!guardadoEn) return sincronizando ? T.mapa.sincronizando : T.ajustes.sinSincronizar;
  return conexion === 'sin_cobertura' ? T.mapa.sinCoberturaSolo : T.mapa.sincronizadoSolo;
}
