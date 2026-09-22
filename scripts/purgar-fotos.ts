// Purga de fotos huérfanas (FR-144, TR-53, TR-54; 04 §7). Una foto se sube a Storage **antes** de
// que exista la propuesta: si el envío se queda a medias, si jefatura rechaza o si el punto se
// purga de la papelera, el archivo se queda ocupando el gigabyte gratuito sin que nadie lo mire.
//
//   npm run purgar-fotos                 borra las huérfanas del bucket
//   npm run purgar-fotos -- --ensayo     dice cuáles borraría, sin tocar nada
//
// Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (y BUCKET, si no es el de producción). Quién
// decide qué se conserva es la base de datos, no este script: `fn_fotos_referenciadas` devuelve las
// fotos de los puntos, las de las propuestas pendientes o aprobadas y las reservadas en las últimas
// 24 h, que son las que pueden estar subiéndose ahora mismo desde un móvil sin cobertura.
//
// Lo lanza `purgar-fotos.yml`: semanalmente sin que nadie lo pida (TR-54) y desde Ajustes del panel
// (FR-144, FL-33). Borrar fotos no se puede deshacer, así que el guion se planta ante cualquier cosa
// que huela a error: si la lista de referenciadas viniera vacía con el bucket lleno, no borra nada.

import { type Deposito, depositoSupabase, rutasDelBucket } from './respaldo-fotos.ts';
import { abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';

export const BUCKET_POR_DEFECTO = 'hidrantes-fotos';
/** Storage acepta hasta 1.000 rutas por borrado; se va de cien en cien para no pasarse. */
export const POR_LOTE = 100;

export interface Archivo {
  ruta: string;
  bytes: number;
}

/** Las que están en el bucket y nadie referencia. El orden es el del bucket, para que sea estable. */
export function huerfanas(enBucket: Archivo[], referenciadas: Iterable<string>): Archivo[] {
  const vivas = new Set(referenciadas);
  return enBucket.filter((a) => !vivas.has(a.ruta));
}

/**
 * Por qué no se debe borrar, o null si se puede. Es la red de seguridad: una RPC que devuelve una
 * lista vacía por un fallo de permisos se parece mucho a "todas son huérfanas".
 */
export function motivoParaNoBorrar(enBucket: Archivo[], referenciadas: string[]): string | null {
  if (!enBucket.length) return null;
  if (!referenciadas.length) {
    return 'La base de datos no referencia ninguna foto y el bucket no está vacío: algo va mal, no se borra nada.';
  }
  return null;
}

export const bytesDe = (archivos: Archivo[]) => archivos.reduce((n, a) => n + a.bytes, 0);

/** Resumen de una pasada, tal cual lo lee quien mira el workflow. */
export function resumen(enBucket: Archivo[], aBorrar: Archivo[], ensayo: boolean): string {
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  const quedan = enBucket.length - aBorrar.length;
  return ensayo
    ? `Ensayo: ${aBorrar.length} de ${enBucket.length} fotos sobran (${mb(bytesDe(aBorrar))} MB). No se ha borrado nada.`
    : `${aBorrar.length} fotos huérfanas borradas (${mb(bytesDe(aBorrar))} MB). Quedan ${quedan} (${mb(bytesDe(enBucket) - bytesDe(aBorrar))} MB).`;
}

/** En lotes, para que un bucket grande no se vaya en una sola petición. */
export function lotes<T>(items: T[], tamano = POR_LOTE): T[][] {
  const partes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) partes.push(items.slice(i, i + tamano));
  return partes;
}

/** Lo que la base de datos manda conservar (04 §7). Solo la puede llamar service_role (11 §3). */
export async function referenciadas(url: string, servicio: string): Promise<string[]> {
  const r = await fetch(`${url}/rest/v1/rpc/fn_fotos_referenciadas`, {
    method: 'POST',
    headers: {
      apikey: servicio,
      Authorization: `Bearer ${servicio}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'hidrantes',
      'Accept-Profile': 'hidrantes',
    },
    body: '{}',
  }).catch(() => null);
  if (!r?.ok) abortar(`La base de datos respondió ${r ? r.status : 'nada'} al pedir las fotos referenciadas.`);
  const filas = (await r.json()) as unknown;
  if (!Array.isArray(filas)) abortar('Respuesta inesperada al pedir las fotos referenciadas.');
  return filas.filter((f): f is string => typeof f === 'string' && f.length > 0);
}

/** Borra rutas del bucket. Storage acepta la lista en el cuerpo de un DELETE sobre el bucket. */
export async function borrar(url: string, servicio: string, bucket: string, rutas: string[]): Promise<void> {
  for (const lote of lotes(rutas)) {
    const r = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { apikey: servicio, Authorization: `Bearer ${servicio}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: lote }),
    }).catch(() => null);
    if (!r?.ok) abortar(`Storage respondió ${r ? r.status : 'nada'} al borrar ${lote.length} fotos.`);
  }
}

/** Todas las fotos del bucket con su tamaño. */
export async function archivosDelBucket(deposito: Deposito): Promise<Archivo[]> {
  const conTamano = new Map<string, number>();
  const rutas = await rutasDelBucket({
    ...deposito,
    async listar(prefijo, pagina) {
      const lote = await deposito.listar(prefijo, pagina);
      for (const o of lote) {
        if (o.metadata) conTamano.set(prefijo ? `${prefijo}/${o.name}` : o.name, o.metadata.size ?? 0);
      }
      return lote;
    },
  });
  return rutas.map((ruta) => ({ ruta, bytes: conTamano.get(ruta) ?? 0 }));
}

async function principal(): Promise<void> {
  const { banderas } = argumentos();
  const ensayo = banderas.has('ensayo');
  const url = process.env.SUPABASE_URL ?? abortar('Falta SUPABASE_URL.');
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY ?? abortar('Falta SUPABASE_SERVICE_ROLE_KEY.');
  const bucket = process.env.BUCKET ?? BUCKET_POR_DEFECTO;

  log.paso(`Fotos huérfanas de ${bucket}${ensayo ? ' (ensayo)' : ''}`);
  const enBucket = await archivosDelBucket(depositoSupabase(url, servicio, bucket));
  const vivas = await referenciadas(url, servicio);
  log.info(`${enBucket.length} fotos en el bucket · ${vivas.length} referenciadas por la base de datos`);

  const motivo = motivoParaNoBorrar(enBucket, vivas);
  if (motivo) abortar(motivo);

  const sobran = huerfanas(enBucket, vivas);
  for (const a of sobran.slice(0, 20)) log.info(`sobra ${a.ruta}`);
  if (sobran.length > 20) log.info(`… y ${sobran.length - 20} más`);

  if (!ensayo && sobran.length) {
    await borrar(
      url,
      servicio,
      bucket,
      sobran.map((a) => a.ruta),
    );
  }

  // Los lee purgar-fotos.yml para anotar el resultado en Salud del sistema (FR-143).
  console.log(`borradas=${ensayo ? 0 : sobran.length}`);
  console.log(`bytes_liberados=${ensayo ? 0 : bytesDe(sobran)}`);
  console.log(`bytes_restantes=${bytesDe(enBucket) - (ensayo ? 0 : bytesDe(sobran))}`);
  log.ok(resumen(enBucket, sobran, ensayo));
}

if (import.meta.main) ejecutarScript(principal);
