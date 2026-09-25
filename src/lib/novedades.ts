// Novedades de la versión instalada (FR-167, AC-127): salen del build, no de la base de datos
// (docs/17 RV-20, DEC-087). `npm run build` regenera src/generado/novedades.json desde CHANGELOG.md.
// Así las ve también el voluntario, que no puede llamar a fn_novedades, y sin red.
//
// Cada línea lleva la versión que la trajo (docs/23 RV-95, DEC-142). El JSON antiguo traía
// `lineas: string[]` y una sola `version` arriba: se sigue leyendo, con esa versión en cada línea.

import datos from '../generado/novedades.json';
import { escribir, leer } from './almacen';

export interface LineaNovedad {
  version: string;
  texto: string;
}

export interface NovedadesVersion {
  /** La última versión: la que marca "Nuevo" en Ajustes y el punto de la pestaña. */
  version: string | null;
  fecha: string | null;
  lineas: LineaNovedad[];
}

/** Lo que puede traer el JSON: el formato de hoy o el antiguo (`string[]`), que es el que hay en git. */
export interface NovedadesJson {
  version: string | null;
  fecha: string | null;
  lineas: readonly (string | LineaNovedad)[];
}

/**
 * Pasa el JSON al formato de hoy. Una línea antigua (solo texto) toma la `version` de arriba; sin esa
 * versión no hay número que ponerle y no se enseña (con el formato antiguo, ya era así).
 */
export function normalizarNovedades(n: NovedadesJson): NovedadesVersion {
  const lineas: LineaNovedad[] = [];
  for (const l of n.lineas) {
    if (typeof l === 'string') {
      if (n.version && l) lineas.push({ version: n.version, texto: l });
    } else if (l.version && l.texto) {
      lineas.push({ version: l.version, texto: l.texto });
    }
  }
  return { version: n.version, fecha: n.fecha, lineas };
}

export const NOVEDADES: NovedadesVersion = normalizarNovedades(datos);

const CLAVE_VISTAS = 'novedades_vistas';

/**
 * Hay novedades de una versión que este móvil todavía no ha visto en Ajustes. Solo si esa versión trae
 * alguna línea propia: si solo trajo cambios internos, las líneas son de versiones anteriores y
 * "Nuevo" junto a «0.6.4 · …» en la 0.6.5 diría lo contrario de la lista (DEC-142).
 */
export const hayNovedadesSinVer = (n: NovedadesVersion = NOVEDADES) =>
  !!n.version && n.lineas.some((l) => l.version === n.version) && leer<string>(CLAVE_VISTAS) !== n.version;

export function marcarNovedadesVistas(n: NovedadesVersion = NOVEDADES): void {
  if (n.version) escribir(CLAVE_VISTAS, n.version);
}
