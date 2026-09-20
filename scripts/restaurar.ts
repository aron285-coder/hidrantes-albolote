// Restaura un volcado del esquema `hidrantes` (15 §5.3). Solo se usa en una emergencia y borra
// datos: por eso pide confirmación escrita y comprueba a dónde apunta antes de tocar nada.
//
//   npm run restaurar -- --entorno prod --archivo hidrantes.sql
//   npm run restaurar -- --entorno local --archivo hidrantes.sql   (el ensayo de la Fase 8)
//
// El archivo es el volcado ya descifrado (`gpg --decrypt hidrantes-«fecha».sql.gpg > hidrantes.sql`).
// La cadena de conexión sale de SUPABASE_DB_URL, o se pide sin mostrarla.
//
// Nunca toca el esquema `public`: es de la app de uniformidad (CLAUDE.md §3). Todo va en una
// transacción, así que un volcado a medias deja la base como estaba.

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { abortar, argumentos, ejecutarScript, log, preguntar, psql, RAIZ, type Resultado } from './lib/comun.ts';
import { LOCAL_MIGRADOR } from './migrar.ts';

/** Refs de Supabase por entorno (docs/entornos.md). No son secretos: identifican el proyecto. */
export const REFS: Record<string, string> = {
  staging: 'jowapbzawsebfpksnlqx',
  prod: 'cbgqirjqyltadpydpeyr',
};

/** El ref viaja en el usuario del pooler (`hidrantes_migrador.«ref»`) o en el host de la directa. */
export function refDeUrl(url: string): string | null {
  return (
    /:\/\/[^:/@]+\.([a-z0-9]{20})[:@]/.exec(url)?.[1] ?? /@db\.([a-z0-9]{20})\.supabase\.co/.exec(url)?.[1] ?? null
  );
}

/**
 * Un volcado nuestro solo habla de `hidrantes`. Si menciona objetos de `public`, o es de otra
 * aplicación o se hizo sin `--schema=hidrantes`: restaurarlo se llevaría por delante la app de
 * uniformidad, que vive en la misma base de datos (04 §5).
 */
export function tocaPublic(volcado: string): boolean {
  return /\b(create|drop|alter)\s+(schema\s+public|table\s+public\.|function\s+public\.)/i.test(volcado);
}

/** Parece un volcado del esquema que esperamos, y no un archivo cualquiera. */
export const pareceVolcado = (volcado: string): boolean =>
  /create schema (if not exists )?hidrantes/i.test(volcado) || /create table hidrantes\./i.test(volcado);

/**
 * Vacía el esquema sin borrarlo. `drop schema` + `create schema` sería lo evidente, pero crear un
 * esquema exige el permiso CREATE sobre la base de datos, y `hidrantes_migrador` no lo tiene ni
 * debe tenerlo (DEC-052): en una emergencia el script tiene que funcionar con la cadena que hay en
 * el secreto, sin pedir la contraseña de `postgres`. Se descubrió en el ensayo de la Fase 8.
 */
export const LIMPIAR_ESQUEMA = `
do $limpiar$
declare r record;
begin
  for r in select table_name from information_schema.views where table_schema = 'hidrantes' loop
    execute format('drop view if exists hidrantes.%I cascade', r.table_name);
  end loop;
  for r in select tablename from pg_tables where schemaname = 'hidrantes' loop
    execute format('drop table if exists hidrantes.%I cascade', r.tablename);
  end loop;
  for r in select p.oid::regprocedure as firma from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'hidrantes' loop
    execute format('drop routine if exists %s cascade', r.firma);
  end loop;
  for r in select t.typname from pg_type t
            join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'hidrantes' and t.typtype = 'e' loop
    execute format('drop type if exists hidrantes.%I cascade', r.typname);
  end loop;
end
$limpiar$;`;

/** Lo mismo, para el esquema que el volcado da por hecho que no existe. */
const CREAR_SI_FALTA = `
do $crear$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'hidrantes') then
    execute 'create schema hidrantes';
  end if;
end
$crear$;`;

/**
 * El volcado trae `CREATE SCHEMA hidrantes;` porque se hizo desde cero. Aquí el esquema ya está
 * (vacío), así que esa línea y el cambio de propietario sobran: fallarían por permisos.
 */
export const sinCrearEsquema = (volcado: string): string =>
  volcado
    .replace(/^CREATE SCHEMA (IF NOT EXISTS )?hidrantes;$/gim, '-- (el esquema ya existe)')
    .replace(/^ALTER SCHEMA hidrantes OWNER TO .*;$/gim, '-- (el propietario no se cambia)');

/**
 * Todo en una transacción: si el volcado falla a la mitad, la base se queda como estaba en vez de
 * quedarse a medio restaurar.
 */
export function sqlRestauracion(volcado: string, nombreArchivo: string, actor: string): string {
  return [
    'begin;',
    CREAR_SI_FALTA,
    LIMPIAR_ESQUEMA,
    sinCrearEsquema(volcado),
    // Que conste quién y cuándo, en el propio registro restaurado (11 §6, 15 §5.3).
    `insert into hidrantes.registro (actor, es_admin, accion, despues)
       values ('${actor.replaceAll("'", "''")}', true, 'restauracion_respaldo',
               jsonb_build_object('archivo', '${nombreArchivo.replaceAll("'", "''")}'));`,
    'commit;',
  ].join('\n');
}

/** Cuántas filas hay, o «?» si la tabla ni siquiera existe (base vacía, restauración a medias). */
const cuenta = (url: string, tabla: string): string =>
  psql(url, `select count(*) from hidrantes.${tabla};`, { tuplas: true }).salida.trim() || '?';

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const entorno = valores.get('entorno') ?? abortar('Indica --entorno local, staging o prod.');
  const archivo = valores.get('archivo') ?? abortar('Indica --archivo <volcado.sql> ya descifrado.');
  const ruta = path.resolve(RAIZ, archivo);

  const volcado = readFileSync(ruta, 'utf8');
  if (!pareceVolcado(volcado)) abortar(`${archivo} no parece un volcado del esquema hidrantes.`);
  if (tocaPublic(volcado)) abortar(`${archivo} toca el esquema public: no se restaura (es de la app de uniformidad).`);

  const url =
    entorno === 'local'
      ? LOCAL_MIGRADOR
      : (process.env.SUPABASE_DB_URL ??
        (await preguntar(`Cadena de conexión de ${entorno} (hidrantes_migrador)`, { oculto: true })));

  // Guarda del proyecto: restaurar producción sobre staging, o al revés, sería peor que el problema.
  const esperado = REFS[entorno];
  if (esperado) {
    const ref = refDeUrl(url);
    if (ref !== esperado) {
      abortar(`Esa cadena apunta al proyecto ${ref ?? 'desconocido'}, y --entorno ${entorno} es ${esperado}.`);
    }
  }
  if (psql(url, 'select 1;').codigo !== 0) abortar('No se puede conectar con esa cadena.');

  // El caso normal de 15 §5.3 son datos dañados: el esquema sigue ahí y se vacía. Si además ha
  // desaparecido (una base recién hecha), hay que crear la cáscara, y eso pide un permiso que
  // hidrantes_migrador no tiene a propósito (DEC-052). Se dice ahora, no a mitad de la restauración.
  const hayEsquema =
    psql(url, "select count(*) from information_schema.schemata where schema_name = 'hidrantes';", {
      tuplas: true,
    }).salida.trim() === '1';
  if (!hayEsquema) {
    const puedeCrear =
      psql(url, "select has_database_privilege(current_user, current_database(), 'CREATE');", {
        tuplas: true,
      }).salida.trim() === 't';
    if (!puedeCrear) {
      abortar(
        'El esquema hidrantes no existe y esta cadena no puede crearlo. Créalo una vez con la cadena de ' +
          'postgres y repite:\n  create schema hidrantes authorization hidrantes_migrador;',
      );
    }
  }

  log.paso(`Restaurar ${archivo} sobre ${entorno}`);
  log.info(`Volcado: ${(volcado.length / 1024 / 1024).toFixed(1)} MB`);
  if (hayEsquema) {
    log.info(`Ahora mismo hay ${cuenta(url, 'puntos')} puntos y ${cuenta(url, 'propuestas')} propuestas.`);
  }
  log.aviso('Se vacía el esquema hidrantes y se rehace desde el volcado. Lo posterior se pierde.');

  const escrito = await preguntar('Escribe RESTAURAR para continuar');
  if (escrito.trim() !== 'RESTAURAR') return log.info('Cancelado: no se ha tocado nada.');

  // El volcado y lo que lo envuelve van juntos a un archivo: psql lo lee de una sola vez, y así los
  // bloques COPY del volcado llegan enteros.
  const guion = path.join(RAIZ, 'restauracion.tmp.sql');
  let r: Resultado;
  try {
    writeFileSync(guion, sqlRestauracion(volcado, path.basename(ruta), `restauracion ${entorno}`));
    r = psql(url, `\\i '${guion.replaceAll('\\', '/')}'`);
  } finally {
    rmSync(guion, { force: true });
  }
  if (r.codigo !== 0) abortar(`La restauración ha fallado y no se ha cambiado nada:\n${r.error || r.salida}`);

  log.ok(`Restaurado: ${cuenta(url, 'puntos')} puntos y ${cuenta(url, 'propuestas')} propuestas.`);
  log.info('Comprueba el panel (Inventario y Registro) y la app en un móvil (15 §5.3, pasos 6 a 8).');
}

if (import.meta.main) ejecutarScript(principal);
