// Las secuencias de los códigos de punto (HID-####, BOC-####) no retroceden nunca: un código dado,
// aunque se pierda en una restauración, puede estar apuntado en campo, y FR-10 dice "nunca
// reutilizado". La usan restaurar.ts (docs/18 RV-34) y promover-piloto.ts.

/** Uno de los dos, con su prefijo. */
const SECUENCIAS = [
  { secuencia: 'hidrantes.seq_codigo_hidrante', prefijo: 'HID-' },
  { secuencia: 'hidrantes.seq_codigo_boca', prefijo: 'BOC-' },
] as const;

/**
 * Deja cada secuencia en el mayor de tres valores: el que tiene ahora (el restaurado, o el del
 * destino), el mínimo que se pasa (lo que había antes de restaurar) y el mayor código en `puntos`.
 * Los mínimos llegan de psql y van dentro del SQL: solo enteros.
 */
export function sqlSecuenciasAlMenos(hid: number, boc: number): string {
  const minimos = [hid, boc];
  for (const n of minimos) {
    if (!Number.isInteger(n) || n < 0) throw new Error(`Mínimo de secuencia no válido: ${n}`);
  }
  return SECUENCIAS.map(
    ({ secuencia, prefijo }, i) => `
select setval('${secuencia}',
  greatest((select last_value from ${secuencia}), ${minimos[i]},
           coalesce((select max(substring(codigo from 5)::int) from hidrantes.puntos where codigo like '${prefijo}%'), 1)));`,
  ).join('');
}

/** Lo que se lee de las dos secuencias antes de restaurar; 0 si no existen (base vacía). */
export const SQL_LEER_SECUENCIAS = `
select coalesce((select last_value from hidrantes.seq_codigo_hidrante), 0) || ' ' ||
       coalesce((select last_value from hidrantes.seq_codigo_boca), 0);`;

/** "57 12" → { hid: 57, boc: 12 }; cualquier otra cosa (no existían) → ceros. */
export function leerSecuencias(salida: string): { hid: number; boc: number } {
  const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(salida);
  return m ? { hid: Number(m[1]), boc: Number(m[2]) } : { hid: 0, boc: 0 };
}
