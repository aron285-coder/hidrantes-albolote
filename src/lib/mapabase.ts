// Mapa base propio sin cobertura (FR-81, 04 §8). En línea se lee por rangos del despliegue; una vez
// descargado entero a Cache Storage, los rangos salen de ahí y el mapa funciona en modo avión. La
// versión del archivo desplegado viene de datos/mapabase.json (npm run mapabase).

import { FetchSource, type RangeResponse, type Source } from 'pmtiles';
import info from '../../datos/mapabase.json';
import { borrar, escribir, leer } from './almacen';

export const URL_MAPABASE = import.meta.env.VITE_MAPABASE_URL || '/mapabase/albolote.pmtiles';
export const VERSION_MAPABASE: string = info.version;
export const BYTES_MAPABASE: number = info.bytes;

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

/** Origen para `pmtiles`: lo descargado si existe; si no, el servidor por rangos. */
export class FuenteMapabase implements Source {
  private remota = new FetchSource(URL_MAPABASE);
  getKey = () => URL_MAPABASE;
  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    const local = await archivoGuardado();
    if (local) return { data: await local.slice(offset, offset + length).arrayBuffer() };
    return this.remota.getBytes(offset, length, signal, etag);
  }
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
