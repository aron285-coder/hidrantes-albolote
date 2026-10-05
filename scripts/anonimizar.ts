// Derecho de supresión sin panel (docs/29 RV-126, DEC-167, FR-131, 11 §6.4). Lo ejecuta el
// desarrollador en su PC; nunca en CI.
//
//   npm run anonimizar -- --entorno staging --admin <correo> --buscar "texto"
//       lista los dispositivos cuyo autor coincide: dispositivo, nombre, propuestas y última actividad
//   npm run anonimizar -- --entorno staging --admin <correo> --dispositivo <uuid>
//       enseña cuántas filas cambia, pide que se escriba ANONIMIZAR y anonimiza
//   (--entorno produccion igual; --entorno local contra `supabase start`)
//
// Sin --dispositivo no se cambia nada. --buscar abre una transacción que siempre se deshace.
//
// Se conecta como scripts/migrar.ts: SUPABASE_DB_URL (o se pide sin mostrarla), con el rol
// hidrantes_migrador, y la cadena tiene que ser del proyecto de --entorno (la guarda de
// scripts/restaurar.ts, refs de docs/entornos.md).
//
// Quién lo hizo: fn_anonimizar_autor y fn_actividad_voluntarios exigen un administrador
// (fn_exigir_admin) y apuntan su correo en el registro. El script pone `request.jwt.claims` con el
// correo de --admin **solo dentro de su transacción** (set_config(…, true)): al terminar, la
// sesión vuelve a no tener claims. Antes comprueba que ese correo es de un administrador activo,
// y fn_exigir_admin lo vuelve a comprobar dentro. hidrantes_migrador ya es dueño del esquema: los
// claims no le dan ningún poder nuevo, solo hacen que el registro diga qué administrador atendió la
// petición en vez de quedarse sin actor.
//
// Privacidad: los nombres solo salen por la terminal de quien lo ejecuta. Nada se escribe en
// archivos, y en CI el script se niega a arrancar.

import { abortar, argumentos, ejecutarScript, errorSeguro, log, preguntar, psql } from './lib/comun.ts';
import { LOCAL_MIGRADOR } from './migrar.ts';
import { REFS, refDeUrl } from './restaurar.ts';

export const ENTORNOS = ['local', 'staging', 'produccion'] as const;
export type Entorno = (typeof ENTORNOS)[number];

/** Ref de Supabase de cada entorno remoto (docs/entornos.md). */
export const REF_DE: Record<Exclude<Entorno, 'local'>, string> = { staging: REFS.staging, produccion: REFS.prod };

export const CONFIRMACION = 'ANONIMIZAR';
/** fn_actividad_voluntarios mira hacia atrás tantos meses: con 100 años, todo el historial. */
export const MESES_BUSQUEDA = 1200;

const OPCIONES = new Set(['entorno', 'admin', 'buscar', 'dispositivo']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CORREO = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
// Letras (con tildes), números, espacios, punto, guion y apóstrofo: basta para un nombre y no deja
// pasar los comodines de ilike.
const TEXTO = /^[\p{L}\p{M}\p{N} .'-]{2,60}$/u;

interface Comun {
  entorno: Entorno;
  admin: string;
}
export type Orden = (Comun & { modo: 'buscar'; texto: string }) | (Comun & { modo: 'anonimizar'; dispositivo: string });

/** Lee y valida los argumentos. Aborta (ErrorDeScript) ante cualquier cosa que no encaje. */
export function analizarArgumentos(banderas: Set<string>, valores: Map<string, string>): Orden {
  for (const clave of [...banderas, ...valores.keys()]) {
    if (!OPCIONES.has(clave)) abortar(`Opción desconocida: --${clave}`);
  }
  for (const clave of banderas) abortar(`--${clave} necesita un valor.`);

  const crudo = valores.get('entorno') ?? abortar('Indica --entorno staging, produccion o local.');
  // `prod` es como lo llama npm run restaurar: se acepta igual.
  const entorno = crudo === 'prod' ? 'produccion' : crudo;
  if (!(ENTORNOS as readonly string[]).includes(entorno)) {
    abortar(`Entorno desconocido: ${entorno} (staging, produccion o local).`);
  }
  const admin = (valores.get('admin') ?? abortar('Indica --admin con el correo de un administrador activo.'))
    .trim()
    .toLowerCase();
  if (!CORREO.test(admin)) abortar('--admin no parece un correo.');

  const buscar = valores.get('buscar');
  const dispositivo = valores.get('dispositivo');
  if (buscar !== undefined && dispositivo !== undefined) abortar('Usa --buscar o --dispositivo, no los dos.');
  if (dispositivo !== undefined) {
    const id = dispositivo.trim().toLowerCase();
    if (!UUID.test(id)) abortar('--dispositivo tiene que ser el identificador (uuid) que da --buscar.');
    return { modo: 'anonimizar', entorno: entorno as Entorno, admin, dispositivo: id };
  }
  if (buscar !== undefined) {
    const texto = buscar.trim();
    if (!TEXTO.test(texto)) abortar('--buscar: de 2 a 60 letras, números, espacios, punto, guion o apóstrofo.');
    return { modo: 'buscar', entorno: entorno as Entorno, admin, texto };
  }
  abortar(
    'Indica --buscar "texto" para localizar el dispositivo o --dispositivo <id> para anonimizar. No se ha cambiado nada.',
  );
}

/**
 * Guarda del destino. Vacía si se puede seguir. Nunca en CI; en staging y producción, la cadena
 * tiene que usar hidrantes_migrador (DEC-052) y apuntar al proyecto de ese entorno.
 */
export function comprobarDestino(entorno: Entorno, url: string, ci: string | undefined): string[] {
  const p: string[] = [];
  if (ci) p.push('En CI no se ejecuta: los nombres no pueden salir en Actions (el repositorio es público).');
  if (entorno === 'local') return p;
  let usuario: string;
  try {
    usuario = decodeURIComponent(new URL(url).username);
  } catch {
    p.push('La cadena de conexión no es una URL de PostgreSQL.');
    return p;
  }
  if (!usuario.startsWith('hidrantes_migrador'))
    p.push(`La cadena usa el usuario "${usuario}"; debe ser hidrantes_migrador (DEC-052).`);
  const ref = refDeUrl(url);
  if (ref !== REF_DE[entorno]) {
    p.push(`Esa cadena apunta al proyecto ${ref ?? 'desconocido'}, y --entorno ${entorno} es ${REF_DE[entorno]}.`);
  }
  return p;
}

/** Literal de texto de SQL. Con standard_conforming_strings (por defecto), basta con doblar '. */
export function literal(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`;
}

/** Los claims de una sesión de Google de ese administrador, como los pide fn_email_jwt (0022). */
export function claimsDe(admin: string, ahora = Math.floor(Date.now() / 1000)): string {
  return JSON.stringify({
    role: 'authenticated',
    email: admin,
    amr: [{ method: 'oauth', timestamp: ahora }],
    app_metadata: { provider: 'google', providers: ['google'] },
  });
}

/** Abre la transacción con los claims del administrador, locales a ella (set_config(…, true)). */
function comoAdmin(admin: string, cuerpo: string, fin: 'commit' | 'rollback'): string {
  return [
    'begin;',
    `select set_config('request.jwt.claims', ${literal(claimsDe(admin))}, true) is not null as claims;`,
    cuerpo,
    `${fin};`,
  ].join('\n');
}

export function sqlBuscar(admin: string, texto: string): string {
  const patron = literal(`%${texto}%`);
  return comoAdmin(
    admin,
    `select coalesce(jsonb_agg(jsonb_build_object('dispositivo_id', a.dispositivo_id, 'autor', a.autor,
         'propuestas', a.propuestas, 'ultima', a.ultima) order by a.ultima desc), '[]'::jsonb)
       from hidrantes.fn_actividad_voluntarios(${MESES_BUSQUEDA}) a
      where a.autor ilike ${patron};`,
    'rollback',
  );
}

/**
 * Lo que cambiaría, sin cambiar nada: lo lee el dueño del esquema, sin claims. `pendientes_*` son
 * las filas que aún llevan un nombre; si las dos son 0, ya estaba anonimizado.
 */
export function sqlVistaPrevia(admin: string, dispositivo: string): string {
  const d = `${literal(dispositivo)}::uuid`;
  const baja = literal(TEXTO_BAJA);
  return `select json_build_object(
  'admin_activo', exists (select 1 from hidrantes.administradores a where a.email = ${literal(admin)} and a.activo),
  'de_administrador', exists (select 1 from hidrantes.administradores a where hidrantes.fn_dispositivo_admin(a.email) = ${d}),
  'propuestas', (select count(*) from hidrantes.propuestas r where r.dispositivo_id = ${d}),
  'registro', (select count(*) from hidrantes.registro g where g.dispositivo_id = ${d} and not g.es_admin),
  'pendientes_propuestas', (select count(*) from hidrantes.propuestas r where r.dispositivo_id = ${d}
                              and (r.autor_nombre <> ${baja} or r.autor_apellido <> '')),
  'pendientes_registro', (select count(*) from hidrantes.registro g where g.dispositivo_id = ${d} and not g.es_admin
                            and g.actor <> ${baja}));`;
}

export function sqlAnonimizar(admin: string, dispositivo: string): string {
  return comoAdmin(admin, `select hidrantes.fn_anonimizar_autor(${literal(dispositivo)}::uuid) as filas;`, 'commit');
}

/** El texto que pone fn_anonimizar_autor (0006, y el único que admite el registro, 0019). */
export const TEXTO_BAJA = 'voluntario dado de baja';

export interface VistaPrevia {
  admin_activo: boolean;
  de_administrador: boolean;
  propuestas: number;
  registro: number;
  pendientes_propuestas: number;
  pendientes_registro: number;
}

export interface Dependencias {
  /** Ejecuta SQL que no cambia nada y devuelve la última línea (psql -A -t). Aborta si falla. */
  consultar: (sql: string) => string;
  /** Ejecuta la anonimización. Si falla, aborta diciendo que no se sabe si se aplicó. */
  escribir: (sql: string) => string;
  preguntar: (texto: string) => Promise<string>;
  info: (texto: string) => void;
  aviso: (texto: string) => void;
}

/** JSON de psql, o un error limpio (sin pila ni el texto recibido, que podría llevar un nombre). */
export function leerJson(texto: string, que: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    abortar(`Respuesta inesperada de la base de datos (${que}). No se ha cambiado nada.`);
  }
}

function esVistaPrevia(v: unknown): v is VistaPrevia {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const numeros = ['propuestas', 'registro', 'pendientes_propuestas', 'pendientes_registro'];
  return (
    typeof o.admin_activo === 'boolean' &&
    typeof o.de_administrador === 'boolean' &&
    numeros.every((k) => Number.isInteger(o[k]) && (o[k] as number) >= 0)
  );
}

interface Encontrado {
  dispositivo_id: string;
  autor: string;
  propuestas: number;
  ultima: string;
}

export async function buscar(orden: Extract<Orden, { modo: 'buscar' }>, d: Dependencias): Promise<void> {
  const filas = leerJson(d.consultar(sqlBuscar(orden.admin, orden.texto)), 'búsqueda');
  if (!Array.isArray(filas)) abortar('Respuesta inesperada de la base de datos (búsqueda). No se ha cambiado nada.');
  if (!filas.length) {
    d.info(`Ningún autor coincide con «${orden.texto}». No se ha cambiado nada.`);
    d.info('Solo se busca el nombre más reciente de cada móvil: prueba con parte del nombre o del apellido.');
    return;
  }
  for (const f of filas as Encontrado[]) {
    d.info(`${f.dispositivo_id} · ${f.autor} · ${f.propuestas} propuestas · última: ${String(f.ultima).slice(0, 10)}`);
  }
  d.info('Confirma con la persona cuál es su móvil y repite con --dispositivo <id>. No se ha cambiado nada.');
}

/** Devuelve las filas cambiadas. Sin escribir exactamente ANONIMIZAR, no cambia nada. */
export async function anonimizar(orden: Extract<Orden, { modo: 'anonimizar' }>, d: Dependencias): Promise<number> {
  const v = leerJson(d.consultar(sqlVistaPrevia(orden.admin, orden.dispositivo)), 'vista previa');
  if (!esVistaPrevia(v)) abortar('Respuesta inesperada de la base de datos (vista previa). No se ha cambiado nada.');
  if (!v.admin_activo) abortar('--admin no es el correo de un administrador activo. No se ha cambiado nada.');
  if (v.de_administrador) abortar('Ese dispositivo es de un administrador: no se anonimiza. No se ha cambiado nada.');
  if (v.propuestas + v.registro === 0) abortar('No hay nada de ese dispositivo. Revisa el identificador con --buscar.');
  if (v.pendientes_propuestas + v.pendientes_registro === 0) {
    abortar('Ese dispositivo ya está anonimizado: no queda ningún nombre. No se ha cambiado nada.');
  }

  d.info(`Dispositivo ${orden.dispositivo} en ${orden.entorno}:`);
  d.info(
    `${v.pendientes_propuestas} propuestas y ${v.pendientes_registro} entradas del registro con nombre pasan a «${TEXTO_BAJA}».`,
  );
  d.info('Las filas y el dispositivo se conservan; el nombre no se puede recuperar.');
  const escrito = await d.preguntar(`Escribe ${CONFIRMACION} para continuar`);
  if (escrito !== CONFIRMACION) abortar(`No se ha escrito ${CONFIRMACION}: no se ha cambiado nada.`);

  const salida = d.escribir(sqlAnonimizar(orden.admin, orden.dispositivo));
  const filas = salida === '' ? NaN : Number(salida);
  if (!Number.isInteger(filas)) {
    abortar('La anonimización no devolvió el número de filas: comprueba en el Registro si hay una «anonimizacion».');
  }
  // fn_anonimizar_autor reescribe todas las filas del dispositivo, también las que ya estaban de baja.
  if (filas !== v.propuestas + v.registro) {
    d.aviso(
      `Han cambiado ${filas} filas y la vista previa contaba ${v.propuestas + v.registro}: ` +
        'el móvil ha mandado algo mientras tanto. Está anonimizado igualmente; repasa el Registro.',
    );
  }
  return filas;
}

/** La última línea no vacía de psql -A -t: la respuesta de la consulta final. */
export function ultimaLinea(salida: string): string {
  return (
    salida
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .at(-1) ?? ''
  );
}

async function principal(): Promise<void> {
  const { banderas, valores } = argumentos();
  const orden = analizarArgumentos(banderas, valores);
  const enCi = comprobarDestino(orden.entorno, LOCAL_MIGRADOR, process.env.CI);
  if (enCi.length) abortar(enCi[0]);

  const url =
    orden.entorno === 'local'
      ? LOCAL_MIGRADOR
      : (process.env.SUPABASE_DB_URL ??
        (await preguntar(`Cadena de conexión de ${orden.entorno} (hidrantes_migrador)`, { oculto: true })));
  const problemas = comprobarDestino(orden.entorno, url, process.env.CI);
  if (problemas.length) abortar(`Guarda del destino:\n  - ${problemas.join('\n  - ')}`);
  const prueba = psql(url, 'select 1;', { terse: true });
  if (prueba.codigo !== 0) {
    abortar(`No se puede conectar con esa cadena:\n${errorSeguro(prueba.error || prueba.salida)}`);
  }

  // terse: un error no arrastra DETAIL con datos de la fila (RV-53).
  const ejecutarSql = (sql: string, siFalla: string): string => {
    const r = psql(url, sql, { tuplas: true, terse: true });
    if (r.codigo !== 0) abortar(`psql falló (${siFalla}):\n${errorSeguro(r.error || r.salida)}`);
    return ultimaLinea(r.salida);
  };
  const deps: Dependencias = {
    consultar: (sql) => ejecutarSql(sql, 'no se ha cambiado nada'),
    // Si la conexión se corta durante el commit, puede haberse aplicado: no se dice "nada".
    escribir: (sql) =>
      ejecutarSql(
        sql,
        'no se sabe si se aplicó: busca en el Registro una «anonimizacion» de ese dispositivo antes de repetir',
      ),
    preguntar: (texto) => preguntar(texto),
    info: log.info,
    aviso: log.aviso,
  };

  if (orden.modo === 'buscar') {
    log.paso(`Buscar «${orden.texto}» en ${orden.entorno}`);
    await buscar(orden, deps);
    return;
  }
  log.paso(`Anonimizar un dispositivo en ${orden.entorno}`);
  const filas = await anonimizar(orden, deps);
  log.ok(`Anonimizado: ${filas} filas. El Registro lo apunta como «anonimizacion» a nombre de --admin.`);
  log.info('Anota la atención en la tabla de 11 §8 y dile a la persona lo de los respaldos (90 días).');
}

if (import.meta.main) ejecutarScript(principal);
