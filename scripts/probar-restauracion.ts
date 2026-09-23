// Ensayo de restauración contra el Supabase local (docs/17 RV-13, TR-51, 15 §5.3). Lo corre CI en
// `ci-sql` y se puede lanzar en local con la pila levantada:
//
//   npx tsx scripts/probar-restauracion.ts [--viejo /tmp/volcado-0009.sql]
//
// 1. El caso normal de 15 §5.3: datos dañados con el esquema vivo. Se vuelca el esquema con el
//    seed, se estropean datos (se borran tres puntos, se gasta un código) y se restaura encima. Los
//    conteos y las secuencias vuelven a lo guardado, el registro gana la fila de auditoría y
//    fn_listar_puntos sigue respondiendo a anon.
// 2. Con --viejo: un volcado de verdad hecho con las migraciones hasta la 0009 (anterior a la
//    acción 'restauracion_respaldo'). Se restaura, se migra hasta hoy y la auditoría se anota
//    después.

import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abortar, argumentos, ejecutar, ejecutarScript, entornoPg, log, psqlOk, RAIZ } from './lib/comun.ts';
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
  if (r.codigo !== 0) abortar(`pg_dump falló: ${r.error}`);
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
    // Por si el script no conociera --confirmar: la confirmación también llega por la entrada.
    { entrada: 'RESTAURAR\n', env: { ...process.env, SUPABASE_DB_URL: LOCAL_MIGRADOR } },
  );
  return { codigo: r.codigo, salida: `${r.salida}\n${r.error}` };
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

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const carpeta = os.tmpdir();

  log.paso('1. Restaurar sobre el esquema vivo, con datos (15 §5.3)');
  const volcado = path.join(carpeta, 'hidrantes-ensayo.sql');
  volcar(volcado);
  const antes = estado();
  log.info(`guardado: ${JSON.stringify(antes)}`);
  if (antes.puntos < 3) abortar('Hace falta el seed de staging cargado (al menos tres puntos).');

  // Estropear: tres puntos sin propuestas fuera, y un código de hidrante gastado.
  psqlOk(
    LOCAL_POSTGRES,
    `delete from hidrantes.puntos where id in (
       select p.id from hidrantes.puntos p
        where not exists (select 1 from hidrantes.propuestas r where r.punto_id = p.id or r.duplicado_de = p.id)
        order by p.codigo limit 3);
     select nextval('hidrantes.seq_codigo_hidrante');`,
  );
  comprobar(estado().puntos === antes.puntos - 3, 'datos estropeados: tres puntos menos');

  const r1 = restaurar(volcado);
  comprobar(r1.codigo === 0, 'la restauración sobre el esquema vivo termina bien', r1.salida.slice(-400));
  const despues = estado();
  comprobar(despues.puntos === antes.puntos, 'vuelven los puntos', `${despues.puntos} de ${antes.puntos}`);
  comprobar(despues.propuestas === antes.propuestas, 'vuelven las propuestas');
  comprobar(despues.registro === antes.registro + 1, 'el registro gana una fila: la de la restauración');
  comprobar(
    despues.hidrante === antes.hidrante && despues.boca === antes.boca,
    'las secuencias dan el siguiente código esperado',
    `${despues.hidrante}/${despues.boca} frente a ${antes.hidrante}/${antes.boca}`,
  );
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
