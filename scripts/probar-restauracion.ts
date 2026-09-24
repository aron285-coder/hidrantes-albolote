// Ensayo de restauración contra el Supabase local (docs/17 RV-13, TR-51, 15 §5.3). Lo corre CI en
// `ci-sql` y se puede lanzar en local con la pila levantada:
//
//   npx tsx scripts/probar-restauracion.ts [--viejo /tmp/volcado-0009.sql]
//
// 1. El caso normal de 15 §5.3: datos dañados con el esquema vivo. Se vuelca el esquema con el
//    seed, se estropean datos (se borran tres puntos, se gasta un código) y se restaura encima. Los
//    conteos vuelven a lo guardado, el registro gana la fila de auditoría y fn_listar_puntos sigue
//    respondiendo a anon. Los códigos no retroceden (RV-34): tras el volcado se dan tres altas, se
//    pierden al restaurar, y la siguiente recibe un número mayor que la última de ellas.
// 2. Con --viejo: un volcado de verdad hecho con las migraciones hasta la 0009 (anterior a la
//    acción 'restauracion_respaldo'). Se restaura, se migra hasta hoy y la auditoría se anota
//    después.

import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  abortar,
  argumentos,
  ejecutar,
  ejecutarScript,
  entornoPg,
  errorSeguro,
  log,
  psqlOk,
  RAIZ,
} from './lib/comun.ts';
import { LOCAL_MIGRADOR, LOCAL_POSTGRES, leerMigraciones } from './migrar.ts';

let fallos = 0;
function comprobar(condicion: boolean, texto: string, detalle = ''): void {
  if (condicion) log.ok(texto);
  else {
    fallos++;
    log.aviso(`FALLA: ${texto}${detalle ? ` (${detalle})` : ''}`);
  }
}

const valor = (sql: string) => psqlOk(LOCAL_POSTGRES, sql, { tuplas: true }).trim();

interface Estado {
  puntos: number;
  propuestas: number;
  registro: number;
  hidrante: string;
  boca: string;
}

const estado = (): Estado => ({
  puntos: Number(valor('select count(*) from hidrantes.puntos;')),
  propuestas: Number(valor('select count(*) from hidrantes.propuestas;')),
  registro: Number(valor('select count(*) from hidrantes.registro;')),
  hidrante: valor('select last_value from hidrantes.seq_codigo_hidrante;'),
  boca: valor('select last_value from hidrantes.seq_codigo_boca;'),
});

function volcar(destino: string): void {
  const r = ejecutar('pg_dump', ['--schema=hidrantes', '--no-owner', '--format=plain', '--file', destino], {
    env: entornoPg(LOCAL_MIGRADOR),
  });
  if (r.codigo !== 0) abortar(`pg_dump falló: ${errorSeguro(r.error)}`);
}

function restaurar(archivo: string): { codigo: number; salida: string } {
  const r = ejecutar(
    'npx',
    [
      '--no-install',
      'tsx',
      'scripts/restaurar.ts',
      '--entorno',
      'local',
      '--archivo',
      archivo,
      '--confirmar',
      'RESTAURAR',
    ],
    // La entrada va vacía a propósito: si --confirmar dejara de funcionar, la pregunta leería nada y
    // se cancelaría, y la prueba fallaría en vez de confirmar por detrás (docs/18 RV-50).
    { entrada: '', env: { ...process.env, SUPABASE_DB_URL: LOCAL_MIGRADOR } },
  );
  return { codigo: r.codigo, salida: `${r.salida}\n${errorSeguro(r.error)}` };
}

/** anon puede llamar a fn_listar_puntos: un token inventado da TOKEN_INVALIDO, no "permiso denegado". */
function listarResponde(): boolean {
  const r = ejecutar(
    'psql',
    ['-X', '-q', '-c', "set role anon; select hidrantes.fn_listar_puntos('inventado-inventado-inventado');"],
    {
      env: entornoPg(LOCAL_POSTGRES),
    },
  );
  return /TOKEN_INVALIDO/.test(r.error + r.salida);
}

/** El resultado de fn_validar_token con ese token: 'ok' o el código de error. */
function validar(token: string): string {
  const r = ejecutar('psql', ['-X', '-q', '-c', `select hidrantes.fn_validar_token('${token}');`], {
    env: entornoPg(LOCAL_POSTGRES),
  });
  if (r.codigo === 0) return 'ok';
  return /(TOKEN_[A-Z]+)/.exec(r.error + r.salida)?.[1] ?? 'error';
}

/** Un token de voluntario con ese código, para un móvil nuevo. */
const token = (codigo: string, ip: string) =>
  valor(
    `select token from hidrantes.fn_verificar_codigo('${codigo}', gen_random_uuid(), '${ip}') where token is not null;`,
  );

const ADMIN = 'jefe-restauracion@example.org';
const ADMIN_BAJA = 'baja-restauracion@example.org';
/** Una sesión de jefatura con Google, como la trae el JWT de Supabase (RV-36). */
const CLAIMS = JSON.stringify({
  email: ADMIN,
  amr: [{ method: 'oauth', timestamp: 1 }],
  app_metadata: { provider: 'google', providers: ['google'] },
});

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const carpeta = os.tmpdir();

  log.paso('1. Restaurar sobre el esquema vivo, con datos (15 §5.3)');
  // Antes del respaldo: dos administradores y un móvil con el código del seed (RV-35).
  psqlOk(
    LOCAL_POSTGRES,
    `insert into hidrantes.administradores (email, activo, creado_por) values
       ('${ADMIN}', true, 'probar-restauracion'), ('${ADMIN_BAJA}', true, 'probar-restauracion')
     on conflict (email) do update set activo = true;`,
  );
  const tokenViejo = token('000000', 'ip-rv35-antes');
  if (!tokenViejo || validar(tokenViejo) !== 'ok') abortar('No se ha podido sacar un token con el código del seed.');
  const volcado = path.join(carpeta, 'hidrantes-ensayo.sql');
  volcar(volcado);
  const antes = estado();
  log.info(`guardado: ${JSON.stringify(antes)}`);
  if (antes.puntos < 3) abortar('Hace falta el seed de staging cargado (al menos tres puntos).');

  // Tres altas después del respaldo (RV-34): sus códigos se pierden al restaurar y no pueden volver
  // a darse, porque un voluntario puede tenerlos apuntados en campo (FR-10).
  const tresAltas = psqlOk(
    LOCAL_POSTGRES,
    `insert into hidrantes.puntos (codigo, tipo, geom, diametro_mm, caudal, foto_path, municipio,
                                   fecha_ultima_revision, descripcion)
     select hidrantes.fn_siguiente_codigo('hidrante'), 'hidrante',
            ('SRID=4326;POINT(' || (-3.65 + i * 0.0005) || ' 37.23)')::extensions.geography, 100, 'bueno',
            'fotos/rv34-' || i || '.jpg', 'albolote', current_date, '[PRUEBA] RV-34 ' || i
       from generate_series(1, 3) i
     returning substring(codigo from 5)::int;`,
    { tuplas: true },
  )
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
  const ultimaAlta = Math.max(...tresAltas);
  log.info(`tres altas después del volcado: HID ${tresAltas.join(', ')}`);

  // 15 §5.3, paso 1: código nuevo con todos los móviles revocados, y un administrador de baja. Un
  // móvil entra después con el código nuevo (RV-35).
  psqlOk(
    LOCAL_POSTGRES,
    `select set_config('request.jwt.claims', '${CLAIMS}', false);
     select hidrantes.fn_cambiar_codigo_acceso('482917', true);
     update hidrantes.administradores set activo = false where email = '${ADMIN_BAJA}';`,
  );
  const hashNuevo = valor("select valor #>> '{}' from hidrantes.config where clave = 'codigo_acceso_hash';");
  const tokenNuevo = token('482917', 'ip-rv35-despues');
  comprobar(validar(tokenViejo) === 'TOKEN_REVOCADO', 'antes de restaurar, el móvil de antes está revocado');

  // Estropear: tres puntos sin propuestas fuera, y un código de hidrante gastado.
  psqlOk(
    LOCAL_POSTGRES,
    `delete from hidrantes.puntos where id in (
       select p.id from hidrantes.puntos p
        where not exists (select 1 from hidrantes.propuestas r where r.punto_id = p.id or r.duplicado_de = p.id)
        order by p.codigo limit 3);
     select nextval('hidrantes.seq_codigo_hidrante');`,
  );
  comprobar(estado().puntos === antes.puntos, 'datos estropeados: tres altas nuevas y tres puntos menos');

  const r1 = restaurar(volcado);
  comprobar(r1.codigo === 0, 'la restauración sobre el esquema vivo termina bien', r1.salida.slice(-400));
  const despues = estado();
  comprobar(despues.puntos === antes.puntos, 'vuelven los puntos', `${despues.puntos} de ${antes.puntos}`);
  comprobar(despues.propuestas === antes.propuestas, 'vuelven las propuestas');
  comprobar(despues.registro === antes.registro + 1, 'el registro gana una fila: la de la restauración');
  // La de bocas no baja nunca: queda en el mayor de lo guardado y el mayor código BOC (el seed usa
  // BOC-9001 a BOC-9004 sin pasar por la secuencia).
  comprobar(
    Number(despues.boca) >= Number(antes.boca),
    'la secuencia de bocas no retrocede',
    `${despues.boca} frente a ${antes.boca}`,
  );
  const siguiente = Number(valor("select substring(hidrantes.fn_siguiente_codigo('hidrante') from 5)::int;"));
  comprobar(
    siguiente > ultimaAlta,
    'la siguiente alta recibe un código mayor que las dadas después del respaldo (RV-34)',
    `recibe ${siguiente}; la última dada fue ${ultimaAlta}`,
  );
  comprobar(
    valor("select hidrantes.fn_config('epoca_datos', 'null') #>> '{}';") !== '',
    'la época existe tras restaurar',
  );
  // RV-35: el acceso de ahora manda sobre el restaurado.
  comprobar(
    valor("select valor #>> '{}' from hidrantes.config where clave = 'codigo_acceso_hash';") === hashNuevo,
    'el código de acceso es el nuevo, no el del volcado (RV-35)',
  );
  const tokenAntes = validar(tokenViejo);
  comprobar(tokenAntes === 'TOKEN_REVOCADO', 'un móvil de antes del cambio de código sigue revocado', tokenAntes);
  comprobar(
    valor(`select activo from hidrantes.administradores where email = '${ADMIN_BAJA}';`) === 'f',
    'el administrador dado de baja sigue de baja',
  );
  comprobar(
    valor(`select activo from hidrantes.administradores where email = '${ADMIN}';`) === 't',
    'y el que sigue, sigue',
  );
  const nuevo = validar(tokenNuevo);
  comprobar(nuevo === 'ok', 'un móvil que entró después del volcado sigue funcionando', nuevo);
  comprobar(
    valor("select count(*) from hidrantes.registro where accion = 'restauracion_respaldo';") !== '0',
    'la restauración queda en el registro',
  );
  comprobar(listarResponde(), 'fn_listar_puntos responde con la anon key tras restaurar');
  rmSync(volcado, { force: true });

  const viejo = valores.get('viejo');
  if (viejo) {
    log.paso('2. Un volcado anterior a 0010');
    const r2 = restaurar(path.resolve(RAIZ, viejo));
    comprobar(r2.codigo === 0, 'la restauración de un volcado anterior a 0010 termina bien', r2.salida.slice(-400));
    const ultima = leerMigraciones().at(-1)!.archivo;
    comprobar(
      valor(`select count(*) from hidrantes.migraciones_aplicadas where archivo = '${ultima}';`) === '1',
      `se migra hasta la última (${ultima})`,
    );
    comprobar(
      valor("select count(*) from hidrantes.registro where accion = 'restauracion_respaldo';") === '1',
      'y la restauración se anota después de migrar',
    );
    comprobar(listarResponde(), 'fn_listar_puntos responde tras migrar');
  }

  if (fallos) abortar(`${fallos} comprobaciones fallidas`);
  log.ok('Restauración ensayada sobre esquema con datos' + (viejo ? ' y sobre un volcado anterior a 0010' : ''));
}

ejecutarScript(principal);
