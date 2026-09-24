// POST /api/geocodificar (05 §9, FR-73, TR-76, TR-118, DEC-092): números de portal para la búsqueda,
// con CartoCiudad (IGN/CNIG). Nunca anónima: no es un proxy abierto. El navegador solo habla con
// nuestro origen, así que la CSP no cambia y la IP del voluntario no llega a un tercero.
// La consulta no se registra en ningún sitio (11 §6.1): ni logs ni errores_cliente, y la caché la
// guarda por su sha256.

import {
  type Env,
  type Manejador,
  error,
  esAdmin,
  iguales,
  json,
  jwtDe,
  leerJson,
  rpc,
  sha256Hex,
} from '../_lib/comun.ts';
import { dentroDelLimite } from '../_lib/limite.ts';
import { cercaDeLaZona } from '../_lib/zona.ts';

export const FUENTE = 'CartoCiudad (IGN/CNIG)';
const BASE = 'https://www.cartociudad.es/geocoder/api/geocoder';
const NO_PROCESAR = 'municipio,provincia,comunidad autonoma,expendeduria,punto_recarga_electrica,ngbe,carretera';
/** Sin el filtro, "calle real 12" devuelve las de toda España y la de Albolote no entra en las diez. */
const MUNICIPIOS = 'Albolote,Calicasas';
const AGENTE_POR_DEFECTO = 'hidrantes-albolote/1.0 (+https://github.com/aron285-coder/hidrantes-albolote)';
export const TIEMPO_MAXIMO_MS = 5000; // TR-118
export const MAX_RESULTADOS = 5;
/** Resultados con 2 km de margen alrededor del recuadro de la zona. */
export const MARGEN_M = 2000;
const TREINTA_DIAS = 30 * 24 * 3600;
const MUNICIPIO_INE: Record<string, 'albolote' | 'calicasas'> = { '18003': 'albolote', '18037': 'calicasas' };

export interface Resultado {
  etiqueta: string;
  tipo: 'portal' | 'calle' | 'lugar';
  lat: number;
  lng: number;
  municipio: 'albolote' | 'calicasas' | null;
}

interface Candidato {
  id?: string;
  type?: string;
  address?: string;
  tip_via?: string | null;
  muni?: string;
  muniCode?: string;
  portalNumber?: number | null;
  lat?: number | null;
  lng?: number | null;
}

const TIPOS: Record<string, Resultado['tipo']> = {
  portal: 'portal',
  callejero: 'calle',
  toponimo: 'lugar',
  poblacion: 'lugar',
};

export const normalizarConsulta = (q: string) =>
  q
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** La clave de caché: sin el texto en claro (11). */
export async function claveCache(origen: string, q: string): Promise<string> {
  return `${origen}/__cache/geocodificar?q=${await sha256Hex(normalizarConsulta(q))}`;
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);
/** "CALLE REAL" → "Calle Real". Lo que ya viene en mayúsculas y minúsculas se deja. */
function titulo(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

/** "CALLE REAL 12, Albolote" → "Calle Real, 12, Albolote", como en 05 §9. */
export function etiquetaDe(c: Candidato): string {
  const direccion = (c.address ?? '').trim();
  const coma = direccion.lastIndexOf(', ');
  let via = coma >= 0 ? direccion.slice(0, coma) : direccion;
  const lugar = coma >= 0 ? direccion.slice(coma + 2) : c.muni && !direccion.includes(c.muni) ? c.muni : '';
  // En `find`, `address` es solo el nombre ("REAL") y el tipo de vía llega aparte.
  if (c.tip_via && !via.toUpperCase().startsWith(c.tip_via.toUpperCase())) via = `${c.tip_via} ${via}`;
  let numero = '';
  if (c.type === 'portal' && c.portalNumber != null) {
    via = via.replace(new RegExp(`\\s+${c.portalNumber}\\s*\\S*$`), '');
    numero = String(c.portalNumber);
  }
  return [titulo(via), numero, lugar].filter(Boolean).join(', ');
}

const conCoordenadas = (c: Candidato) =>
  typeof c.lat === 'number' && typeof c.lng === 'number' && (c.lat !== 0 || c.lng !== 0);

async function pedir<T>(url: string, agente: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { headers: { 'User-Agent': agente, Accept: 'application/json' }, signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

/**
 * Candidatos de CartoCiudad → resultados de la zona, con `find` para los que llegan sin coordenadas.
 * Un `find` que falla se salta y se sigue con los demás (docs/19 RV-63); si al final no queda
 * ninguno y alguno falló, es un fallo (503), no "no hay resultados".
 */
export async function geocodificar(q: string, agente: string, signal: AbortSignal): Promise<Resultado[]> {
  const parametros = new URLSearchParams({ q, limit: '10', no_process: NO_PROCESAR, municipio_filter: MUNICIPIOS });
  const candidatos = await pedir<Candidato[]>(`${BASE}/candidates?${parametros}`, agente, signal);
  const resultados: Resultado[] = [];
  let fallos = 0;
  for (const cand of Array.isArray(candidatos) ? candidatos : []) {
    if (resultados.length >= MAX_RESULTADOS) break;
    const tipo = cand.type ? TIPOS[cand.type] : undefined;
    if (!tipo) continue;
    let c = cand;
    if (!conCoordenadas(c) && (cand.type === 'portal' || cand.type === 'callejero') && cand.id) {
      const f = new URLSearchParams({ id: cand.id, type: cand.type });
      if (cand.portalNumber != null) f.set('portal', String(cand.portalNumber));
      try {
        c = { ...cand, ...(await pedir<Candidato>(`${BASE}/find?${f}`, agente, signal)), type: cand.type };
      } catch {
        // Fuera de tiempo, no hay más que hacer: lo que ya haya sale igual.
        if (signal.aborted) break;
        fallos++;
        continue;
      }
    }
    if (!conCoordenadas(c) || !cercaDeLaZona(c.lat!, c.lng!, MARGEN_M)) continue;
    const etiqueta = etiquetaDe(c);
    if (resultados.some((r) => r.etiqueta === etiqueta)) continue;
    resultados.push({ etiqueta, tipo, lat: c.lat!, lng: c.lng!, municipio: MUNICIPIO_INE[c.muniCode ?? ''] ?? null });
  }
  if (!resultados.length && (fallos > 0 || signal.aborted)) throw new Error('sin resultados por fallos');
  return resultados;
}

/**
 * Quién pregunta, o null: token de voluntario válido, sesión de administrador o, como /api/push, el
 * secreto de vigilancia (lo usa comprobar-despliegue para ver que la caché funciona, docs/19 RV-63).
 * Lo que devuelve es la clave del tope por token: nunca el token en claro.
 */
async function autorizado(request: Request, env: Env, cuerpo: Record<string, unknown> | null): Promise<string | null> {
  const vigilancia = request.headers.get('X-Vigilancia');
  if (vigilancia && env.VIGILANCIA_SECRETO) return iguales(vigilancia, env.VIGILANCIA_SECRETO) ? 'vigilancia' : null;
  const jwt = jwtDe(request);
  if (jwt) return (await esAdmin(env, jwt)) ? `jefatura:${await sha256Hex(jwt)}` : null;
  if (typeof cuerpo?.token !== 'string') return null;
  // Validar el token cuesta una lectura mínima: solo lo cambiado desde ahora.
  const r = await rpc(env, 'fn_listar_puntos', { token: cuerpo.token, desde: new Date().toISOString() });
  return r.ok ? `token:${await sha256Hex(cuerpo.token)}` : null;
}

export const onRequestPost: Manejador = async ({ request, env }) => {
  const cuerpo = await leerJson(request);
  const quien = await autorizado(request, env, cuerpo);
  if (!quien) return error(401, 'TOKEN_INVALIDO');
  // 30 por minuto por token: frena un bucle de cliente (RV-63).
  if (!dentroDelLimite(quien)) return error(429, 'DEMASIADOS_INTENTOS');
  const q = typeof cuerpo?.q === 'string' ? cuerpo.q.trim() : '';
  if (q.length < 3 || q.length > 120) return error(400, 'PAYLOAD_INVALIDO');

  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const clave = new Request(await claveCache(new URL(request.url).origin, q));
  const enCache = await cache?.match(clave).catch(() => undefined);
  if (enCache) {
    const guardado = (await enCache.json().catch(() => null)) as { resultados?: Resultado[] } | null;
    if (Array.isArray(guardado?.resultados)) {
      return json({ resultados: guardado.resultados, fuente: FUENTE }, 200, { 'x-hidrantes-cache': 'hit' });
    }
  }

  let resultados: Resultado[];
  try {
    resultados = await geocodificar(
      q,
      env.NOMINATIM_USER_AGENT || AGENTE_POR_DEFECTO,
      AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    );
  } catch {
    // Caído, respuesta rara o más de 5 s: la búsqueda sigue con calles, lugares y coordenadas (TR-118).
    return error(503, 'SIN_SERVIDOR');
  }
  // Sin resultados no se guarda: una calle nueva puede aparecer mañana.
  if (resultados.length && cache) {
    const respuesta = new Response(JSON.stringify({ resultados }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${TREINTA_DIAS}` },
    });
    await cache.put(clave, respuesta).catch(() => undefined);
  }
  // Para comprobar tras desplegar que la caché funciona de verdad en *.pages.dev (RV-63).
  return json({ resultados, fuente: FUENTE }, 200, { 'x-hidrantes-cache': 'miss' });
};
