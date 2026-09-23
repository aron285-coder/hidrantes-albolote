// Novedades de Ajustes (FR-167, AC-127) desde CHANGELOG.md, en el build (docs/17 RV-20, DEC-087).
//
//   npx tsx scripts/generar-novedades.ts        (lo corre `prebuild`)
//
// Lee las entradas de release-please (`## [x.y.z](…) (fecha)`, `### Novedades`, `### Correcciones`)
// y escribe src/generado/novedades.json con la última versión y tres líneas legibles para un
// voluntario: sin el ámbito en negrita, sin enlaces a PR ni commits y sin identificadores técnicos
// entre paréntesis. Primero las novedades, de la versión más reciente hacia atrás; si no llegan a
// tres, se completa con correcciones.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Novedades {
  version: string | null;
  fecha: string | null;
  lineas: string[];
}

export const MAX_LINEAS = 3;

interface Version {
  version: string;
  fecha: string | null;
  novedades: string[];
  correcciones: string[];
}

function versiones(changelog: string): Version[] {
  const lista: Version[] = [];
  let actual: Version | null = null;
  let seccion: 'novedades' | 'correcciones' | null = null;
  for (const linea of changelog.split(/\r?\n/)) {
    const cabecera = /^##\s+\[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?\s*(?:\((\d{4}-\d{2}-\d{2})\))?/.exec(linea);
    if (cabecera) {
      actual = { version: cabecera[1]!, fecha: cabecera[2] ?? null, novedades: [], correcciones: [] };
      lista.push(actual);
      seccion = null;
      continue;
    }
    const titulo = /^###\s+(.+?)\s*$/.exec(linea);
    if (titulo) {
      const t = titulo[1]!.toLowerCase();
      seccion = t.startsWith('novedades') ? 'novedades' : t.startsWith('correcciones') ? 'correcciones' : null;
      continue;
    }
    const punto = /^\s*[*-]\s+(.+)$/.exec(linea);
    if (actual && seccion && punto) actual[seccion].push(punto[1]!);
  }
  return lista;
}

/** Una línea de release-please en español para un voluntario. */
export function limpiar(linea: string): string {
  const sinAmbito = linea.replace(/^\*\*[^*]+:\*\*\s*/, '');
  const sinEnlaces = sinAmbito
    .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, '') // ([#156](…)) ([2cbbde4](…))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // cualquier otro enlace: su texto
  const sinCodigos = sinEnlaces.replace(
    /\s*\((?:(?:F\d+(?:\.\d+)?|DEC-\d+|RV-\d+|FR-\d+|TR-\d+|AC-\d+|UI-\d+|Fase \d+|#\d+)(?:[,;]\s*)?)+\)/g,
    '',
  );
  const texto = sinCodigos
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;:,]$/, '');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function novedadesDe(changelog: string): Novedades {
  const lista = versiones(changelog);
  const lineas: string[] = [];
  for (const campo of ['novedades', 'correcciones'] as const) {
    for (const v of lista) {
      for (const l of v[campo]) {
        const limpia = limpiar(l);
        if (limpia && !lineas.includes(limpia)) lineas.push(limpia);
        if (lineas.length === MAX_LINEAS) break;
      }
      if (lineas.length === MAX_LINEAS) break;
    }
    if (lineas.length === MAX_LINEAS) break;
  }
  return { version: lista[0]?.version ?? null, fecha: lista[0]?.fecha ?? null, lineas };
}

function principal(): void {
  const raiz = path.resolve(import.meta.dirname, '..');
  const novedades = novedadesDe(readFileSync(path.join(raiz, 'CHANGELOG.md'), 'utf8'));
  const destino = path.join(raiz, 'src', 'generado', 'novedades.json');
  mkdirSync(path.dirname(destino), { recursive: true });
  writeFileSync(destino, `${JSON.stringify(novedades, null, 2)}\n`);
  console.log(`novedades ${novedades.version ?? '—'}: ${novedades.lineas.length} líneas`);
}

if (import.meta.main) principal();
