// Revisa que el bucket de fotos siga teniendo los límites que lo protegen (04 §7, TR-45; `docs/41`
// RV-540). Los pone el arranque y nadie los volvía a mirar: el proyecto de Supabase es el de la app
// de uniformidad, y un cambio desde su panel (otro tamaño, otro tipo, `public` quitado) dejaba el
// bucket abierto o las fotos invisibles sin que nadie se enterara.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… BUCKET=hidrantes-fotos node scripts/revisar-bucket.ts
//
// Solo lee (`GET /storage/v1/bucket/<id>`). Solo módulos de Node (DEC-198): corre en la vigilancia
// con secretos y sin `node_modules`. Escribe una línea por diferencia en la salida estándar, sin
// claves ni URL (11 §6). Sale con 0 aunque haya diferencias —las recoge la vigilancia— y con 1 si no
// ha podido ni empezar.

import { CONFIG_BUCKET_FOTOS, diferenciasDelBucket } from './lib/bucket-fotos.ts';

export type Pedir = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Lo que hay que avisar del bucket: las diferencias con `CONFIG_BUCKET_FOTOS`, o que no se ha podido
 * mirar. Nunca lleva la clave ni la URL del proyecto.
 */
export async function revisar(
  urlProyecto: string,
  claveServicio: string,
  bucket: string,
  pedir: Pedir = fetch,
): Promise<string[]> {
  let r: Response;
  try {
    r = await pedir(`${urlProyecto}/storage/v1/bucket/${bucket}`, {
      headers: { Authorization: `Bearer ${claveServicio}`, apikey: claveServicio },
    });
  } catch {
    return ['el bucket de fotos no responde: no se han podido revisar sus límites'];
  }
  if (!r.ok) return [`el bucket de fotos no responde: no se han podido revisar sus límites (HTTP ${r.status})`];
  let cuerpo: unknown;
  try {
    cuerpo = await r.json();
  } catch {
    return ['la respuesta del bucket de fotos no se entiende'];
  }
  return diferenciasDelBucket(cuerpo, CONFIG_BUCKET_FOTOS);
}

async function principal(): Promise<number> {
  const url = process.env.SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.BUCKET;
  if (!url || !servicio || !bucket) {
    console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o BUCKET.');
    return 1;
  }
  const problemas = await revisar(url, servicio, bucket);
  for (const p of problemas) console.log(p);
  console.error(
    problemas.length ? `Bucket de fotos: ${problemas.length} diferencia(s).` : 'Bucket de fotos: como debe.',
  );
  return 0;
}

if (import.meta.main) {
  principal().then(
    (codigo) => process.exit(codigo),
    () => {
      // Sin el error: podría llevar la URL del proyecto.
      console.error('La revisión del bucket de fotos ha fallado sin terminar.');
      process.exit(1);
    },
  );
}
