// La restauración borra el esquema entero antes de recrearlo: lo que se comprueba aquí es que no
// se pueda disparar contra el proyecto equivocado ni con un archivo que no sea nuestro (15 §5.3).

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorDeScript, RAIZ } from './lib/comun.ts';
import {
  ACCIONES_MANUALES,
  LIMPIAR_ESQUEMA,
  motivoSinAcceso,
  motivoVersionPsql,
  REFS,
  canalizar,
  carpetaTemporal,
  confirmacionAutomatica,
  copiaPrevia,
  huellaRespaldo,
  ordenesCopiaPrevia,
  rutaPgDump,
  ignoradoPorGit,
  motivoArchivoInseguro,
  pareceVolcado,
  refDeUrl,
  sinCrearEsquema,
  sqlReponerAcceso,
  sqlRestauracion,
  sqlSecuenciasAlMenos,
  tocaPublic,
} from './restaurar.ts';
import { sqlSecuencias } from './promover-piloto.ts';
import { leerAcceso, sinAcceso, sqlComprobarAcceso } from './lib/acceso-restaurado.ts';
import { dirMigraciones } from './migrar.ts';
import { archivosDe, sinCarpetaRaiz } from './restaurar-fotos.ts';

const POOLER =
  'postgresql://hidrantes_migrador.cbgqirjqyltadpydpeyr:clave@aws-0-eu-west-3.pooler.supabase.com:5432/postgres'; // detectar-secretos:permitir (cadena de ejemplo, sin valores reales)

describe('a qué proyecto apunta una cadena', () => {
  it('lo saca del usuario del pooler', () => {
    expect(refDeUrl(POOLER)).toBe(REFS.prod);
  });

  it('y del host de la conexión directa', () => {
    expect(refDeUrl('postgresql://postgres:x@db.jowapbzawsebfpksnlqx.supabase.co:5432/postgres')).toBe(REFS.staging);
  });

  it('el Supabase local no tiene ref: --entorno local mira que la base sea de esta máquina (RV-134)', () => {
    expect(refDeUrl('postgresql://hidrantes_migrador:x@127.0.0.1:55422/postgres')).toBeNull();
  });

  it('staging y producción no se parecen, que es lo que salva de restaurar sobre el otro', () => {
    expect(REFS.staging).not.toBe(REFS.prod);
  });
});

describe('qué archivo se acepta', () => {
  it('un volcado del esquema hidrantes', () => {
    expect(pareceVolcado('CREATE SCHEMA hidrantes;')).toBe(true);
    expect(pareceVolcado('create table hidrantes.puntos (id uuid);')).toBe(true);
  });

  it('cualquier otra cosa, no', () => {
    expect(pareceVolcado('hola')).toBe(false);
    expect(pareceVolcado('')).toBe(false);
  });

  it('nada que toque public: ahí vive la app de uniformidad', () => {
    expect(tocaPublic('CREATE SCHEMA hidrantes;\nCREATE TABLE public.usuarios (id int);')).toBe(true);
    expect(tocaPublic('DROP SCHEMA public CASCADE;')).toBe(true);
    expect(tocaPublic('CREATE SCHEMA hidrantes;\nCREATE TABLE hidrantes.puntos (id uuid);')).toBe(false);
  });

  it('mencionar public de pasada no es tocarlo (search_path, comentarios)', () => {
    expect(tocaPublic('SET search_path = pg_catalog, public;\nCREATE TABLE hidrantes.x (i int);')).toBe(false);
  });
});

// docs/18 RV-34: los códigos no se reutilizan nunca (FR-10). Tras restaurar, cada secuencia queda
// por encima de lo que había antes de restaurar, de lo que trae el volcado y del mayor código.
describe('sqlSecuenciasAlMenos', () => {
  it('fija cada secuencia al mayor de lo restaurado, lo previo y el máximo código', () => {
    const sql = sqlSecuenciasAlMenos(57, 12);
    const plano = sql.replace(/\s+/g, ' ');
    expect(plano).toContain(
      "setval('hidrantes.seq_codigo_hidrante', greatest((select last_value from hidrantes.seq_codigo_hidrante), 57,",
    );
    expect(plano).toContain(
      "setval('hidrantes.seq_codigo_boca', greatest((select last_value from hidrantes.seq_codigo_boca), 12,",
    );
    expect(sql).toContain("where codigo like 'HID-%'");
    expect(sql).toContain("where codigo like 'BOC-%'");
  });

  it('solo acepta enteros: el valor viene de psql y va dentro del SQL', () => {
    expect(() => sqlSecuenciasAlMenos(Number.NaN, 1)).toThrow();
    expect(() => sqlSecuenciasAlMenos(1.5, 1)).toThrow();
    expect(sqlSecuenciasAlMenos(0, 0)).toContain('greatest(');
  });

  it('promover-piloto usa la misma, con las secuencias de staging como mínimo (RV-66)', () => {
    expect(sqlSecuencias({ hid: 57, boc: 12 })).toBe(sqlSecuenciasAlMenos(57, 12));
  });
});

// docs/18 RV-35: el acceso de ahora manda sobre el restaurado.
describe('sqlReponerAcceso', () => {
  const actual = {
    config: JSON.stringify({ codigo_acceso_hash: '$2a$10$nuevo', codigo_acceso: '482917' }),
    dispositivos: JSON.stringify([
      {
        dispositivo_id: 'aaaaaaaa-0000-4000-8000-000000000001',
        token_hash: 'h1',
        emitido_en: '2026-09-23T10:00:00Z',
        ultimo_uso: '2026-09-23T10:00:00Z',
        revocado_en: null,
      },
    ]),
    administradores: JSON.stringify([
      { email: "o'brien@example.org", activo: true, creado_en: '2026-08-01T10:00:00Z', creado_por: 'migracion' },
    ]),
  };

  it('en una transacción, repone código, dispositivos y administradores', () => {
    const sql = sqlReponerAcceso(actual);
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain('insert into hidrantes.config');
    expect(sql).toContain('on conflict (clave) do update set valor = excluded.valor');
    expect(sql).toContain('update hidrantes.dispositivos d set revocado_en = now()');
    expect(sql).toContain('on conflict (token_hash) do update set revocado_en = excluded.revocado_en');
    expect(sql).toContain('on conflict (email) do update set activo = excluded.activo');
    expect(sql).toContain('update hidrantes.administradores g set activo = false');
  });

  it('solo columnas de 0001 y nada del esquema public', () => {
    const sql = sqlReponerAcceso(actual);
    expect(sql).toContain('dispositivo_id uuid, token_hash text, emitido_en timestamptz, ultimo_uso timestamptz');
    expect(sql).toContain('email text, activo boolean, creado_en timestamptz, creado_por text');
    expect(sql).not.toMatch(/public\./);
  });

  it('dobla las comillas simples de los datos', () => {
    const sql = sqlReponerAcceso(actual);
    expect(sql).toContain("o''brien@example.org");
    expect(sql).not.toContain("o'brien");
  });

  it('un campo que no es JSON no se mete en el SQL', () => {
    expect(() => sqlReponerAcceso({ ...actual, config: "x'; drop table hidrantes.puntos; --" })).toThrow();
  });

  it('sin datos no repone nada: sin administradores leídos no se da de baja a nadie', () => {
    const vacio = { config: null, dispositivos: null, administradores: null };
    expect(sinAcceso(vacio)).toBe(true);
    expect(sqlReponerAcceso(vacio)).toBe('begin;\ncommit;');
    expect(sqlReponerAcceso({ ...vacio, config: actual.config })).not.toContain('administradores');
  });

  it('lee la salida de psql: tres campos separados por tabuladores, vacío es null', () => {
    expect(leerAcceso(`${actual.config}\t\t${actual.administradores}\n`)).toEqual({
      config: actual.config,
      dispositivos: null,
      administradores: actual.administradores,
    });
    expect(sinAcceso(leerAcceso('\t\t\n'))).toBe(true);
  });
});

describe('el guion de restauración', () => {
  const volcado = ['CREATE SCHEMA hidrantes;', 'CREATE TABLE hidrantes.puntos (id uuid);', ''].join('\n');
  const sql = sqlRestauracion(volcado, 'hidrantes-2026-09-20.sql', 'restauracion prod');

  it('cambia la época de los datos después del volcado y antes del commit (RV-06)', () => {
    const volcadoEn = sql.indexOf('CREATE TABLE hidrantes.puntos');
    const epoca = sql.indexOf("'epoca_datos', to_jsonb(gen_random_uuid()::text)");
    expect(volcadoEn).toBeGreaterThan(-1);
    expect(epoca).toBeGreaterThan(volcadoEn);
    expect(epoca).toBeLessThan(sql.lastIndexOf('commit;'));
    expect(sql).toContain("'restaurar.ts'");
  });

  it('va entero en una transacción: si falla a la mitad, la base se queda como estaba', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
  });

  // hidrantes_migrador no puede crear esquemas (DEC-052) y en una emergencia no hay más cadena que
  // la del secreto: por eso se vacía el esquema en vez de borrarlo y recrearlo.
  it('vacía el esquema hidrantes sin borrarlo, y no toca public', () => {
    expect(sql).toContain(LIMPIAR_ESQUEMA.trim().split('\n')[0]);
    expect(sql).toContain("where schemaname = 'hidrantes'");
    expect(sql).not.toMatch(/drop schema/i);
    expect(sql).not.toMatch(/public/i);
  });

  it('el CREATE SCHEMA del volcado se quita: el esquema ya está y cambiarlo daría permiso denegado', () => {
    expect(sinCrearEsquema('CREATE SCHEMA hidrantes;')).not.toMatch(/^CREATE SCHEMA/m);
    expect(sinCrearEsquema('ALTER SCHEMA hidrantes OWNER TO postgres;')).not.toMatch(/^ALTER SCHEMA/m);
    expect(sinCrearEsquema('CREATE TABLE hidrantes.puntos (id uuid);')).toContain('CREATE TABLE hidrantes.puntos');
  });

  it('el contenido del volcado llega entero', () => {
    expect(sql).toContain('CREATE TABLE hidrantes.puntos (id uuid);');
  });

  it('deja constancia en el registro, con el archivo del que salió', () => {
    expect(sql).toContain("'restauracion_respaldo'");
    expect(sql).toContain("'hidrantes-2026-09-20.sql'");
  });

  // RV-13: el caso normal de 15 §5.3 es un esquema vivo con datos dañados.
  it('borra también las secuencias sueltas, que no caen con las tablas', () => {
    expect(LIMPIAR_ESQUEMA).toContain("c.relkind = 'S'");
    expect(LIMPIAR_ESQUEMA).toContain('drop sequence if exists hidrantes.%I cascade');
    expect(LIMPIAR_ESQUEMA.indexOf("relkind = 'S'")).toBeLessThan(LIMPIAR_ESQUEMA.indexOf("t.typtype = 'e'"));
  });

  it('la auditoría va en un bloque condicional: un volcado anterior a 0010 no la admite', () => {
    const inicio = sql.indexOf('do $auditoria$');
    const bloque = sql.slice(inicio, sql.indexOf('$auditoria$;', inicio));
    expect(bloque).toContain("pg_get_constraintdef(c.oid) like '%restauracion_respaldo%'");
    expect(bloque).toContain('insert into hidrantes.registro');
    expect(bloque).toContain("raise notice 'volcado anterior a 0010: se anota tras migrar'");
    // Ningún insert de auditoría suelto fuera del bloque.
    expect(sql.replace(bloque, '')).not.toContain('insert into hidrantes.registro');
  });
});

describe('--confirmar (RV-13)', () => {
  it('sin --confirmar se pregunta', () => {
    expect(confirmacionAutomatica('prod', undefined)).toBe(false);
  });
  it('--confirmar RESTAURAR con --entorno local no pregunta', () => {
    expect(confirmacionAutomatica('local', 'RESTAURAR')).toBe(true);
  });
  it('--confirmar sin --entorno local aborta', () => {
    expect(() => confirmacionAutomatica('prod', 'RESTAURAR')).toThrow(ErrorDeScript);
    expect(() => confirmacionAutomatica('staging', 'RESTAURAR')).toThrow(/solo se admite con --entorno local/);
  });
  it('--confirmar con otra palabra aborta', () => {
    expect(() => confirmacionAutomatica('local', 'si')).toThrow(/exactamente RESTAURAR/);
  });
});

describe('fotos restauradas', () => {
  it('el tar lleva la carpeta del respaldo dentro: en el bucket no va', () => {
    expect(sinCarpetaRaiz('fotos-2026-09-20/fotos/a.jpg')).toBe('fotos/a.jpg');
    expect(sinCarpetaRaiz('fotos-2026-09-20/suelta.jpg')).toBe('suelta.jpg');
  });

  it('recorre las carpetas del respaldo desempaquetado, con barras de URL', () => {
    const archivos = archivosDe('scripts');
    expect(archivos).toContain('lib/claves.ts');
    // En Windows readdir daría barras invertidas: en el bucket la ruta lleva las normales.
    expect(archivos.some((f) => f.includes(String.fromCharCode(92)))).toBe(false);
  });
});

// docs/18 RV-37: un volcado descifrado no puede acabar en el repositorio público.
describe('el volcado y el guion, fuera del repositorio', () => {
  const raiz = path.resolve('/repo');

  it('--archivo ./hidrantes.sql dentro del repositorio y no ignorado aborta', () => {
    expect(motivoArchivoInseguro(path.join(raiz, 'hidrantes.sql'), raiz, () => false)).toMatch(/Git no lo ignora/);
  });

  it('dentro pero ignorado por Git, o fuera del repositorio, se acepta', () => {
    expect(motivoArchivoInseguro(path.join(raiz, 'hidrantes.sql'), raiz, () => true)).toBeNull();
    expect(motivoArchivoInseguro(path.join(os.tmpdir(), 'hidrantes.sql'), raiz, () => false)).toBeNull();
  });

  it('el guion temporal no queda bajo el repositorio', () => {
    const carpeta = carpetaTemporal();
    try {
      expect(path.relative(RAIZ, carpeta).startsWith('..') || path.isAbsolute(path.relative(RAIZ, carpeta))).toBe(true);
      expect(path.basename(carpeta)).toMatch(/^hidrantes-/);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('Git ignora un volcado descifrado en la raíz, y no las migraciones', () => {
    for (const r of ['hidrantes.sql', 'restauracion.tmp.sql', 'hidrantes-2026-09-20.sql', 'respaldos/x.sql']) {
      expect(ignoradoPorGit(path.join(RAIZ, r)), r).toBe(true);
    }
    expect(ignoradoPorGit(path.join(RAIZ, 'supabase/migrations/0001_esquema.sql'))).toBe(false);
  });
});

// docs/19 RV-55: si algo falla tras el commit, el acceso de antes no puede volver a valer.
describe('restauración que falla después del commit (RV-55)', () => {
  const acceso = {
    config: JSON.stringify({ codigo_acceso_hash: '$2a$10$nuevo' }),
    dispositivos: JSON.stringify([
      { dispositivo_id: null, token_hash: 'h1', emitido_en: null, ultimo_uso: null, revocado_en: null },
    ]),
    administradores: JSON.stringify([{ email: 'jefe@example.org', activo: true, creado_en: null, creado_por: 'x' }]),
  };
  const volcado = ['CREATE TABLE hidrantes.puntos (id uuid);', ''].join('\n');
  const sql = sqlRestauracion(volcado, 'h.sql', 'restauracion prod', { previas: { hid: 57, boc: 12 }, acceso });
  const commit = sql.lastIndexOf('commit;');

  it('la reposición del acceso y las secuencias van dentro de la transacción, antes del commit', () => {
    const volcadoEn = sql.indexOf('CREATE TABLE hidrantes.puntos');
    const secuencias = sql.indexOf("setval('hidrantes.seq_codigo_hidrante'");
    const codigo = sql.indexOf('insert into hidrantes.config (clave, valor, actualizado_por)\nselect c.key');
    const moviles = sql.indexOf('update hidrantes.dispositivos d set revocado_en = now()');
    const admins = sql.indexOf('update hidrantes.administradores g set activo = false');
    for (const i of [secuencias, codigo, moviles, admins]) {
      expect(i).toBeGreaterThan(volcadoEn);
      expect(i).toBeLessThan(commit);
    }
    expect(sql).toContain('greatest((select last_value from hidrantes.seq_codigo_hidrante), 57');
    // Una sola transacción: ni begin ni commit de más dentro.
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(sql.match(/^commit;$/gm)).toHaveLength(1);
  });

  it('sin esquema antes (nada que reponer), solo las secuencias', () => {
    const vacio = sqlRestauracion(volcado, 'h.sql', 'x', { previas: { hid: 0, boc: 0 }, acceso: null });
    expect(vacio).toContain("setval('hidrantes.seq_codigo_boca'");
    expect(vacio).not.toContain('update hidrantes.dispositivos d set revocado_en');
  });

  it('si falla la lectura del acceso, se aborta sin restaurar; si se lee, se sigue', () => {
    expect(motivoSinAcceso(1)).toMatch(/no se restaura/);
    expect(motivoSinAcceso(0)).toBeNull();
  });

  it('el texto de las acciones manuales dice las tres cosas', () => {
    expect(ACCIONES_MANUALES).toContain('Revocar todos los dispositivos');
    expect(ACCIONES_MANUALES).toContain('Administradores');
    expect(ACCIONES_MANUALES).toContain('avisa al grupo');
  });

  it('la comprobación tras migrar mira el código, los móviles y los administradores', () => {
    const c = sqlComprobarAcceso(acceso);
    expect(c).toContain("clave = 'codigo_acceso_hash'");
    expect(c).toContain("'los móviles revocados'");
    expect(c).toContain("'los administradores'");
    expect(sqlComprobarAcceso({ config: null, dispositivos: null, administradores: null })).toBe("select '';");
  });

  it('MIGRACIONES_DIR solo vale contra el Supabase local', () => {
    const antes = process.env.MIGRACIONES_DIR;
    try {
      process.env.MIGRACIONES_DIR = '/tmp/migraciones-con-fallo';
      expect(dirMigraciones(true)).toBe('/tmp/migraciones-con-fallo');
      expect(dirMigraciones(false)).toBeUndefined();
    } finally {
      if (antes === undefined) delete process.env.MIGRACIONES_DIR;
      else process.env.MIGRACIONES_DIR = antes;
    }
  });
});

// docs/19 RV-64: pg_dump 17.6 escribe \restrict y un psql anterior lo rechaza a medias.
describe('versión de psql antes de restaurar (RV-64)', () => {
  const volcado = (version: string, restrict: boolean) =>
    [
      '--',
      '-- PostgreSQL database dump',
      '--',
      ...(restrict ? ['\\restrict abc123'] : []),
      `-- Dumped from database version 17.6`,
      `-- Dumped by pg_dump version ${version}`,
      'create schema hidrantes;',
      ...(restrict ? ['\\unrestrict abc123'] : []),
    ].join('\n');

  it('versión 16.4 con \\restrict → aborta con el texto', () => {
    const motivo = motivoVersionPsql('psql (PostgreSQL) 16.4 (Ubuntu 16.4-1)', volcado('17.6', true));
    expect(motivo).toContain('Tu psql es 16.4');
    expect(motivo).toContain('\\restrict');
    expect(motivo).toContain('Instala psql 17.6 o posterior');
    expect(motivo).toContain('No se ha tocado nada');
  });

  it('17.6 → sigue', () => {
    expect(motivoVersionPsql('psql (PostgreSQL) 17.6', volcado('17.6', true))).toBeNull();
    expect(motivoVersionPsql('psql (PostgreSQL) 18.0', volcado('17.6', true))).toBeNull();
  });

  it('psql más antiguo que el pg_dump del volcado, aunque no traiga \\restrict → aborta', () => {
    expect(motivoVersionPsql('psql (PostgreSQL) 17.2', volcado('17.5', false))).toContain('Instala psql 17.5');
    expect(motivoVersionPsql('psql (PostgreSQL) 17.5', volcado('17.5', false))).toBeNull();
  });

  it('sin poder leer la versión de psql → aborta', () => {
    expect(motivoVersionPsql('', volcado('17.6', true))).toContain('No se puede saber la versión de psql');
  });
});

// docs/31 RV-134: antes de vaciar el esquema, lo que hay ahora, cifrado y fuera del repositorio.
describe('copia previa antes de LIMPIAR_ESQUEMA (RV-134)', () => {
  const HUELLA = 'BD378A1E0E09843032B3A70254A89DD4FC82E6CE';
  const ok: typeof canalizar = async (_a, b) => {
    // Lo que haría gpg: escribir el archivo de --output.
    writeFileSync(b.args[b.args.indexOf('--output') + 1]!, 'cifrado');
    return { codigoA: 0, codigoB: 0, error: '' };
  };

  it('la huella sale de docs/entornos.md, o de RESPALDO_GPG_HUELLA', () => {
    expect(huellaRespaldo(undefined, undefined)).toMatch(/^[0-9A-F]{40}$/);
    expect(huellaRespaldo('| Huella GPG de respaldos | `' + HUELLA + '` |', undefined)).toBe(HUELLA);
    expect(huellaRespaldo('nada', 'A'.repeat(40))).toBe('A'.repeat(40));
    expect(() => huellaRespaldo('nada', undefined)).toThrow(ErrorDeScript);
  });

  it('pg_dump del esquema hidrantes, con la contraseña en el entorno, a gpg con la clave de respaldo', () => {
    const [a, b] = ordenesCopiaPrevia(POOLER, '/fuera/copia.sql.gpg', HUELLA, 'pg_dump');
    expect(a.comando).toBe('pg_dump');
    expect(a.args).toEqual(['--schema=hidrantes', '--no-owner', '--format=plain']);
    expect(a.args.join(' ')).not.toContain('clave');
    expect(a.env).toMatchObject({ PGPASSWORD: 'clave', PGUSER: `hidrantes_migrador.${REFS.prod}` });
    expect(b.args).toEqual(expect.arrayContaining(['--encrypt', '--recipient', HUELLA, '--output', '/fuera/copia.sql.gpg']));
    expect(rutaPgDump('psql')).toBe('pg_dump');
    expect(rutaPgDump('C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe')).toBe(
      'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    );
  });

  it('deja el archivo fuera del repositorio y dice dónde', async () => {
    const carpeta = mkdtempSync(path.join(os.tmpdir(), 'copia-previa-'));
    try {
      const ahora = new Date('2026-10-07T19:30:05Z');
      const archivo = await copiaPrevia(POOLER, 'prod', { carpeta, huella: HUELLA, canal: ok, ahora });
      expect(archivo).toBe(path.join(carpeta, 'hidrantes-prod-antes-de-restaurar-20261007-193005.sql.gpg'));
      expect(readFileSync(archivo, 'utf8')).toBe('cifrado');
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('dentro del repositorio, no', async () => {
    await expect(copiaPrevia(POOLER, 'prod', { carpeta: path.join(RAIZ, 'copias'), huella: HUELLA, canal: ok })).rejects.toThrow(
      /dentro del repositorio/,
    );
  });

  it('si pg_dump o gpg fallan, o el archivo queda vacío, aborta y no deja nada a medias', async () => {
    const carpeta = mkdtempSync(path.join(os.tmpdir(), 'copia-previa-'));
    try {
      const casos: [typeof canalizar, RegExp][] = [
        [async () => ({ codigoA: 1, codigoB: 0, error: 'pg_dump: error: connection failed' }), /pg_dump 1/],
        [
          async (_a, b) => {
            writeFileSync(b.args[b.args.indexOf('--output') + 1]!, 'a medias');
            return { codigoA: 0, codigoB: 2, error: 'gpg: public key not found' };
          },
          /importado la clave/,
        ],
        [async () => ({ codigoA: 0, codigoB: 0, error: '' }), /no se restaura/],
      ];
      for (const [canal, mensaje] of casos) {
        await expect(copiaPrevia(POOLER, 'staging', { carpeta, huella: HUELLA, canal })).rejects.toThrow(mensaje);
        expect(readdirSync(carpeta)).toEqual([]);
      }
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('canalizar pasa la salida de uno a la entrada del otro, sin shell', async () => {
    const carpeta = mkdtempSync(path.join(os.tmpdir(), 'canal-'));
    const destino = path.join(carpeta, 'salida.txt');
    try {
      const r = await canalizar(
        { comando: process.execPath, args: ['-e', 'process.stdout.write("hola " + process.env.PRUEBA)'], env: { PRUEBA: 'mundo' } },
        { comando: process.execPath, args: ['-e', `process.stdin.pipe(require("fs").createWriteStream(${JSON.stringify(destino)}))`] },
      );
      expect(r).toMatchObject({ codigoA: 0, codigoB: 0 });
      expect(readFileSync(destino, 'utf8')).toBe('hola mundo');
      const falla = await canalizar(
        { comando: 'no-existe-este-programa-rv134', args: [] },
        { comando: process.execPath, args: ['-e', 'process.stdin.resume()'] },
      );
      expect(falla.codigoA).not.toBe(0);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('se hace después de confirmar y antes de la restauración, salvo en local', () => {
    const texto = readFileSync(path.join(RAIZ, 'scripts', 'restaurar.ts'), 'utf8');
    const principal = texto.slice(texto.indexOf('async function principal'));
    const confirmar = principal.indexOf("escrito.trim() !== 'RESTAURAR'");
    const copia = principal.indexOf('await copiaPrevia(url, entorno)');
    const restaurar = principal.indexOf('sqlRestauracion(volcado');
    expect(confirmar).toBeGreaterThan(-1);
    expect(copia).toBeGreaterThan(confirmar);
    expect(restaurar).toBeGreaterThan(copia);
    expect(principal).toContain("if (hayEsquema && entorno !== 'local')");
    expect(principal).toContain('comprobarCadena(entorno, url)');
  });
});
