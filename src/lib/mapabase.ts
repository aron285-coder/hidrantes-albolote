// Mapa base propio sin cobertura (FR-81, 04 §8). En línea se piden teselas sueltas del despliegue
// (/mapabase/t/<versión>/{z}/{x}/{y}.pbf): Cloudflare Pages no sirve rangos, así que leer el PMTiles
// por rangos dejaba el mapa en blanco (docs/20 RV-71, DEC-111). Una vez descargado el PMTiles entero a
// Cache Storage, las teselas salen de ahí y el mapa funciona en modo avión. La versión del archivo
// desplegado viene de datos/mapabase.json (npm run mapabase).

import { PMTiles, type RangeResponse, type Source } from 'pmtiles';
import info from '../../datos/mapabase.json';
import { borrar, escribir, leer } from './almacen';

export const URL_MAPABASE = import.meta.env.VITE_MAPABASE_URL || '/mapabase/albolote.pmtiles';
export const VERSION_MAPABASE: string = info.version;
export const BYTES_MAPABASE: number = info.bytes;
/** Carpeta de las teselas sueltas de esta versión: una versión nueva nunca mezcla teselas viejas. */
export const RUTA_TESELAS = `/mapabase/t/${VERSION_MAPABASE}`;
export const urlTesela = (z: number, x: number, y: number) => `${RUTA_TESELAS}/${z}/${x}/${y}.pbf`;

const CACHE = 'hidrantes-mapabase';
const CLAVE = 'mapabase';

export interface Descarga {
  version: string;
  bytes: number;
  fecha: number;
}

export interface EstadoMapabase {
  descargado: Descarga | null;
  /** 0–100 mientras descarga. */
  progreso: number | null;
  fallo: boolean;
}

let estado: EstadoMapabase = { descargado: leer<Descarga>(CLAVE), progreso: null, fallo: false };
const oyentes = new Set<() => void>();
function fijar(c: Partial<EstadoMapabase>) {
  estado = { ...estado, ...c };
  oyentes.forEach((o) => o());
}
export const estadoMapabase = () => estado;
export function suscribirMapabase(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Hay en el despliegue una versión distinta de la descargada: se ofrece bajarla (FR-81). */
export const hayVersionNuevaMapabase = (e = estado) => !!e.descargado && e.descargado.version !== VERSION_MAPABASE;

let blob: Promise<Blob | null> | null = null;

async function archivoGuardado(): Promise<Blob | null> {
  blob ??= (async () => {
    try {
      const r = await (await caches.open(CACHE)).match(URL_MAPABASE);
      return r ? await r.blob() : null;
    } catch {
      return null;
    }
  })();
  return blob;
}

/** Rangos por la copia descargada; sin ella no se lee nada (las teselas van sueltas). */
class ArchivoGuardado implements Source {
  getKey = () => URL_MAPABASE;
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const local = await archivoGuardado();
    if (!local) throw new Error('mapa base no descargado');
    return { data: await local.slice(offset, offset + length).arrayBuffer() };
  }
}

/**
 * ¿Está la tesela en el mapa base? Misma cuenta que scripts/lib/pmtiles.ts (`teselasDelRecuadro`):
 * los zooms de datos/mapabase.json y las teselas de Web Mercator que tocan su recuadro. Fuera no se
 * pide nada: Pages respondería con la página de la SPA y un 200.
 */
export function teselaEnMapabase(z: number, x: number, y: number, i: Pick<typeof info, 'zoom' | 'recuadro'> = info) {
  const [zMin, zMax] = i.zoom;
  if (z < zMin || z > zMax) return false;
  const [oeste, sur, este, norte] = i.recuadro;
  const n = 2 ** z;
  const tx = (lon: number) => Math.min(n - 1, Math.floor(((lon + 180) / 360) * n));
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n));
  };
  return x >= tx(oeste) && x <= tx(este) && y >= ty(norte) && y <= ty(sur);
}

/**
 * Origen del mapa base para `protomaps-leaflet`, que solo le pide `getZxy`. Tesela a tesela: si hay
 * copia descargada, del PMTiles de Cache Storage; si no, la tesela suelta del despliegue con un GET
 * normal, que el Service Worker guarda (config/cache-teselas.ts) para verla luego sin cobertura. No
 * se usa `ZxySource` de la librería: no sabe del recuadro y leería como tesela la página de la SPA
 * que Pages sirve con 200 para lo que no existe (DEC-111).
 */
export class FuenteMapabase extends PMTiles {
  constructor() {
    super(new ArchivoGuardado());
  }

  override async getZxy(z: number, x: number, y: number, signal?: AbortSignal): Promise<RangeResponse | undefined> {
    if (await archivoGuardado()) return super.getZxy(z, x, y, signal);
    if (!teselaEnMapabase(z, x, y)) return undefined;
    const r = await fetch(urlTesela(z, x, y), { signal });
    if (!r.ok || (r.headers.get('content-type') ?? '').startsWith('text/html')) return undefined;
    return { data: await r.arrayBuffer() };
  }
}

/**
 * ¿Es un PMTiles v3 del tamaño esperado? Los 7 primeros bytes son "PMTiles", el octavo la versión del
 * encabezado (3), y el tamaño está a ±1 % del de datos/mapabase.json (docs/19 RV-68).
 */
export function esMapabaseValido(inicio: Uint8Array, tamano: number, esperado = BYTES_MAPABASE): boolean {
  const firma = 'PMTiles';
  for (let i = 0; i < firma.length; i++) if (inicio[i] !== firma.charCodeAt(i)) return false;
  if (inicio[7] !== 3) return false;
  return Math.abs(tamano - esperado) <= esperado * 0.01;
}

/** Descarga completa con progreso; al terminar, el mapa ya no depende de la red. */
export async function descargarMapabase(): Promise<boolean> {
  if (estado.progreso !== null) return false;
  fijar({ progreso: 0, fallo: false });
  try {
    const r = await fetch(URL_MAPABASE, { cache: 'no-store' });
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
    const total = Number(r.headers.get('content-length')) || BYTES_MAPABASE;
    const lector = r.body.getReader();
    const trozos: Uint8Array[] = [];
    let recibido = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      trozos.push(value);
      recibido += value.length;
      fijar({ progreso: Math.min(99, Math.round((recibido / total) * 100)) });
    }
    const archivo = new Blob(trozos as BlobPart[], { type: 'application/octet-stream' });
    // Una página de error o una descarga a medias no se guarda como mapa base (docs/19 RV-68).
    const inicio = new Uint8Array(await archivo.slice(0, 8).arrayBuffer());
    if (!esMapabaseValido(inicio, archivo.size)) throw new Error('mapa base no válido');
    await (await caches.open(CACHE)).put(URL_MAPABASE, new Response(archivo));
    const descargado = { version: VERSION_MAPABASE, bytes: archivo.size, fecha: Date.now() };
    escribir(CLAVE, descargado);
    blob = Promise.resolve(archivo);
    fijar({ descargado, progreso: null });
    return true;
  } catch {
    fijar({ progreso: null, fallo: true });
    return false;
  }
}

/** ¿Se puede descargar sin preguntar? Con wifi o cuando el móvil no lo dice (iOS); nunca con ahorro de datos. */
export function conexionPermiteDescarga(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  if (!navigator.onLine || c?.saveData) return false;
  return !c?.type || c.type === 'wifi' || c.type === 'ethernet';
}

type ConexionRed = EventTarget & { type?: string; saveData?: boolean };
const conexionRed = () => (navigator as Navigator & { connection?: ConexionRed }).connection;

let escuchando = false;

/** Si falta y la conexión lo permite ahora, se descarga. La guarda de descargarMapabase evita dos a la vez. */
function siFaltaYSePuede() {
  if (estado.descargado) return quitarEscuchas();
  if (!conexionPermiteDescarga()) return;
  void descargarMapabase().then((ok) => ok && quitarEscuchas());
}

function ponerEscuchas() {
  if (escuchando || typeof window === 'undefined') return;
  escuchando = true;
  window.addEventListener('online', siFaltaYSePuede);
  conexionRed()?.addEventListener?.('change', siFaltaYSePuede);
}

function quitarEscuchas() {
  if (!escuchando) return;
  escuchando = false;
  window.removeEventListener('online', siFaltaYSePuede);
  conexionRed()?.removeEventListener?.('change', siFaltaYSePuede);
}

/**
 * Al arrancar: comprueba que lo descargado sigue en el móvil (iOS puede desalojarlo, TR-07) y, si
 * falta y la conexión lo permite, lo descarga solo (FR-81). Si ahora no se puede (sin red, datos
 * móviles), se vuelve a mirar al volver la red o al cambiar de conexión, no solo al arrancar
 * (RV-10). Con datos móviles no se descarga sin preguntar: el aviso del mapa ofrece el botón. Una
 * versión nueva se ofrece, no se fuerza.
 */
export async function iniciarMapabase(): Promise<void> {
  if (typeof caches === 'undefined') return;
  if (estado.descargado && !(await archivoGuardado())) {
    borrar(CLAVE);
    blob = null;
    fijar({ descargado: null });
  }
  if (estado.descargado) return;
  ponerEscuchas();
  if (conexionPermiteDescarga() && (await descargarMapabase())) quitarEscuchas();
}
