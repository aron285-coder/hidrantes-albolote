// Novedades de la versión instalada (FR-167, AC-127): salen del build, no de la base de datos
// (docs/17 RV-20, DEC-087). `npm run build` regenera src/generado/novedades.json desde CHANGELOG.md.
// Así las ve también el voluntario, que no puede llamar a fn_novedades, y sin red.

import datos from '../generado/novedades.json';
import { escribir, leer } from './almacen';

export interface NovedadesVersion {
  version: string | null;
  fecha: string | null;
  lineas: string[];
}

export const NOVEDADES: NovedadesVersion = datos;

const CLAVE_VISTAS = 'novedades_vistas';

/** Hay novedades de una versión que este móvil todavía no ha visto en Ajustes. */
export const hayNovedadesSinVer = (n: NovedadesVersion = NOVEDADES) =>
  !!n.version && n.lineas.length > 0 && leer<string>(CLAVE_VISTAS) !== n.version;

export function marcarNovedadesVistas(n: NovedadesVersion = NOVEDADES): void {
  if (n.version) escribir(CLAVE_VISTAS, n.version);
}
