import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  argsPsql,
  comprobarCadena,
  entornoPg,
  ErrorDeScript,
  errorSeguro,
  esAfirmativo,
  leerEntorno,
  motivoCadenaAjena,
  REFS,
  repositorio,
  repositorioDeRemoto,
} from './comun.ts';

describe('esAfirmativo', () => {
  it.each(['s', 'S', 'si', 'Sí', ' s ', 'y', 'yes'])('"%s" es sí', (r) => expect(esAfirmativo(r)).toBe(true));
  it.each(['', 'n', 'no', 'ss', 'sss'])('"%s" no es sí', (r) => expect(esAfirmativo(r)).toBe(false));
});

describe('entornoPg', () => {
  it('separa la URL en variables PG* sin perder caracteres codificados', () => {
    const e = entornoPg('postgresql://hidrantes_migrador.ref:a%40b@pooler.example.com:5432/postgres'); // detectar-secretos:permitir (contraseña ficticia)
    expect(e).toMatchObject({
      PGHOST: 'pooler.example.com',
      PGPORT: '5432',
      PGUSER: 'hidrantes_migrador.ref',
      PGPASSWORD: 'a@b',
      PGDATABASE: 'postgres',
      PGSSLMODE: 'require',
    });
    expect(entornoPg('postgresql://postgres:postgres@127.0.0.1:55422/postgres').PGSSLMODE).toBe('disable');
  });
});

// docs/19 RV-53: un error de psql en Actions no puede llevar la fila (nombres de voluntarios).
describe('errorSeguro y VERBOSITY=terse', () => {
  const REAL = [
    'psql:<stdin>:3: ERROR:  new row for relation "propuestas" violates check constraint "propuestas_estado_check"',
    'DETAIL:  Failing row contains (0f1e2d3c-4b5a-4968-8776-6a5b4c3d2e1f, alta, {"caudal": "bueno"}, Ana, Pérez, d1, inventada, Luis Martín).',
    'CONTEXT:  SQL statement "insert into hidrantes.propuestas values (...)"',
    '    PL/pgSQL function hidrantes.fn_x() line 4 at SQL statement',
  ].join('\n');

  it('quita un DETAIL: Failing row contains (…, Ana, Pérez, …) real y deja el mensaje principal', () => {
    const limpio = errorSeguro(REAL);
    expect(limpio).toBe(
      'psql:<stdin>:3: ERROR:  new row for relation "propuestas" violates check constraint "propuestas_estado_check"',
    );
    for (const dato of ['Ana', 'Pérez', 'Luis', 'Failing row contains (0f']) expect(limpio).not.toContain(dato);
  });

  it('también un "Failing row contains" en la misma línea, y QUERY', () => {
    expect(errorSeguro('ERROR:  23502: null value in column "x" Failing row contains (Ana, Pérez).')).toBe(
      'ERROR:  23502: null value in column "x" Failing row contains (…)',
    );
    expect(errorSeguro('ERROR:  syntax error\nQUERY:  select Ana')).toBe('ERROR:  syntax error');
  });

  it('con CI, psql lleva VERBOSITY=terse; sin CI, solo si se pide', () => {
    const antes = process.env.CI;
    try {
      process.env.CI = '1';
      expect(argsPsql()).toContain('VERBOSITY=terse');
      delete process.env.CI;
      expect(argsPsql()).not.toContain('VERBOSITY=terse');
      expect(argsPsql({ terse: true })).toContain('VERBOSITY=terse');
    } finally {
      if (antes === undefined) delete process.env.CI;
      else process.env.CI = antes;
    }
  });
});

// Ningún script concatena un error de psql (u otro proceso) sin pasarlo por errorSeguro.
describe('scripts sin errores en crudo (RV-53)', () => {
  it('todo abortar(…)/log.aviso(…) que incluye un .error pasa por errorSeguro', () => {
    const carpeta = path.resolve(import.meta.dirname, '..');
    const archivos = [
      ...readdirSync(carpeta).filter((a) => a.endsWith('.ts') && !a.endsWith('.test.ts')),
      ...readdirSync(path.join(carpeta, 'lib'))
        .filter((a) => a.endsWith('.ts') && !a.endsWith('.test.ts'))
        .map((a) => `lib/${a}`),
    ];
    const malas: string[] = [];
    for (const a of archivos) {
      readFileSync(path.join(carpeta, a), 'utf8')
        .split('\n')
        .forEach((l, i) => {
          if (/\$\{[^}]*\.error\b/.test(l) && !/errorSeguro\(|errorDePromocion\(/.test(l)) malas.push(`${a}:${i + 1}`);
        });
    }
    expect(malas).toEqual([]);
  });
});

// docs/31 RV-134: con `--entorno produccion`, restaurar.ts no encontraba el ref y no comprobaba nada.
describe('entornos compartidos (RV-134)', () => {
  // detectar-secretos:permitir (cadenas ficticias, sin contraseña de verdad)
  const POOLER = (ref: string) =>
    `postgresql://hidrantes_migrador.${ref}:x@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
  const LOCAL = 'postgresql://hidrantes_migrador:x@127.0.0.1:55422/postgres'; // detectar-secretos:permitir (ficticia)

  it('solo local, staging y prod; produccion es prod', () => {
    expect(leerEntorno('local')).toBe('local');
    expect(leerEntorno('staging')).toBe('staging');
    expect(leerEntorno('prod')).toBe('prod');
    expect(leerEntorno('produccion')).toBe('prod');
    expect(leerEntorno('Producción')).toBe('prod');
    for (const malo of ['pre', 'production', 'dev', 'prod ;', '']) {
      expect(() => leerEntorno(malo), malo).toThrow(ErrorDeScript);
    }
    expect(() => leerEntorno(undefined)).toThrow(/--entorno/);
  });

  it('cada script puede limitar los entornos que admite', () => {
    expect(() => leerEntorno('local', ['staging', 'prod'])).toThrow(/Entorno desconocido/);
    expect(leerEntorno('produccion', ['staging', 'prod'])).toBe('prod');
  });

  it('--entorno produccion con una cadena de staging aborta, y al revés', () => {
    expect(() => comprobarCadena(leerEntorno('produccion'), POOLER(REFS.staging))).toThrow(/apunta al proyecto/);
    expect(() => comprobarCadena(leerEntorno('staging'), POOLER(REFS.prod))).toThrow(/apunta al proyecto/);
    expect(() => comprobarCadena(leerEntorno('prod'), LOCAL)).toThrow(/desconocido/);
    expect(() => comprobarCadena(leerEntorno('produccion'), POOLER(REFS.prod))).not.toThrow();
    const directa = `postgresql://postgres:x@db.${REFS.staging}.supabase.co:5432/postgres`; // detectar-secretos:permitir (ficticia)
    expect(() => comprobarCadena('staging', directa)).not.toThrow();
  });

  it('local solo con una base de esta máquina', () => {
    expect(motivoCadenaAjena('local', LOCAL)).toBeNull();
    expect(motivoCadenaAjena('local', LOCAL.replace('127.0.0.1', 'localhost'))).toBeNull();
    expect(motivoCadenaAjena('local', POOLER(REFS.prod))).toMatch(/no es esta máquina/);
    expect(motivoCadenaAjena('local', 'no es una url')).toMatch(/no es una URL/);
  });

  it('restaurar, revertir, anonimizar y migrar leen --entorno con la función compartida', () => {
    const carpeta = path.resolve(import.meta.dirname, '..');
    for (const s of ['restaurar.ts', 'revertir.ts', 'anonimizar.ts', 'migrar.ts']) {
      const texto = readFileSync(path.join(carpeta, s), 'utf8');
      expect(texto, s).toMatch(/leerEntorno\(/);
      expect(texto, s).not.toMatch(/=== 'prod' \? 'produccion'|produccion: '/);
    }
  });
});

describe('repositorio (docs/32 RV-208)', () => {
  it.each([
    'https://github.com/titular/hidrantes-albolote.git',
    'https://github.com/titular/hidrantes-albolote',
    'git@github.com:titular/hidrantes-albolote.git',
    'ssh://git@github.com/titular/hidrantes-albolote.git',
  ])('lee titular y nombre de %s', (url) => {
    expect(repositorioDeRemoto(url)).toEqual({
      propietario: 'titular',
      nombre: 'hidrantes-albolote',
      completo: 'titular/hidrantes-albolote',
    });
  });

  it.each(['', 'https://gitlab.com/titular/repo.git', 'https://github.com/solo-titular', 'C:/repos/local'])(
    'un remoto que no es de GitHub no da repositorio: "%s"',
    (url) => expect(repositorioDeRemoto(url)).toBeNull(),
  );

  it('el de este checkout sale de git remote, no de un nombre escrito en los scripts', () => {
    const r = repositorio();
    expect(r.completo).toBe(`${r.propietario}/${r.nombre}`);
    expect(r.nombre).toBe('hidrantes-albolote');
  });

  // arranque.ts (lo fija la primera vez y comprueba git user.name) y publicar.ts son de otras sesiones
  // de docs/32; pasan a repositorio() en su propio PR.
  const PENDIENTES = ['arranque.ts', 'publicar.ts'];

  it('ningún script escribe el titular a mano: lo lee de repositorio()', () => {
    const dir = path.resolve(import.meta.dirname, '..');
    const conTitular = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !PENDIENTES.includes(f))
      .filter((f) => /(['"`])[A-Za-z0-9-]+\/hidrantes-albolote\1/.test(readFileSync(path.join(dir, f), 'utf8')));
    expect(conTitular).toEqual([]);
  });
});
