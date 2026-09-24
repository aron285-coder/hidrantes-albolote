// ¿Llegan en orden las migraciones de un PR? (docs/trabajo-en-paralelo.md §9.4, DEC-100). Solo lectura.
//
//   npx tsx scripts/comprobar-migraciones-nuevas.ts --base develop     (ci-calidad, solo en pull_request)
//
// migrar.ts aborta si una pendiente es anterior a la última aplicada: si dos PR toman el mismo número
// o uno más bajo, staging lo rechazaría después de fusionar. Aquí se ve antes:
// - una migración añadida tiene que tener un número mayor que la mayor de la rama base;
// - ninguna migración de la base se modifica ni se borra (CLAUDE.md §3).

import { abortar, argumentos, ejecutar, ejecutarScript, log } from './lib/comun.ts';

const CARPETA = 'supabase/migrations';

export interface Cambio {
  /** Letra de `git diff --name-status`: A añadida, M modificada, D borrada… */
  estado: string;
  archivo: string;
}

const numero = (archivo: string) => Number(/(\d{4})_[^/]*\.sql$/.exec(archivo)?.[1] ?? Number.NaN);
const cuatro = (n: number) => String(n).padStart(4, '0');

/** Lo que falla, en frases para el PR. `base` son los archivos de migración de la rama base. */
export function problemasDeMigraciones(cambios: Cambio[], base: string[], rama = 'develop'): string[] {
  const p: string[] = [];
  const sql = cambios.filter((c) => c.archivo.endsWith('.sql'));
  for (const c of sql.filter((c) => c.estado !== 'A')) {
    const que = c.estado === 'D' ? 'borra' : 'modifica';
    p.push(`${c.archivo}: el PR ${que} una migración que ya está en ${rama}; se corrige con otra nueva`);
  }
  const numerosBase = base.map(numero).filter((n) => !Number.isNaN(n));
  const mayor = numerosBase.length ? Math.max(...numerosBase) : 0;
  const nuevas = sql.filter((c) => c.estado === 'A').sort((a, b) => numero(a.archivo) - numero(b.archivo));
  let siguiente = Math.max(mayor, ...nuevas.map((c) => numero(c.archivo)).filter((n) => n > mayor)) + 1;
  for (const c of nuevas) {
    if (numero(c.archivo) > mayor) continue;
    p.push(`${c.archivo}: renumera a ${cuatro(siguiente++)}: ${rama} ya tiene hasta ${cuatro(mayor)}`);
  }
  return p;
}

/** Salida de `git diff --name-status --no-renames`: «A\truta». */
export function leerCambios(salida: string): Cambio[] {
  return salida
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [estado, archivo] = l.split('\t') as [string, string];
      return { estado: estado.charAt(0), archivo };
    });
}

function git(args: string[]): string {
  const r = ejecutar('git', args);
  if (r.codigo !== 0) abortar(`git ${args.join(' ')} ha fallado:\n${r.salida}`);
  return r.salida;
}

async function principal(): Promise<void> {
  const rama = argumentos().valores.get('base') ?? process.env.GITHUB_BASE_REF ?? abortar('Falta --base');
  const cambios = leerCambios(git(['diff', '--name-status', '--no-renames', `origin/${rama}...HEAD`, '--', CARPETA]));
  const base = git(['ls-tree', '--name-only', `origin/${rama}`, `${CARPETA}/`])
    .split(/\r?\n/)
    .filter(Boolean);
  const problemas = problemasDeMigraciones(cambios, base, rama);
  if (problemas.length) abortar(`Migraciones del PR:\n${problemas.map((x) => `- ${x}`).join('\n')}`);
  const nuevas = cambios.filter((c) => c.estado === 'A').length;
  log.ok(nuevas ? `${nuevas} migración(es) nueva(s), en orden sobre ${rama}.` : 'El PR no trae migraciones.');
}

if (import.meta.main) ejecutarScript(principal);
