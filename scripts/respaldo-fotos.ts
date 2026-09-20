// Copia el bucket de fotos a una carpeta local, para el respaldo mensual (04 §9, 15 §5.3).
//
//   npm run respaldo-fotos -- --destino fotos-2026-09-20
//
// Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (y BUCKET, si no es el de producción). Lo llama
// respaldo.yml, que después empaqueta la carpeta y la cifra con GPG: aquí no se cifra nada ni se
// sube nada, para que el mismo script sirva desde un portátil en una emergencia.
//
// Las fotos son datos personales por su contenido (11 §2): esta copia se queda en el artefacto
// cifrado del workflow y nunca en el repositorio.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';

export const BUCKET_POR_DEFECTO = 'hidrantes-fotos';
/** Storage devuelve como mucho 100 objetos por página si no se le pide otra cosa. */
export const POR_PAGINA = 100;

export interface ObjetoStorage {
  name: string;
  metadata?: { size?: number } | null;
}

/** Cuerpo de una petición de listado: Storage pagina con limit/offset dentro de un prefijo. */
export const cuerpoListado = (prefijo: string, pagina: number) => ({
  prefix: prefijo,
  limit: POR_PAGINA,
  offset: pagina * POR_PAGINA,
  sortBy: { column: 'name', order: 'asc' },
});

/**
 * Una carpeta viene sin metadata; un archivo siempre la trae. Storage mezcla las dos cosas en la
 * misma lista y, si se confunden, el respaldo se llevaría nombres de carpeta vacíos.
 */
export const esArchivo = (o: ObjetoStorage) => o.metadata != null;

export interface Deposito {
  listar: (prefijo: string, pagina: number) => Promise<ObjetoStorage[]>;
  descargar: (ruta: string) => Promise<Uint8Array>;
}

/** Recorre el bucket entero, carpeta a carpeta, y devuelve las rutas de todos los archivos. */
export async function rutasDelBucket(deposito: Deposito, prefijo = ''): Promise<string[]> {
  const rutas: string[] = [];
  for (let pagina = 0; ; pagina++) {
    const lote = await deposito.listar(prefijo, pagina);
    for (const o of lote) {
      const ruta = prefijo ? `${prefijo}/${o.name}` : o.name;
      if (esArchivo(o)) rutas.push(ruta);
      else rutas.push(...(await rutasDelBucket(deposito, ruta)));
    }
    if (lote.length < POR_PAGINA) return rutas;
  }
}

export function depositoSupabase(url: string, servicio: string, bucket: string): Deposito {
  const cabeceras = { Authorization: `Bearer ${servicio}`, apikey: servicio };
  return {
    async listar(prefijo, pagina) {
      const r = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: { ...cabeceras, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoListado(prefijo, pagina)),
      });
      if (!r.ok) abortar(`Storage respondió ${r.status} al listar "${prefijo || '/'}"`);
      return (await r.json()) as ObjetoStorage[];
    },
    async descargar(ruta) {
      const r = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURI(ruta)}`, { headers: cabeceras });
      if (!r.ok) abortar(`Storage respondió ${r.status} al descargar ${ruta}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  };
}

/** Descarga todas las fotos en `destino`, conservando las carpetas. Devuelve cuántas y cuántos bytes. */
export async function copiar(
  deposito: Deposito,
  destino: string,
  escribir: (ruta: string, datos: Uint8Array) => void,
): Promise<{ fotos: number; bytes: number }> {
  const rutas = await rutasDelBucket(deposito);
  let bytes = 0;
  for (const ruta of rutas) {
    const datos = await deposito.descargar(ruta);
    bytes += datos.byteLength;
    escribir(path.join(destino, ruta), datos);
  }
  return { fotos: rutas.length, bytes };
}

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const destino = valores.get('destino') ?? abortar('Falta --destino <carpeta>.');
  const url = process.env.SUPABASE_URL ?? abortar('Falta SUPABASE_URL.');
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY ?? abortar('Falta SUPABASE_SERVICE_ROLE_KEY.');
  const bucket = process.env.BUCKET ?? BUCKET_POR_DEFECTO;

  log.paso(`Fotos de ${bucket} → ${destino}`);
  const { fotos, bytes } = await copiar(depositoSupabase(url, servicio, bucket), destino, (ruta, datos) => {
    mkdirSync(path.dirname(ruta), { recursive: true });
    writeFileSync(ruta, datos);
  });
  // El tamaño lo enseña Salud del sistema (FR-143); lo escribe el workflow con este número.
  console.log(`fotos=${fotos}`);
  console.log(`bytes=${bytes}`);
  log.ok(`${fotos} fotos · ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

if (import.meta.main) ejecutarScript(principal);
