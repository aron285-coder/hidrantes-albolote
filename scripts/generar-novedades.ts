// Novedades de Ajustes (FR-167, AC-127) desde CHANGELOG.md, en el build (docs/17 RV-20, DEC-087).
//
//   npx tsx scripts/generar-novedades.ts        (lo corre `prebuild`)
//
// Lee las entradas de release-please (`## [x.y.z](…) (fecha)`, `### Novedades`, `### Correcciones`)
// y escribe src/generado/novedades.json con la última versión y hasta tres líneas legibles para un
// voluntario: sin el ámbito en negrita, sin enlaces a PR ni commits y sin identificadores técnicos
// entre paréntesis. Primero las novedades, de la versión más reciente hacia atrás; si no llegan a
// tres, se completa con correcciones.
//
// Solo entran los ámbitos de cara al usuario (AMBITOS_USUARIO, DEC-091). Los códigos internos entre
// paréntesis se quitan; una línea con un código suelto, un archivo o un término técnico no entra
// (TERMINOS_TECNICOS, docs/20 RV-77, DEC-101): lo que sale aquí lo lee un voluntario en Ajustes
// (FR-167). Si no queda ninguna, `lineas: []` y Ajustes enseña su texto vacío (RV-47).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Novedades {
  version: string | null;
  fecha: string | null;
  lineas: string[];
}

export const MAX_LINEAS = 3;
export const MAX_CARACTERES = 140;

/**
 * Ámbitos de los commits `feat:` y `fix:` que cambian algo que ve un voluntario o jefatura. Los demás
 * (ci, sql, restauracion, vigilancia, pruebas…) son internos y no salen en Novedades (DEC-091).
 */
export const AMBITOS_USUARIO = new Set([
  'mapa',
  'lista',
  'ficha',
  'alta',
  'operaciones',
  'cola',
  'envios',
  'ajustes',
  'avisos',
  'panel',
  'cola-revision',
  'inventario',
  'fotos',
  'posicion',
  'mapabase',
  'diseño',
  'accesibilidad',
  'busqueda',
  'incidente',
  'medir',
  'compartir',
]);

/**
 * Un código interno, de cualquier serie: RV-52, GM-04, DEC-100, AC-127, y también uno que aún no
 * existe. Antes había una lista (RV, F, TR, FR, DEC, AC, UI) y GM-04 se coló en Ajustes (docs/20 RV-77).
 */
const CODIGO = String.raw`\b[A-Z]{1,4}-\d{1,3}\b|\bF\d+(?:\.\d+)?\b`;

/**
 * Palabras que un voluntario no tiene por qué entender. Una entrada que las lleve no sale en Novedades:
 * quitarlas dejaría la frase coja (DEC-101). Siglas en mayúsculas, el resto sin distinguir.
 */
export const TERMINOS_TECNICOS = [
  /\bworkers?\b/i,
  /\bcloudflare\b/i,
  /\bsupabase\b/i,
  /\bCI\b/,
  /\bworkflows?\b/i,
  /\btokens?\b/i,
  /\bbuild\b/i,
  /\bPRs?\b/,
  /\bmigraci(?:ón|ones)\b/i,
  /\bpgtap\b/i,
  /\be2e\b/i,
  /\bplaywright\b/i,
];

/** Una línea que nombra un archivo, un código interno suelto o un término técnico no es para un voluntario. */
const TECNICA = [/\w+\.(ts|tsx|yml|sql|md)\b/, new RegExp(CODIGO), ...TERMINOS_TECNICOS];

const ambitoDe = (linea: string) => /^\*\*([^*:]+):\*\*/.exec(linea)?.[1]?.trim().toLowerCase() ?? null;

/** Corta a MAX_CARACTERES, con puntos suspensivos si hace falta. */
const cortar = (s: string) => (s.length <= MAX_CARACTERES ? s : `${s.slice(0, MAX_CARACTERES - 1).trimEnd()}…`);

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
  // Paréntesis que solo llevan códigos: «(GM-04)», «(RV-52, DEC-097)», «(Fase 9)», «(#12)».
  const sinCodigos = sinEnlaces.replace(
    new RegExp(String.raw`\s*\((?:(?:${CODIGO}|Fase \d+|#\d+)(?:[,;]\s*)?)+\)`, 'g'),
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
        const ambito = ambitoDe(l);
        if (!ambito || !AMBITOS_USUARIO.has(ambito)) continue;
        // El filtro antes del corte: una ruta más allá del carácter 140 no se cuela (docs/19 RV-68).
        const entera = limpiar(l);
        if (!entera || TECNICA.some((t) => t.test(entera))) continue;
        const limpia = cortar(entera);
        if (!lineas.includes(limpia)) lineas.push(limpia);
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
