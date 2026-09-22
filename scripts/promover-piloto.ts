// Lleva a producción lo que los voluntarios levantaron en el piloto (04 §13, 09 Fase 9). Copia los
// puntos reales de staging —los que no llevan la marca `[PRUEBA]`— con sus propuestas aprobadas, su
// registro y sus fotos, **conservando los códigos**: HID-0007 en staging sigue siendo HID-0007 en
// producción, porque los voluntarios ya lo han apuntado así en campo.
//
//   npm run promover-piloto -- --ensayo     dice qué se llevaría, sin tocar nada
//   npm run promover-piloto                 lo hace, tras escribir PROMOVER
//
// Lo lanza `promover-piloto.yml`, que exige aprobación en el entorno `production`. Es idempotente:
// pasarlo dos veces no duplica nada, ni puntos ni fotos ni líneas de registro.
//
// Nunca toca el esquema `public` ni borra nada del destino: solo inserta lo que falta.

import { abortar, argumentos, ejecutarScript, log, preguntar, psql, psqlOk, type Resultado } from './lib/comun.ts';
import { REFS, refDeUrl } from './restaurar.ts';
import { BUCKETS, subir } from './restaurar-fotos.ts';

/** El prefijo del seed (CLAUDE.md §7): lo que empieza así es de mentira y no sube a producción. */
export const PREFIJO_PRUEBA = '[PRUEBA]';

export const CONFIRMACION = 'PROMOVER';

/** Qué se lleva: puntos activos cuya descripción no sea del seed. */
export const CONDICION_PUNTOS = `situacion = 'activo'
     and coalesce(descripcion, '') not like '${PREFIJO_PRUEBA}%'`;

export function esDePruebas(descripcion: string | null): boolean {
  return (descripcion ?? '').startsWith(PREFIJO_PRUEBA);
}

/**
 * El SQL que **genera** el SQL: se ejecuta en staging y devuelve las sentencias que se aplicarán en
 * producción. Así los datos viajan ya citados por Postgres (`%L`) y no hay que serializar a mano
 * geografías ni jsonb.
 *
 * Todo lleva su guarda de idempotencia:
 * - `puntos` y `propuestas` conservan su `id`, así que basta con `on conflict do nothing`.
 * - `registro` tiene el id autogenerado; se salta la fila si ya hay una igual (mismo momento, actor,
 *   acción, punto y propuesta), que es lo que deja una segunda pasada.
 */
export const SQL_GENERADOR = `
with elegidos as (
  select * from hidrantes.puntos where ${CONDICION_PUNTOS}
),
suyas as (
  -- Las propuestas aprobadas de esos puntos. Un alta no guarda punto_id (lo prohíbe su check): el
  -- punto que creó queda en correcciones->>'punto_id', de donde también lo saca Mis propuestas.
  select r.* from hidrantes.propuestas r
   where r.estado = 'aprobada'
     and (r.punto_id in (select id from elegidos)
          or (r.correcciones ->> 'punto_id')::uuid in (select id from elegidos))
)
-- Una sola columna: psql con -A -t separa las columnas con "|" y eso colaría dentro del guion.
select sentencia from (
select format(
  'insert into hidrantes.puntos (id, codigo, tipo, geom, diametro_mm, caudal, racor, descripcion_fallo,'
  || ' descripcion, direccion, foto_path, municipio, nucleo, situacion, fecha_ultima_revision,'
  || ' creado_en, actualizado_en) values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)'
  || ' on conflict do nothing;',
  p.id, p.codigo, p.tipo, p.geom, p.diametro_mm, p.caudal, p.racor, p.descripcion_fallo,
  p.descripcion, p.direccion, p.foto_path, p.municipio, p.nucleo, p.situacion, p.fecha_ultima_revision,
  p.creado_en, p.actualizado_en) as sentencia, 1 as orden
from elegidos p
union all
select format(
  'insert into hidrantes.propuestas (id, punto_id, operacion, datos, autor_nombre, autor_apellido,'
  || ' dispositivo_id, clave_local, origen_ubicacion, geom, gps_geom, precision_gps_m, exif_geom,'
  || ' distancia_gps_m, duplicado_de, distancia_duplicado_m, direccion_sugerida, foto_path, estado,'
  || ' motivo_rechazo, correcciones, revisada_por, revisada_en, creada_en)'
  || ' values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)'
  || ' on conflict do nothing;',
  r.id, r.punto_id, r.operacion, r.datos, r.autor_nombre, r.autor_apellido,
  r.dispositivo_id, r.clave_local, r.origen_ubicacion, r.geom, r.gps_geom, r.precision_gps_m, r.exif_geom,
  r.distancia_gps_m,
  -- duplicado_de apunta a un punto que quizá no viaje (uno del seed): entonces se deja en blanco,
  -- porque en destino esa clave ajena no existiría.
  (select e.id from elegidos e where e.id = r.duplicado_de), r.distancia_duplicado_m,
  r.direccion_sugerida, r.foto_path, r.estado, r.motivo_rechazo, r.correcciones, r.revisada_por,
  r.revisada_en, r.creada_en), 2
from suyas r
union all
select format(
  'insert into hidrantes.registro (momento, actor, dispositivo_id, es_admin, accion, punto_id,'
  || ' propuesta_id, antes, despues) select %L, %L, %L, %L, %L, %L, %L, %L, %L'
  || ' where not exists (select 1 from hidrantes.registro x where x.momento = %L and x.actor = %L'
  || ' and x.accion = %L and x.punto_id is not distinct from %L'
  || ' and x.propuesta_id is not distinct from %L);',
  g.momento, g.actor, g.dispositivo_id, g.es_admin, g.accion, g.punto_id,
  g.propuesta_id, g.antes, g.despues,
  g.momento, g.actor, g.accion, g.punto_id, g.propuesta_id), 3
from hidrantes.registro g
where g.punto_id in (select id from elegidos)
   or g.propuesta_id in (select id from suyas)
) guion order by orden;`;

/**
 * Las secuencias del destino tienen que quedar por encima de los códigos que acaban de entrar, o el
 * siguiente alta intentaría repetir uno (`codigo` es único y el alta fallaría).
 */
export const SQL_SECUENCIAS = `
select setval('hidrantes.seq_codigo_hidrante',
  greatest((select last_value from hidrantes.seq_codigo_hidrante),
           coalesce((select max(substring(codigo from 5)::int) from hidrantes.puntos where codigo like 'HID-%'), 1)));
select setval('hidrantes.seq_codigo_boca',
  greatest((select last_value from hidrantes.seq_codigo_boca),
           coalesce((select max(substring(codigo from 5)::int) from hidrantes.puntos where codigo like 'BOC-%'), 1)));`;

/** Cuántas sentencias de cada tabla trae el guion generado, para el informe. */
export function cuentaPorTabla(sentencias: string[]): Record<string, number> {
  const cuenta: Record<string, number> = { puntos: 0, propuestas: 0, registro: 0 };
  for (const s of sentencias) {
    const m = /insert into hidrantes\.(\w+)/.exec(s);
    if (m && m[1] in cuenta) cuenta[m[1]]++;
  }
  return cuenta;
}

/** Las rutas de foto que hay que copiar de un bucket al otro, sin repetir. */
export function fotosDe(sentencias: string[]): string[] {
  const rutas = new Set<string>();
  for (const s of sentencias) {
    for (const [, ruta] of s.matchAll(/'(fotos\/[^']+\.(?:jpg|jpeg|webp))'/gi)) rutas.add(ruta);
  }
  return [...rutas];
}

/** El informe que queda en el resumen del workflow y en la consola. */
export function informe(c: Record<string, number>, fotos: { copiadas: number; ya: number }, ensayo: boolean): string {
  const que = ensayo ? 'Se promoverían' : 'Promovido';
  return [
    `${que}: ${c.puntos} puntos, ${c.propuestas} propuestas aprobadas y ${c.registro} líneas de registro.`,
    ensayo ? `Fotos por copiar: ${fotos.copiadas}.` : `Fotos copiadas: ${fotos.copiadas} (${fotos.ya} ya estaban).`,
  ].join('\n');
}

// ---------- guardas ----------

/** Con propuestas pendientes en staging, la promoción se haría a medias (04 §13). */
export function colaPendiente(url: string): number {
  return Number(psqlOk(url, `select count(*) from hidrantes.propuestas where estado = 'pendiente';`, { tuplas: true }));
}

/** Una base en el propio ordenador no es producción de nadie: ahí se puede ensayar. */
export function esLocal(url: string): boolean {
  try {
    return ['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * El destino solo puede ser producción o una base local (para ensayar la promoción sobre una copia,
 * como se hizo con la restauración en la Fase 8). Cualquier otro proyecto de Supabase, no.
 */
export function compruebaDestino(url: string, ensayo: boolean): void {
  if (ensayo || esLocal(url)) return;
  const ref = refDeUrl(url);
  if (ref !== REFS.prod) abortar(`El destino no es el proyecto de producción (${REFS.prod}), sino ${ref ?? 'otro'}.`);
}

// ---------- fotos ----------

async function bajar(url: string, servicio: string, bucket: string, objeto: string): Promise<Uint8Array | null> {
  const r = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURI(objeto)}`, {
    headers: { Authorization: `Bearer ${servicio}`, apikey: servicio },
  });
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}

async function copiarFotos(
  rutas: string[],
  origen: { url: string; servicio: string; bucket: string },
  destino: { url: string; servicio: string; bucket: string },
): Promise<{ copiadas: number; ya: number; sin: string[] }> {
  let copiadas = 0;
  let ya = 0;
  const sin: string[] = [];
  for (const ruta of rutas) {
    const datos = await bajar(origen.url, origen.servicio, origen.bucket, ruta);
    if (!datos) {
      sin.push(ruta);
      continue;
    }
    if (await subir(destino.url, destino.servicio, destino.bucket, ruta, datos)) copiadas++;
    else ya++;
  }
  return { copiadas, ya, sin };
}

// ---------- principal ----------

function pedirUrl(nombre: string, variable: string): string {
  const url = process.env[variable];
  if (!url) abortar(`Falta ${variable} (la cadena de conexión de ${nombre}).`);
  return url;
}

async function principal(): Promise<void> {
  const { banderas, valores } = argumentos();
  const ensayo = banderas.has('ensayo');
  const origen = valores.get('origen') ?? pedirUrl('staging', 'SUPABASE_DB_URL_STAGING');
  const destino = valores.get('destino') ?? pedirUrl('producción', 'SUPABASE_DB_URL_PROD');

  log.paso(`Promoción del piloto${ensayo ? ' (ensayo: no se escribe nada)' : ''}`);
  compruebaDestino(destino, ensayo);
  if (origen === destino) abortar('El origen y el destino son la misma base de datos.');

  const pendientes = colaPendiente(origen);
  if (pendientes > 0) {
    abortar(`Quedan ${pendientes} propuestas pendientes en staging: hay que dejar la cola a cero antes (04 §13).`);
  }
  log.ok('La cola de staging está a cero');

  const guion = psqlOk(origen, SQL_GENERADOR, { tuplas: true });
  const sentencias = guion
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('insert into'));
  const cuenta = cuentaPorTabla(sentencias);
  const rutas = fotosDe(sentencias);
  log.info(
    `${cuenta.puntos} puntos, ${cuenta.propuestas} propuestas, ${cuenta.registro} de registro, ${rutas.length} fotos`,
  );
  if (!cuenta.puntos) abortar('No hay ningún punto real que promover: ¿seguro que el piloto ha dejado datos?');

  if (ensayo) {
    const codigos = [...guion.matchAll(/'(HID-\d{4}|BOC-\d{4})'/g)].map((m) => m[1]);
    log.info(`Códigos: ${[...new Set(codigos)].join(', ')}`);
    log.paso(informe(cuenta, { copiadas: rutas.length, ya: 0 }, true));
    return;
  }

  const escrito = await preguntar(`Escribe ${CONFIRMACION} para llevar esto a producción`);
  if (escrito !== CONFIRMACION) abortar('No se ha escrito la confirmación: no se ha tocado nada.');

  // Todo en una transacción: o entra el piloto entero o no entra nada.
  const r: Resultado = psql(destino, ['begin;', ...sentencias, SQL_SECUENCIAS, 'commit;'].join('\n'));
  if (r.codigo !== 0) abortar(`La promoción falló y no se ha escrito nada:\n${r.error || r.salida}`);
  log.ok('Puntos, propuestas y registro insertados; secuencias avanzadas');

  const fotos = { copiadas: 0, ya: 0, sin: [] as string[] };
  const servicioOrigen = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
  const servicioDestino = process.env.SUPABASE_SERVICE_ROLE_KEY_PROD;
  const urlOrigen = process.env.SUPABASE_URL_STAGING;
  const urlDestino = process.env.SUPABASE_URL_PROD;
  if (rutas.length && servicioOrigen && servicioDestino && urlOrigen && urlDestino) {
    Object.assign(
      fotos,
      await copiarFotos(
        rutas,
        { url: urlOrigen, servicio: servicioOrigen, bucket: BUCKETS.staging },
        { url: urlDestino, servicio: servicioDestino, bucket: BUCKETS.prod },
      ),
    );
    if (fotos.sin.length) log.aviso(`${fotos.sin.length} fotos no estaban en el bucket de staging: ${fotos.sin[0]}…`);
  } else if (rutas.length) {
    log.aviso('Sin las claves de Storage de los dos entornos: los puntos están, las fotos no se han copiado.');
  }

  log.paso(informe(cuenta, fotos, false));
}

if (import.meta.main) ejecutarScript(principal);
