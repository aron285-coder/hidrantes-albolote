// Tras restaurar, el estado de acceso de **ahora** manda sobre el del volcado (docs/18 RV-35).
//
// 15 §5.3, paso 1: antes de restaurar, jefatura genera un código nuevo y revoca todos los móviles.
// El volcado traería de vuelta el código viejo (quizá filtrado), los dispositivos sin revocar y los
// administradores tal como estaban: el código comunicado al grupo dejaría de valer, los móviles
// revocados volverían a entrar y un administrador dado de baja volvería a estar activo.
//
// Se lee en memoria con el esquema vivo, antes de restaurar, y se repone **dentro** de la
// transacción de la restauración, antes del commit: si después falla una migración, lo de antes no
// vuelve a valer (docs/19 RV-55). Tras migrar se comprueba que sigue igual (sqlComprobarAcceso).
// Va en el guion temporal de la restauración, que se borra al acabar (docs/18 RV-37). Solo usa
// columnas de 0001, que no han cambiado.

/** Lo que se lee antes de restaurar: cada campo es el texto JSON que devuelve psql, o null. */
export interface AccesoActual {
  /** jsonb_object_agg(clave, valor) de las claves `codigo_acceso%` de config. */
  config: string | null;
  /** jsonb_agg de dispositivos (dispositivo_id, token_hash, emitido_en, ultimo_uso, revocado_en). */
  dispositivos: string | null;
  /** jsonb_agg de administradores (email, activo, creado_en, creado_por). */
  administradores: string | null;
}

/**
 * Las tres lecturas en una sola consulta, separadas por tabuladores. `codigo_acceso%` recoge el hash,
 * el código en claro que enseña el panel y quién y cuándo lo cambió: van juntos o el panel
 * enseñaría un código que ya no vale.
 */
export const SQL_LEER_ACCESO = `
select coalesce((select jsonb_object_agg(clave, valor)::text from hidrantes.config where clave like 'codigo_acceso%'), '')
  || chr(9) ||
  coalesce((select jsonb_agg(d)::text from (select dispositivo_id, token_hash, emitido_en, ultimo_uso, revocado_en
                                              from hidrantes.dispositivos) d), '')
  || chr(9) ||
  coalesce((select jsonb_agg(a)::text from (select email, activo, creado_en, creado_por
                                              from hidrantes.administradores) a), '');`;

/** La salida de SQL_LEER_ACCESO; un campo vacío es null. */
export function leerAcceso(salida: string): AccesoActual {
  const [config = '', dispositivos = '', administradores = ''] = salida.replace(/\r?\n$/, '').split('\t');
  const o = (t: string) => (t.trim() ? t.trim() : null);
  return { config: o(config), dispositivos: o(dispositivos), administradores: o(administradores) };
}

/** Un literal jsonb seguro dentro de SQL: se valida que es JSON y se doblan las comillas simples. */
function literal(json: string): string {
  JSON.parse(json);
  return `'${json.replaceAll("'", "''")}'::jsonb`;
}

/** Nada que reponer: el esquema no existía antes de restaurar o sus tablas no se podían leer. */
export const sinAcceso = (a: AccesoActual) => !a.config && !a.dispositivos && !a.administradores;

/**
 * Lo que repone el acceso de ahora sobre lo restaurado, sin transacción propia: va dentro de la de
 * la restauración, antes del commit (docs/19 RV-55). Cada parte solo va si se leyó: sin
 * administradores leídos no se da de baja a nadie.
 */
export function sqlReponerAccesoCuerpo(a: AccesoActual): string {
  const partes: string[] = [];
  if (a.config) {
    partes.push(`
-- El código de ahora, no el del volcado.
insert into hidrantes.config (clave, valor, actualizado_por)
select c.key, c.value, 'restaurar.ts' from jsonb_each(${literal(a.config)}) c
on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por;`);
  }
  if (a.dispositivos) {
    partes.push(`
create temp table acceso_dispositivos on commit drop as
select * from jsonb_to_recordset(${literal(a.dispositivos)})
  as d(dispositivo_id uuid, token_hash text, emitido_en timestamptz, ultimo_uso timestamptz, revocado_en timestamptz);
-- Todo token restaurado que no esté activo ahora queda revocado.
update hidrantes.dispositivos d set revocado_en = now()
 where d.revocado_en is null
   and not exists (select 1 from acceso_dispositivos x where x.token_hash = d.token_hash and x.revocado_en is null);
-- Los activos ahora que el volcado no conocía (emitidos después del respaldo) siguen valiendo.
insert into hidrantes.dispositivos (dispositivo_id, token_hash, emitido_en, ultimo_uso, revocado_en)
select dispositivo_id, token_hash, emitido_en, ultimo_uso, revocado_en from acceso_dispositivos where revocado_en is null
on conflict (token_hash) do update set revocado_en = excluded.revocado_en;`);
  }
  if (a.administradores) {
    partes.push(`
create temp table acceso_administradores on commit drop as
select * from jsonb_to_recordset(${literal(a.administradores)})
  as a(email text, activo boolean, creado_en timestamptz, creado_por text);
insert into hidrantes.administradores (email, activo, creado_en, creado_por)
select email, activo, creado_en, creado_por from acceso_administradores
on conflict (email) do update set activo = excluded.activo;
-- Los restaurados que ahora no existen quedan de baja.
update hidrantes.administradores g set activo = false
 where g.activo and not exists (select 1 from acceso_administradores x where x.email = g.email);`);
  }
  return partes.join('\n');
}

/** La misma reposición en una transacción propia. */
export const sqlReponerAcceso = (a: AccesoActual): string =>
  ['begin;', sqlReponerAccesoCuerpo(a), 'commit;'].filter(Boolean).join('\n');

/**
 * Tras migrar, que el acceso sigue siendo el de antes (docs/19 RV-55): el hash del código, los tokens
 * revocados siguen revocados (y ninguno restaurado vuelve a valer si no valía) y los administradores
 * tienen el mismo `activo`. Devuelve una línea con lo que no cuadra, separado por comas; vacía, todo
 * bien. Solo compara lo que se leyó.
 */
export function sqlComprobarAcceso(a: AccesoActual): string {
  const partes: string[] = [];
  if (a.config) {
    partes.push(`case when (select valor from hidrantes.config where clave = 'codigo_acceso_hash')
        is distinct from (${literal(a.config)} -> 'codigo_acceso_hash') then 'el código de acceso' end`);
  }
  if (a.dispositivos) {
    partes.push(`case when exists (
        select 1 from hidrantes.dispositivos d
         where d.revocado_en is null
           and not exists (select 1 from jsonb_to_recordset(${literal(a.dispositivos)}) as x(token_hash text, revocado_en timestamptz)
                            where x.token_hash = d.token_hash and x.revocado_en is null))
      then 'los móviles revocados' end`);
  }
  if (a.administradores) {
    partes.push(`case when exists (
        select 1 from hidrantes.administradores g
          left join jsonb_to_recordset(${literal(a.administradores)}) as x(email text, activo boolean) on x.email = g.email
         where g.activo is distinct from coalesce(x.activo, false))
      then 'los administradores' end`);
  }
  return partes.length ? `select concat_ws(', ', ${partes.join(',\n  ')});` : "select '';";
}
