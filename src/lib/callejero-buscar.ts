// Búsqueda y geometría sobre el callejero (FR-73, docs/18 GM-04). Llega en su propio trozo junto con
// public/callejero.json (`cargarCallejero`): sin los datos no sirve, y así no pesa en el JS inicial
// (TR-11).

import { type Callejero, type EntradaCallejero, METROS_CALLE_CERCANA, type Municipio, RE_NUMERO } from './callejero';
import type { LatLng } from './coordenadas';
import { distanciaALinea, metros, puntoMasCercano } from './geometria';

export const MAX_RESULTADOS_CALLES = 8;

/** Tipos de vía y sus abreviaturas → la forma con la que se comparan (docs/18 GM-04 D). */
const TIPOS: [RegExp, string][] = [
  [/^(?:c\/|c\.|cl\.?|calle)$/, 'calle'],
  [/^(?:avda\.?|av\.?|avd\.?|avenida)$/, 'avenida'],
  [/^(?:pza\.?|pl\.?|plaza)$/, 'plaza'],
  [/^(?:ctra\.?|crta\.?|carretera)$/, 'carretera'],
  [/^(?:cmno\.?|cno\.?|camino)$/, 'camino'],
  [/^(?:urb\.?|urbanizacion)$/, 'urbanizacion'],
  [/^(?:po\.?|pso\.?|paseo)$/, 'paseo'],
];
/** Como `normalizar` de puntos.ts, copiada: importarla partiría puntos.ts en otro trozo (TR-11). */
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Palabras que no distinguen una calle de otra. */
const VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y']);

function tipoDe(palabra: string): string | null {
  for (const [re, tipo] of TIPOS) if (re.test(palabra)) return tipo;
  return null;
}

/** Palabras normalizadas, con "c/real" separado en "c/" y "real". */
function palabras(texto: string): string[] {
  return normalizar(texto)
    .replace(/^(c\/|c\.)(?=\S)/, '$1 ')
    .split(/[\s,]+/)
    .filter(Boolean);
}

interface Consulta {
  tipo: string | null;
  resto: string[];
}

function consulta(texto: string): Consulta {
  const sinNumero = texto.trim().replace(RE_NUMERO, '');
  const ps = palabras(sinNumero);
  const tipo = ps.length ? tipoDe(ps[0]!) : null;
  return { tipo, resto: (tipo ? ps.slice(1) : ps).filter((p) => !VACIAS.has(p)) };
}

function partesEntrada(e: EntradaCallejero) {
  const ps = palabras(e.n);
  const tipo = ps.length ? tipoDe(ps[0]!) : null;
  return { tipo, nombre: (tipo ? ps.slice(1) : ps).join(' ') };
}

/**
 * Calles y lugares que casan con el texto, como mucho 8. Tipos de vía opcionales y abreviados;
 * coincidencia por palabras, como `buscar()`. Primero los que empiezan por lo buscado, luego los del
 * mismo tipo de vía, luego los del municipio del centro del mapa.
 */
export function buscarCalles(c: Callejero, texto: string, municipio: Municipio | null = null): EntradaCallejero[] {
  const q = consulta(texto);
  if (!q.resto.length) return [];
  const candidatos: { e: EntradaCallejero; puntos: number }[] = [];
  for (const e of c.entradas) {
    const { tipo, nombre } = partesEntrada(e);
    if (!q.resto.every((p) => nombre.includes(p))) continue;
    const primera = nombre.split(' ').filter((p) => !VACIAS.has(p))[0] ?? '';
    let puntos = 0;
    if (primera.startsWith(q.resto[0]!)) puntos += 4;
    if (q.tipo && q.tipo === tipo) puntos += 2;
    if (municipio && e.m === municipio) puntos += 1;
    candidatos.push({ e, puntos });
  }
  return candidatos
    .sort((a, b) => b.puntos - a.puntos || a.e.n.length - b.e.n.length || a.e.n.localeCompare(b.e.n, 'es'))
    .slice(0, MAX_RESULTADOS_CALLES)
    .map((x) => x.e);
}

// ---------- geometría de una entrada ----------

const aLatLng = ([lng, lat]: [number, number]): LatLng => ({ lat, lng });

/** Punto de la entrada más cercano a `p`: en una calle, sobre su línea; en un lugar, el lugar. */
export function puntoCercano(e: EntradaCallejero, p: LatLng): LatLng {
  if (e.c) return aLatLng(e.c);
  let mejor: LatLng | null = null;
  let min = Infinity;
  for (const linea of e.g ?? []) {
    for (let i = 1; i < linea.length; i++) {
      const q = puntoMasCercano(p, aLatLng(linea[i - 1]!), aLatLng(linea[i]!));
      const d = metros(p, q);
      if (d < min) {
        min = d;
        mejor = q;
      }
    }
    if (linea.length === 1 && metros(p, aLatLng(linea[0]!)) < min) mejor = aLatLng(linea[0]!);
  }
  return mejor ?? p;
}

/** Recuadro [[sur, oeste], [norte, este]] de la entrada. */
export function recuadroDe(e: EntradaCallejero): [[number, number], [number, number]] {
  const puntos = e.c ? [e.c] : (e.g ?? []).flat();
  let [s, o, n, es] = [90, 180, -90, -180];
  for (const [lng, lat] of puntos) {
    s = Math.min(s, lat);
    n = Math.max(n, lat);
    o = Math.min(o, lng);
    es = Math.max(es, lng);
  }
  return [
    [s, o],
    [n, es],
  ];
}

/** La calle a menos de 60 m de `p` (docs/18 GM-02), o null. */
export function calleCercana(c: Callejero, p: LatLng, max = METROS_CALLE_CERCANA): string | null {
  let mejor: string | null = null;
  let min = max;
  for (const e of c.entradas) {
    if (e.t !== 'calle') continue;
    for (const linea of e.g ?? []) {
      const d = distanciaALinea(p, linea.map(aLatLng));
      if (d < min) {
        min = d;
        mejor = e.n;
      }
    }
  }
  return mejor;
}

/** Municipio de la entrada más cercana a `p`: el desempate de la búsqueda por el centro del mapa. */
export function municipioCercano(c: Callejero, p: LatLng): Municipio | null {
  let mejor: Municipio | null = null;
  let min = Infinity;
  for (const e of c.entradas) {
    if (!e.m) continue;
    const q = e.c ?? e.g?.[0]?.[0];
    if (!q) continue;
    const d = metros(p, aLatLng(q));
    if (d < min) {
      min = d;
      mejor = e.m;
    }
  }
  return mejor;
}
