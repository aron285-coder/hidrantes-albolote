// Restaura un volcado del esquema `hidrantes` (15 §5.3). Solo se usa en una emergencia y borra
// datos: por eso pide confirmación escrita y comprueba a dónde apunta antes de tocar nada.
//
//   npm run restaurar -- --entorno prod --archivo hidrantes.sql
//   npm run restaurar -- --entorno local --archivo hidrantes.sql   (el ensayo de la Fase 8)
//   npm run restaurar -- --entorno local --archivo x.sql --confirmar RESTAURAR   (CI, sin preguntar)
//
// El archivo es el volcado ya descifrado **fuera del repositorio** (15 §5.3:
// `gpg --decrypt hidrantes-«fecha».sql.gpg > /tmp/hidrantes.sql`); dentro solo si Git lo ignora.
// La cadena de conexión sale de SUPABASE_DB_URL, o se pide sin mostrarla.
//
// --entorno es exactamente local, staging o prod (produccion vale por prod), y la cadena tiene que
// ser de ese proyecto (docs/31 RV-134). En staging y prod, antes de vaciar el esquema guarda una
// copia previa cifrada de lo que hay en ~/hidrantes-copias-previas; si no puede, no sigue.
//
// Nunca toca el esquema `public`: es de la app de uniformidad (CLAUDE.md §3). Todo va en una
// transacción, así que un volcado a medias deja la base como estaba.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  abortar,
  argumentos,
  comprobarCadena,
  type Entorno,
  ejecutar,
  ejecutarScript,
  entornoPg,
  errorSeguro,
  leerEntorno,
  log,
  preguntar,
  psql,
  RAIZ,
  REFS,
  refDeUrl,
  type Resultado,
  rutaPsql,
} from './lib/comun.ts';
import {
  type AccesoActual,
  leerAcceso,
  SQL_LEER_ACCESO,
  sinAcceso,
  sqlComprobarAcceso,
  sqlReponerAcceso,
  sqlReponerAccesoCuerpo,
} from './lib/acceso-restaurado.ts';
import { leerSecuencias, SQL_LEER_SECUENCIAS, sqlSecuenciasAlMenos } from './lib/secuencias.ts';
import { LOCAL_MIGRADOR, dirMigraciones, migrarPendientes } from './migrar.ts';

export { sqlReponerAcceso, sqlSecuenciasAlMenos };
// Los refs y la guarda del proyecto viven en lib/comun.ts (docs/31 RV-134); se reexportan para
// quien ya los importaba de aquí.
export { REFS, refDeUrl };

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
  -- Las secuencias sueltas (seq_codigo_hidrante, seq_codigo_boca) no son de ninguna columna y no
  -- caen con las tablas: si quedaran, el CREATE SEQUENCE del volcado fallaría y se desharía todo
  -- (RV-13). Las de identidad ya se fueron con su tabla.
  for r in select c.relname from pg_class c
            join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'hidrantes' and c.relkind = 'S' loop
    execute format('drop sequence if exists hidrantes.%I cascade', r.relname);
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

/** Época nueva de los datos: los móviles que la vean distinta repiten una sincronización completa. */
export const epocaNueva = (quien: string) => `insert into hidrantes.config (clave, valor, actualizado_por)
  values ('epoca_datos', to_jsonb(gen_random_uuid()::text), '${quien.replaceAll("'", "''")}')
  on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;`;

export const EPOCA_NUEVA = epocaNueva('restaurar.ts');

/** La fila de auditoría de la restauración (11 §6, 15 §5.3). */
export const insertAuditoria = (actor: string, nombreArchivo: string) =>
  `insert into hidrantes.registro (actor, es_admin, accion, despues)
       values ('${actor.replaceAll("'", "''")}', true, 'restauracion_respaldo',
               jsonb_build_object('archivo', '${nombreArchivo.replaceAll("'", "''")}'));`;

/**
 * Un volcado anterior a 0010 no admite la acción 'restauracion_respaldo' en el check de
 * registro.accion: insertarla desharía toda la restauración (RV-13). Si no la admite, se anota
 * después, una vez migrado.
 */
export const auditoriaCondicional = (actor: string, nombreArchivo: string) => `
do $auditoria$
begin
  if exists (select 1 from pg_constraint c
              where c.conrelid = 'hidrantes.registro'::regclass and c.contype = 'c'
                and pg_get_constraintdef(c.oid) like '%restauracion_respaldo%') then
    ${insertAuditoria(actor, nombreArchivo)}
  else
    raise notice 'volcado anterior a 0010: se anota tras migrar';
  end if;
end
$auditoria$;`;

/**
 * `--confirmar RESTAURAR` evita la pregunta, y solo contra el Supabase local: es para CI. Contra
 * staging o producción siempre se escribe a mano.
 */
export function confirmacionAutomatica(entorno: string, confirmar: string | undefined): boolean {
  if (confirmar === undefined) return false;
  if (entorno !== 'local')
    abortar('--confirmar solo se admite con --entorno local: en staging y producción se escribe a mano.');
  if (confirmar !== 'RESTAURAR') abortar('--confirmar tiene que ser exactamente RESTAURAR.');
  return true;
}

/**
 * Lo que hay que hacer a mano si la restauración se queda a medias después del commit. Siempre es el
 * último mensaje (docs/19 RV-55).
 */
export const ACCIONES_MANUALES =
  'Haz ahora, a mano y en este orden: 1) genera un código nuevo en Ajustes con «Revocar todos los dispositivos»; 2) revisa Administradores en Ajustes y da de baja a quien no deba estar; 3) avisa al grupo del código nuevo (15 §5.3).';

/** Lo que se repone dentro de la misma transacción que el volcado (docs/19 RV-55). */
export interface Reponer {
  previas: { hid: number; boc: number };
  acceso: AccesoActual | null;
}

/**
 * Todo en una transacción: si el volcado falla a la mitad, la base se queda como estaba en vez de
 * quedarse a medio restaurar. Las secuencias y el acceso de ahora van **dentro**, antes del commit:
 * si después falla una migración, el código viejo, los móviles revocados y los administradores de
 * baja no vuelven a valer, y ningún código se repite (docs/19 RV-55). Solo usan columnas de 0001, así
 * que valen con cualquier volcado.
 */
export function sqlRestauracion(volcado: string, nombreArchivo: string, actor: string, reponer?: Reponer): string {
  return [
    'begin;',
    CREAR_SI_FALTA,
    LIMPIAR_ESQUEMA,
    sinCrearEsquema(volcado),
    // Época nueva: los móviles que la vean distinta repiten una sincronización completa, porque lo
    // restaurado vuelve con actualizado_en antiguos que la incremental no recogería (RV-06).
    EPOCA_NUEVA,
    ...(reponer
      ? [
          sqlSecuenciasAlMenos(reponer.previas.hid, reponer.previas.boc),
          reponer.acceso && !sinAcceso(reponer.acceso) ? sqlReponerAccesoCuerpo(reponer.acceso) : '',
        ]
      : []),
    // Que conste quién y cuándo, en el propio registro restaurado (11 §6, 15 §5.3), si el volcado
    // lo admite; si no, tras migrar.
    auditoriaCondicional(actor, nombreArchivo),
    'commit;',
  ].join('\n');
}

/** Cuántas filas hay, o «?» si la tabla ni siquiera existe (base vacía, restauración a medias). */
const cuenta = (url: string, tabla: string): string =>
  psql(url, `select count(*) from hidrantes.${tabla};`, { tuplas: true }).salida.trim() || '?';

/**
 * Un volcado descifrado lleva en claro nombres, correos y el hash del código, y el repositorio es
 * público (DEC-053). Dentro del repositorio solo se acepta si Git lo ignora; lo normal es tenerlo
 * fuera, en el directorio temporal del sistema (15 §5.3, docs/18 RV-37).
 */
export function motivoArchivoInseguro(ruta: string, raiz: string, ignorado: (ruta: string) => boolean): string | null {
  const relativa = path.relative(raiz, ruta);
  const dentro = relativa !== '' && !relativa.startsWith('..') && !path.isAbsolute(relativa);
  if (!dentro || ignorado(ruta)) return null;
  return `${relativa} está dentro del repositorio y Git no lo ignora: un volcado lleva datos personales en claro y el repositorio es público. Descífralo fuera (en %TEMP% o /tmp, 15 §5.3) y vuelve a lanzar la restauración.`;
}

/** `git check-ignore -q` sale con 0 si la ruta está ignorada. */
export const ignoradoPorGit = (ruta: string): boolean =>
  ejecutar('git', ['check-ignore', '-q', ruta], { cwd: RAIZ }).codigo === 0;

/** Una carpeta propia en el directorio temporal del sistema, nunca bajo el repositorio. */
export const carpetaTemporal = (): string => mkdtempSync(path.join(os.tmpdir(), 'hidrantes-'));

/**
 * Lo que hay ahora. Si el esquema existe pero no se puede leer, **no se restaura**: después no habría
 * forma de reponer el código, los móviles revocados ni los administradores (docs/19 RV-55). No es lo
 * mismo que no haber esquema, que no tiene nada que reponer.
 */
export function motivoSinAcceso(codigo: number): string | null {
  return codigo === 0
    ? null
    : 'No se ha podido leer el acceso actual (código, móviles y administradores): no se restaura, porque después no se podría reponer y volverían a valer el código y los móviles del volcado. Revisa la conexión y repite.';
}

function accesoActual(url: string): AccesoActual {
  const r = psql(url, SQL_LEER_ACCESO, { tuplas: true });
  const motivo = motivoSinAcceso(r.codigo);
  if (motivo) abortar(motivo);
  const a = leerAcceso(r.salida);
  log.info(
    `acceso actual leído: ${a.dispositivos ? JSON.parse(a.dispositivos).length : 0} dispositivos, ${a.administradores ? JSON.parse(a.administradores).length : 0} administradores`,
  );
  return a;
}

/** "psql (PostgreSQL) 17.6 (Ubuntu …)" o "-- Dumped by pg_dump version 17.6" → [17, 6]. */
export function versionDe(texto: string, patron: RegExp): [number, number] | null {
  const m = patron.exec(texto);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null;
}

const menor = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/**
 * pg_dump 17.6 o posterior escribe `\restrict` y `\unrestrict` en los volcados en texto plano, y un
 * psql anterior los rechaza: con ON_ERROR_STOP la restauración aborta a medias (docs/19 RV-64). Se
 * comprueba antes de tocar nada: psql tiene que ser al menos de la versión que escribió el volcado, y
 * 17.6 si el volcado trae `\restrict`. Devuelve el motivo para abortar, o null.
 */
export function motivoVersionPsql(salidaVersion: string, volcado: string): string | null {
  const psql = versionDe(salidaVersion, /psql \(PostgreSQL\) (\d+)(?:\.(\d+))?/);
  if (!psql) return 'No se puede saber la versión de psql (psql --version). Instala psql 17.6 o posterior (15 §5.3).';
  const dump = versionDe(volcado.slice(0, 4000), /^-- Dumped by pg_dump version (\d+)(?:\.(\d+))?/m);
  const conRestrict = /^\\restrict\b/m.test(volcado);
  const necesaria: [number, number] | null = conRestrict && (!dump || menor(dump, [17, 6])) ? [17, 6] : dump;
  if (!necesaria || !menor(psql, necesaria)) return null;
  return (
    `Tu psql es ${psql.join('.')} y el volcado lo escribió pg_dump ${dump ? dump.join('.') : 'desconocido'}` +
    `${conRestrict ? ' con \\restrict' : ''}: psql lo rechazaría a medias. Instala psql ${necesaria.join('.')} o ` +
    'posterior (15 §5.3) y repite. No se ha tocado nada.'
  );
}

// ---------- copia previa (docs/31 RV-134) ----------

/** Donde quedan las copias previas: en la carpeta personal, nunca bajo el repositorio público. */
export const CARPETA_COPIAS = path.join(os.homedir(), 'hidrantes-copias-previas');

/**
 * La huella de la clave de respaldo, la de docs/entornos.md (la mantiene arranque.ts). Quien restaura
 * la ha importado en el paso 3 de 15 §5.3, así que puede descifrar la copia previa con la misma clave.
 */
export function huellaRespaldo(
  texto = readFileSync(path.join(RAIZ, 'docs', 'entornos.md'), 'utf8'),
  env = process.env.RESPALDO_GPG_HUELLA,
): string {
  const huella = env?.trim() || /Huella GPG de respaldos \| `([0-9A-F]{40})`/.exec(texto)?.[1];
  if (!huella || !/^[0-9A-F]{40}$/.test(huella)) {
    abortar('No encuentro la huella de la clave de respaldo en docs/entornos.md (o en RESPALDO_GPG_HUELLA).');
  }
  return huella;
}

/** pg_dump, de la misma instalación que psql. */
export function rutaPgDump(psqlRuta = rutaPsql()): string {
  return psqlRuta === 'psql' ? 'pg_dump' : psqlRuta.replace(/psql(\.exe)?$/i, (_m, exe = '') => `pg_dump${exe}`);
}

export interface Orden {
  comando: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

/** pg_dump del esquema hidrantes, igual que respaldo.yml, cifrado con gpg sin pasar por el disco. */
export function ordenesCopiaPrevia(
  url: string,
  archivo: string,
  huella: string,
  pgDump = rutaPgDump(),
): [Orden, Orden] {
  return [
    { comando: pgDump, args: ['--schema=hidrantes', '--no-owner', '--format=plain'], env: entornoPg(url) },
    {
      comando: 'gpg',
      args: ['--batch', '--yes', '--trust-model', 'always', '--encrypt', '--recipient', huella, '--output', archivo],
    },
  ];
}

export interface Canal {
  codigoA: number;
  codigoB: number;
  error: string;
}

/** `a | b` sin shell: la salida de a entra por la entrada de b. Nunca guarda en disco lo de en medio. */
export function canalizar(a: Orden, b: Orden): Promise<Canal> {
  return new Promise((listo) => {
    let error = '';
    const fin: { a?: number; b?: number } = {};
    const terminar = () => {
      if (fin.a !== undefined && fin.b !== undefined) listo({ codigoA: fin.a, codigoB: fin.b, error });
    };
    const pa = spawn(a.comando, a.args, { env: { ...process.env, ...a.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const pb = spawn(b.comando, b.args, { env: { ...process.env, ...b.env }, stdio: ['pipe', 'ignore', 'pipe'] });
    pa.stderr.on('data', (d) => (error += d));
    pb.stderr.on('data', (d) => (error += d));
    pa.stdout.pipe(pb.stdin);
    // Si gpg se cierra antes (no está, o falla), pg_dump recibe EPIPE: no es otro error que contar.
    pb.stdin.on('error', () => {});
    pa.on('error', (e) => {
      error += `\n${a.comando}: ${e.message}`;
      pb.stdin.end();
      fin.a ??= 127;
      terminar();
    });
    // Si b termina (o no arranca) con a aún vivo, nadie lee ya la salida de a: en cuanto se llenara la
    // tubería, pg_dump se quedaría esperando para siempre y la restauración, colgada sin decir nada.
    const pararA = () => {
      if (fin.a === undefined && pa.exitCode === null) pa.kill();
    };
    pb.on('error', (e) => {
      error += `\n${b.comando}: ${e.message}`;
      fin.b ??= 127;
      pararA();
      terminar();
    });
    pa.on('close', (c) => {
      fin.a ??= c ?? 1;
      terminar();
    });
    pb.on('close', (c) => {
      fin.b ??= c ?? 1;
      pararA();
      terminar();
    });
  });
}

/** Un nombre que no se repite y se ordena por fecha: hidrantes-prod-antes-de-restaurar-AAAAMMDD-HHMMSS.sql.gpg. */
export const nombreCopiaPrevia = (entorno: Entorno, ahora = new Date()): string =>
  `hidrantes-${entorno}-antes-de-restaurar-${ahora.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}.sql.gpg`;

/**
 * Antes de vaciar el esquema, lo que hay ahora, cifrado y fuera del repositorio (docs/31 RV-134). Si
 * algo falla, aborta: sin copia previa no se restaura. Devuelve la ruta del archivo.
 */
export async function copiaPrevia(
  url: string,
  entorno: Entorno,
  opciones: { carpeta?: string; huella?: string; canal?: typeof canalizar; ahora?: Date } = {},
): Promise<string> {
  const carpeta = path.resolve(opciones.carpeta ?? CARPETA_COPIAS);
  const relativa = path.relative(RAIZ, carpeta);
  if (relativa === '' || (!relativa.startsWith('..') && !path.isAbsolute(relativa))) {
    abortar('La carpeta de la copia previa está dentro del repositorio, que es público: no se sigue.');
  }
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  const archivo = path.join(carpeta, nombreCopiaPrevia(entorno, opciones.ahora));
  const [volcar, cifrar] = ordenesCopiaPrevia(url, archivo, opciones.huella ?? huellaRespaldo());
  const r = await (opciones.canal ?? canalizar)(volcar, cifrar);
  const tamano = existsSync(archivo) ? statSync(archivo).size : 0;
  if (r.codigoA !== 0 || r.codigoB !== 0 || tamano === 0) {
    rmSync(archivo, { force: true });
    const pista = r.codigoB !== 0 ? ' ¿Has importado la clave de respaldo (15 §5.3, paso 3)?' : '';
    abortar(
      `No se ha podido guardar la copia previa (pg_dump ${r.codigoA}, gpg ${r.codigoB}): no se restaura y no se ha tocado nada.${pista}\n${errorSeguro(r.error)}`,
    );
  }
  return archivo;
}

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const entorno = leerEntorno(valores.get('entorno'));
  const archivo = valores.get('archivo') ?? abortar('Indica --archivo <volcado.sql> ya descifrado.');
  const sinPreguntar = confirmacionAutomatica(entorno, valores.get('confirmar'));
  const ruta = path.resolve(RAIZ, archivo);
  const inseguro = motivoArchivoInseguro(ruta, RAIZ, ignoradoPorGit);
  if (inseguro) abortar(inseguro);

  const volcado = readFileSync(ruta, 'utf8');
  if (!pareceVolcado(volcado)) abortar(`${archivo} no parece un volcado del esquema hidrantes.`);
  if (tocaPublic(volcado)) abortar(`${archivo} toca el esquema public: no se restaura (es de la app de uniformidad).`);
  const version = motivoVersionPsql(ejecutar('psql', ['--version']).salida, volcado);
  if (version) abortar(version);

  const url =
    entorno === 'local'
      ? LOCAL_MIGRADOR
      : (process.env.SUPABASE_DB_URL ??
        (await preguntar(`Cadena de conexión de ${entorno} (hidrantes_migrador)`, { oculto: true })));

  // Guarda del proyecto: restaurar producción sobre staging, o al revés, sería peor que el problema.
  // Con cualquier nombre del entorno (produccion = prod), y también en local (docs/31 RV-134).
  comprobarCadena(entorno, url);
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

  if (!sinPreguntar) {
    const escrito = await preguntar('Escribe RESTAURAR para continuar');
    if (escrito.trim() !== 'RESTAURAR') return log.info('Cancelado: no se ha tocado nada.');
  }
  // Lo que hay ahora, antes de vaciarlo (docs/31 RV-134): si la restauración resulta ser un error, se
  // puede volver. Cifrado con la clave de respaldo y fuera del repositorio. En local no: es el
  // Supabase de pruebas o el Postgres de servicio de respaldo.yml.
  if (hayEsquema && entorno !== 'local') {
    log.paso('Copia previa de lo que hay ahora');
    const copia = await copiaPrevia(url, entorno);
    log.ok(`copia previa cifrada en ${copia} (${(statSync(copia).size / 1024).toFixed(0)} kB)`);
  }
  const inicio = psql(url, 'select clock_timestamp();', { tuplas: true }).salida.trim();
  // Los códigos no retroceden nunca (FR-10, docs/18 RV-34): el volcado trae las secuencias de la
  // fecha del respaldo, y los códigos dados después, ya perdidos, volverían a darse.
  const previas = hayEsquema
    ? leerSecuencias(psql(url, SQL_LEER_SECUENCIAS, { tuplas: true }).salida)
    : { hid: 0, boc: 0 };
  log.info(`secuencias antes de restaurar: HID ${previas.hid} · BOC ${previas.boc}`);
  // El acceso de ahora (código, móviles revocados, administradores) manda sobre el del volcado
  // (docs/18 RV-35). Se guarda en memoria, nunca en disco.
  const acceso = hayEsquema ? accesoActual(url) : null;
  const actor = `restauracion ${entorno}`;

  // El volcado y lo que lo envuelve van juntos a un archivo: psql lo lee de una sola vez, y así los
  // bloques COPY del volcado llegan enteros. El archivo lleva datos personales en claro: va al
  // directorio temporal del sistema, nunca bajo el repositorio público, solo legible por quien
  // restaura, y se borra aunque psql falle (docs/18 RV-37).
  const carpeta = carpetaTemporal();
  const guion = path.join(carpeta, 'restauracion.sql');
  // Un Ctrl+C o un SIGTERM a mitad no deja el volcado descifrado en el disco (docs/18 RV-37, RV-55).
  const alSenal = () => {
    rmSync(carpeta, { recursive: true, force: true });
    process.exit(130);
  };
  process.on('SIGINT', alSenal);
  process.on('SIGTERM', alSenal);
  let r: Resultado;
  try {
    writeFileSync(guion, sqlRestauracion(volcado, path.basename(ruta), actor, { previas, acceso }), { mode: 0o600 });
    r = psql(url, `\\i '${guion.replaceAll('\\', '/')}'`);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
    process.off('SIGINT', alSenal);
    process.off('SIGTERM', alSenal);
  }
  if (r.codigo !== 0)
    abortar(`La restauración ha fallado y no se ha cambiado nada:\n${errorSeguro(r.error || r.salida)}`);

  log.ok(`Restaurado: ${cuenta(url, 'puntos')} puntos y ${cuenta(url, 'propuestas')} propuestas.`);
  if (!acceso || sinAcceso(acceso)) {
    log.info('no había acceso que reponer: el esquema no existía antes de restaurar');
  } else {
    log.ok(
      'acceso de antes repuesto en la misma transacción: el código, los móviles revocados y los administradores de ahora',
    );
  }

  // Lo que va tras el commit: si algo falla aquí, lo restaurado ya está y el acceso de ahora también,
  // pero hay que decir qué hacer. El último mensaje siempre es ese (docs/19 RV-55).
  try {
    // Un volcado viejo vuelve con el esquema de entonces: se lleva al de hoy con las migraciones que
    // le falten (RV-13).
    log.paso('Migraciones pendientes del volcado');
    const aplicadas = migrarPendientes(url, undefined, dirMigraciones(entorno === 'local'));
    log.info(aplicadas.length ? `aplicadas: ${aplicadas.join(', ')}` : 'ninguna: el volcado ya estaba al día');

    // Otra vez, por si una migración tocó algo: es idempotente.
    const s = psql(url, sqlSecuenciasAlMenos(previas.hid, previas.boc));
    if (s.codigo !== 0) abortar(`No se han podido ajustar las secuencias de los códigos: ${errorSeguro(s.error)}`);
    const ahora = leerSecuencias(psql(url, SQL_LEER_SECUENCIAS, { tuplas: true }).salida);
    log.ok(`secuencias tras restaurar: HID ${ahora.hid} · BOC ${ahora.boc} (ningún código se reutiliza)`);

    if (acceso && !sinAcceso(acceso)) {
      const c = psql(url, sqlComprobarAcceso(acceso), { tuplas: true });
      const distinto = c.codigo === 0 ? c.salida.trim() : 'no se ha podido comprobar';
      if (distinto) abortar(`Tras migrar, el acceso no es el de antes: ${distinto}.`);
      log.ok('comprobado tras migrar: el mismo código, los mismos móviles revocados y los mismos administradores');
    }

    const anotada = psql(
      url,
      `select count(*) from hidrantes.registro where accion = 'restauracion_respaldo' and momento >= '${inicio}';`,
      { tuplas: true },
    ).salida.trim();
    if (anotada === '0') {
      const a = psql(url, insertAuditoria(actor, path.basename(ruta)));
      if (a.codigo !== 0) log.aviso(`No se ha podido anotar la restauración en el registro: ${errorSeguro(a.error)}`);
      else log.ok('restauración anotada en el registro (tras migrar: el volcado era anterior a 0010)');
    }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    abortar(`Restaurado, pero no ha terminado: ${motivo}\n\n${ACCIONES_MANUALES}`);
  }
  log.info('Comprueba el panel (Inventario y Registro) y la app en un móvil (15 §5.3, pasos 6 a 8).');
}

if (import.meta.main) ejecutarScript(principal);
