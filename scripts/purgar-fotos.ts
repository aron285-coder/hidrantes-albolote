// Purga de fotos huérfanas (FR-144, TR-53, TR-54; 04 §7). Una foto se sube a Storage **antes** de
// que exista la propuesta: si el envío se queda a medias, si jefatura rechaza o si el punto se
// purga de la papelera, el archivo se queda ocupando el gigabyte gratuito sin que nadie lo mire.
//
//   npm run purgar-fotos                 borra las huérfanas del bucket
//   npm run purgar-fotos -- --ensayo     dice cuáles borraría, sin tocar nada
//   npm run purgar-fotos -- --forzar     borra aunque sean más de max(50, 10 %) del bucket: solo a
//                                        mano y tras un --ensayo revisado; el workflow nunca lo pasa
//
// Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (y BUCKET, si no es el de producción). Quién
// decide qué se conserva es la base de datos, no este script: `fn_fotos_referenciadas_lista` devuelve
// las fotos de los puntos, las de las propuestas pendientes o aprobadas y las reservadas en los
// últimos `dias_reserva_subida` días, que pueden estar subiéndose ahora desde un móvil sin cobertura.
// Viene en una sola fila jsonb con su total: PostgREST corta en max_rows (1.000) cualquier RPC que
// devuelva un conjunto, y por encima de 1.000 fotos la antigua `fn_fotos_referenciadas` daba una
// lista truncada con la que se borraban fotos en uso (docs/18 RV-33).
//
// Lo lanza `purgar-fotos.yml`: semanalmente sin que nadie lo pida (TR-54) y desde Ajustes del panel
// (FR-144, FL-33). Borrar fotos no se puede deshacer, así que el guion se planta ante cualquier cosa
// que huela a error: una lista vacía con el bucket lleno, una lista de 1.000 justas (o un múltiplo) o
// una pasada que borraría más de max(50, 10 %) del bucket. Y justo antes de borrar vuelve a preguntar,
// para no llevarse la foto de una propuesta confirmada entre medias.

import { type Deposito, depositoSupabase, rutasDelBucket } from './respaldo-fotos.ts';
import { abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';

export const BUCKET_POR_DEFECTO = 'hidrantes-fotos';
/** Storage acepta hasta 1.000 rutas por borrado; se va de cien en cien para no pasarse. */
export const POR_LOTE = 100;
/** `max_rows` de PostgREST (supabase/config.toml y el valor por defecto de Supabase alojado). */
export const MAX_FILAS_POSTGREST = 1000;
/** Por encima de este número de fotos y de esta fracción del bucket, solo con --forzar. */
export const MAX_BORRADO = { fotos: 50, fraccion: 0.1 };

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
export function motivoParaNoBorrar(
  enBucket: Archivo[],
  referenciadas: string[],
  { forzar = false }: { forzar?: boolean } = {},
): string | null {
  if (!enBucket.length) return null;
  if (!referenciadas.length) {
    return 'La base de datos no referencia ninguna foto y el bucket no está vacío: algo va mal, no se borra nada.';
  }
  if (referenciadas.length % MAX_FILAS_POSTGREST === 0) {
    return `La base de datos referencia exactamente ${referenciadas.length} fotos, un múltiplo de max_rows (${MAX_FILAS_POSTGREST}): la lista puede venir truncada, no se borra nada.`;
  }
  const sobran = huerfanas(enBucket, referenciadas).length;
  const tope = Math.max(MAX_BORRADO.fotos, Math.floor(enBucket.length * MAX_BORRADO.fraccion));
  if (!forzar && sobran > tope) {
    const pct = Math.round((sobran / enBucket.length) * 100);
    return `Esta pasada borraría ${sobran} de ${enBucket.length} fotos (${pct} %), más de max(${MAX_BORRADO.fotos}, 10 %): revisa un --ensayo y, si está bien, lánzala a mano con --forzar. No se borra nada.`;
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
  const r = await fetch(`${url}/rest/v1/rpc/fn_fotos_referenciadas_lista`, {
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
  const cuerpo = (await r.json()) as { fotos?: unknown; total?: unknown } | null;
  if (!cuerpo || Array.isArray(cuerpo) || typeof cuerpo.total !== 'number') {
    abortar('Respuesta inesperada al pedir las fotos referenciadas.');
  }
  // jsonb_agg de ninguna fila es null.
  const fotos = cuerpo.fotos ?? [];
  if (!Array.isArray(fotos)) abortar('Respuesta inesperada al pedir las fotos referenciadas.');
  const validas = fotos.filter((f): f is string => typeof f === 'string' && f.length > 0);
  if (validas.length !== cuerpo.total) {
    abortar(
      `La lista de fotos referenciadas no cuadra: llegan ${validas.length} válidas y la base de datos dice ${cuerpo.total}. No se borra nada.`,
    );
  }
  return validas;
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

export interface Dependencias {
  archivos: () => Promise<Archivo[]>;
  referenciadas: () => Promise<string[]>;
  borrar: (rutas: string[]) => Promise<void>;
}

/**
 * Una pasada. Antes de borrar vuelve a pedir la lista: una propuesta confirmada mientras se listaba
 * el bucket tiene su foto ya subida, y esa foto no se toca.
 */
export async function purgar(
  d: Dependencias,
  { ensayo, forzar }: { ensayo: boolean; forzar: boolean },
): Promise<{ enBucket: Archivo[]; sobran: Archivo[]; borradas: number }> {
  const enBucket = await d.archivos();
  const vivas = await d.referenciadas();
  log.info(`${enBucket.length} fotos en el bucket · ${vivas.length} referenciadas por la base de datos`);

  const motivo = motivoParaNoBorrar(enBucket, vivas, { forzar });
  if (motivo) abortar(motivo);

  let sobran = huerfanas(enBucket, vivas);
  for (const a of sobran.slice(0, 20)) log.info(`sobra ${a.ruta}`);
  if (sobran.length > 20) log.info(`… y ${sobran.length - 20} más`);
  if (ensayo || !sobran.length) return { enBucket, sobran, borradas: 0 };

  const segunda = await d.referenciadas();
  const motivo2 = motivoParaNoBorrar(enBucket, segunda, { forzar });
  if (motivo2) abortar(motivo2);
  const antes = sobran.length;
  sobran = huerfanas(sobran, segunda);
  if (sobran.length < antes) {
    log.info(`${antes - sobran.length} han pasado a estar referenciadas mientras tanto: se quedan`);
  }
  await d.borrar(sobran.map((a) => a.ruta));
  return { enBucket, sobran, borradas: sobran.length };
}

async function principal(): Promise<void> {
  const { banderas } = argumentos();
  const ensayo = banderas.has('ensayo');
  const forzar = banderas.has('forzar');
  const url = process.env.SUPABASE_URL ?? abortar('Falta SUPABASE_URL.');
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY ?? abortar('Falta SUPABASE_SERVICE_ROLE_KEY.');
  const bucket = process.env.BUCKET ?? BUCKET_POR_DEFECTO;

  log.paso(`Fotos huérfanas de ${bucket}${ensayo ? ' (ensayo)' : ''}${forzar ? ' (forzada)' : ''}`);
  const { enBucket, sobran, borradas } = await purgar(
    {
      archivos: () => archivosDelBucket(depositoSupabase(url, servicio, bucket)),
      referenciadas: () => referenciadas(url, servicio),
      borrar: (rutas) => borrar(url, servicio, bucket, rutas),
    },
    { ensayo, forzar },
  );

  // Los lee purgar-fotos.yml para anotar el resultado en Salud del sistema (FR-143).
  const liberados = ensayo ? 0 : bytesDe(sobran);
  console.log(`borradas=${borradas}`);
  console.log(`bytes_liberados=${liberados}`);
  console.log(`bytes_restantes=${bytesDe(enBucket) - liberados}`);
  log.ok(resumen(enBucket, sobran, ensayo));
}

if (import.meta.main) ejecutarScript(principal);
