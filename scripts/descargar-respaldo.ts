// Descarga una copia cifrada del bucket R2 hidrantes-respaldos (docs/31 RV-133, DEC-173; 15 §5.3).
// El Worker no lee nada a propósito: se descarga con la sesión de `wrangler` de este ordenador.
//
//   npm run descargar-respaldo -- --fecha 2026-10-04            el volcado de ese día
//   npm run descargar-respaldo                                  el del domingo más reciente que haya
//   npm run descargar-respaldo -- --fotos 2026-10               el tar de fotos de ese mes
//   npm run descargar-respaldo -- --fecha 2026-10-04 --destino D:\respaldos
//
// Deja el archivo **cifrado** fuera del repositorio (por defecto en la carpeta temporal del sistema)
// y dice dónde. Descifrarlo y restaurar: 15 §5.3, pasos 3 y 4.

import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RAIZ, abortar, argumentos, ejecutar, ejecutarScript, log } from './lib/comun.ts';

export const BUCKET = 'hidrantes-respaldos';
/** Cuántos domingos hacia atrás se prueban sin --fecha: los del artefacto de GitHub y uno más. */
const SEMANAS = 14;

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Los domingos desde `hoy` hacia atrás (hoy incluido si es domingo), como AAAA-MM-DD. */
export function domingosAnteriores(hoy: Date, cuantos: number): string[] {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return Array.from({ length: cuantos }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() - 7 * i);
    return x.toISOString().slice(0, 10);
  });
}

export interface Pedido {
  claves: string[];
  destino: string;
}

/** Qué claves probar, en orden, y en qué carpeta dejar el archivo. */
export function pedido(valores: Map<string, string>, hoy = new Date(), tmp = os.tmpdir()): Pedido {
  const fecha = valores.get('fecha');
  const fotos = valores.get('fotos');
  if (fecha && fotos) abortar('Usa --fecha o --fotos, no los dos.');
  let claves: string[];
  if (fotos !== undefined) {
    if (!MES.test(fotos)) abortar('--fotos tiene que ser un mes: AAAA-MM.');
    claves = [`fotos/${fotos}.tar.gpg`];
  } else if (fecha !== undefined) {
    if (!FECHA.test(fecha)) abortar('--fecha tiene que ser AAAA-MM-DD.');
    claves = [`bd/${fecha}.sql.gpg`];
  } else {
    claves = domingosAnteriores(hoy, SEMANAS).map((d) => `bd/${d}.sql.gpg`);
  }
  const destino = path.resolve(valores.get('destino') ?? path.join(tmp, 'hidrantes-respaldos'));
  const relativa = path.relative(RAIZ, destino);
  if (relativa === '' || (!relativa.startsWith('..') && !path.isAbsolute(relativa))) {
    abortar('--destino está dentro del repositorio, que es público: elige una carpeta fuera (15 §5.3).');
  }
  return { claves, destino };
}

/** El archivo local: hidrantes-AAAA-MM-DD.sql.gpg o fotos-AAAA-MM.tar.gpg, como el artefacto. */
export const nombreLocal = (clave: string): string =>
  clave.startsWith('bd/') ? `hidrantes-${clave.slice(3)}` : `fotos-${clave.slice(6)}`;

/** Siempre contra el bucket remoto: sin --remote, wrangler 4 lee el de `wrangler dev`. */
export const argsDescarga = (clave: string, archivo: string): string[] => [
  'wrangler',
  'r2',
  'object',
  'get',
  `${BUCKET}/${clave}`,
  '--file',
  archivo,
  '--remote',
];

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const { claves, destino } = pedido(valores);
  mkdirSync(destino, { recursive: true });
  log.paso(`Copia de R2 (${BUCKET}) → ${destino}`);

  for (const clave of claves) {
    const archivo = path.join(destino, nombreLocal(clave));
    if (existsSync(archivo)) abortar(`${archivo} ya existe: no se sobrescribe. Bórralo o usa otro --destino.`);
    const r = ejecutar('npx', argsDescarga(clave, archivo));
    if (r.codigo === 0 && existsSync(archivo) && statSync(archivo).size > 0) {
      log.ok(`${clave} → ${archivo} (${(statSync(archivo).size / 1024).toFixed(0)} kB, cifrado)`);
      log.info('Siguiente: descifrarlo fuera del repositorio y restaurar (15 §5.3, pasos 3 y 4).');
      return;
    }
    // Lo que haya quedado a medias no sirve y bloquearía repetir.
    rmSync(archivo, { force: true });
    if (/not logged in|login|authentication/i.test(`${r.error}\n${r.salida}`)) {
      abortar('La sesión de wrangler ha caducado: npx wrangler login, y repite.');
    }
    if (claves.length === 1) abortar(`No está ${clave} en R2 (o no se ha podido leer).`);
    log.info(`no está ${clave}`);
  }
  abortar(`Ningún volcado de los últimos ${SEMANAS} domingos en R2. Indica --fecha con el día exacto.`);
}

if (import.meta.main) ejecutarScript(principal);
