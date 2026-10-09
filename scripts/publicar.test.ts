import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ErrorDeScript, type Resultado } from './lib/comun.ts';
import {
  ARCHIVO_STAGING,
  type Contexto,
  type DatosPuerta,
  type DatosStaging,
  ETIQUETA_BLOQUEO,
  MENSAJE_EMPUJON,
  analizarArgumentos,
  checksObligatorios,
  compararChangelog,
  comprobarStaging,
  cuerpoAprobacion,
  datosPuerta,
  decidir,
  diffSoloDeVersion,
  empujon,
  esperarChecks,
  estadoChecks,
  estadoEjecucion,
  evaluarPuerta,
  evaluarStaging,
  filasQueBloquean,
  fueraDeLoPermitido,
  fusionar,
  checkAunCorriendo,
  hayCiDePr,
  leerChecks,
  llegaA,
  localizarRelease,
  publicar,
  resumenPuerta,
  ultimoMarcador,
} from './publicar.ts';

const DEV = 'a'.repeat(40);
const VERIF = 'b'.repeat(40);
const MAIN = 'c'.repeat(40);

// ---------- gh, git y npm simulados: sin red ----------

type Regla = [RegExp, Resultado | ((entrada?: string) => Resultado)];
const ok = (salida = ''): Resultado => ({ codigo: 0, salida, error: '' });
const falla = (error = 'fallo', codigo = 1): Resultado => ({ codigo, salida: '', error });

function simulado(reglas: Regla[], opciones: Partial<Contexto['opciones']> = {}) {
  const llamadas: { linea: string; entrada?: string }[] = [];
  const ctx: Contexto = {
    ej: (comando, args, o) => {
      const linea = [comando, ...args].join(' ');
      llamadas.push({ linea, entrada: o?.entrada });
      const regla = reglas.find(([re]) => re.test(linea));
      if (!regla) throw new Error(`Llamada no prevista: ${linea}`);
      return typeof regla[1] === 'function' ? regla[1](o?.entrada) : regla[1];
    },
    opciones: { soloComprobar: false, hasta: 'paridad', ...opciones },
    esperar: async () => {},
    limites: { checks: 60_000, despliegue: 60_000, cada: 1 },
  };
  return { ctx, llamadas, lineas: () => llamadas.map((l) => l.linea) };
}

// En la release 0.9.0 pareció que un fallo de gh pr merge salía con 0. Es la tubería de quien lo
// lanza (`npm run publicar | tail` devuelve el código de tail); el script, sin tubería, sale con 1.
describe('código de salida', () => {
  it('un abortar sale con un código distinto de 0 y el motivo en la salida de errores', () => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/publicar.ts', '--opcion-que-no-existe'], {
      cwd: path.resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Opción desconocida: --opcion-que-no-existe');
  });
});

describe('argumentos', () => {
  it('sin nada: todos los pasos, de verdad', () => {
    expect(analizarArgumentos([])).toEqual({ soloComprobar: false, hasta: 'paridad' });
  });

  it('--solo-comprobar y --hasta por nombre, con espacio o con =', () => {
    expect(analizarArgumentos(['--solo-comprobar'])).toEqual({ soloComprobar: true, hasta: 'paridad' });
    expect(analizarArgumentos(['--hasta', 'puerta'])).toEqual({ soloComprobar: false, hasta: 'puerta' });
    expect(analizarArgumentos(['--hasta=main', '--solo-comprobar'])).toEqual({ soloComprobar: true, hasta: 'main' });
  });

  it('--hasta por número, de 1 a 6', () => {
    expect(analizarArgumentos(['--hasta', '1']).hasta).toBe('release');
    expect(analizarArgumentos(['--hasta', '4']).hasta).toBe('puerta');
    expect(analizarArgumentos(['--hasta', '6']).hasta).toBe('paridad');
  });

  it('una errata no publica: lo desconocido es un error', () => {
    expect(() => analizarArgumentos(['--solo-comprobra'])).toThrow(ErrorDeScript);
    expect(() => analizarArgumentos(['--hasta', 'produccion'])).toThrow(/Paso desconocido/);
    expect(() => analizarArgumentos(['--hasta', '7'])).toThrow(/Paso desconocido/);
    expect(() => analizarArgumentos(['--hasta', '0'])).toThrow(/Paso desconocido/);
    expect(() => analizarArgumentos(['--hasta'])).toThrow(/necesita un paso/);
    expect(() => analizarArgumentos(['--hasta', '--solo-comprobar'])).toThrow(/necesita un paso/);
    expect(() => analizarArgumentos(['--hasta', '2', '--hasta', '3'])).toThrow(/repetido/);
    expect(() => analizarArgumentos(['publicar'])).toThrow(/desconocida/);
  });

  it('llegaA: el paso pedido y los anteriores', () => {
    const o = analizarArgumentos(['--hasta', 'puerta']);
    expect(llegaA(o, 'release')).toBe(true);
    expect(llegaA(o, 'puerta')).toBe(true);
    expect(llegaA(o, 'aprobar')).toBe(false);
  });
});

describe('el marcador de la comprobación en staging', () => {
  it('lee la última línea «commit: <sha> · resultado: …»', () => {
    const texto = [
      '# Comprobación en staging',
      `commit: ${VERIF.slice(0, 7)} · resultado: rojo`,
      '| recorrido | ok |',
      `- commit: ${VERIF} · resultado: verde`,
    ].join('\n');
    expect(ultimoMarcador(texto)).toEqual({ commit: VERIF, resultado: 'verde' });
  });

  it('el más reciente manda, aunque sea rojo', () => {
    const texto = `commit: ${VERIF} · resultado: verde\n\ncommit: ${DEV} · resultado: rojo\n`;
    expect(ultimoMarcador(texto)).toEqual({ commit: DEV, resultado: 'rojo' });
  });

  it('sin marcador, o con otro formato, no hay nada', () => {
    expect(ultimoMarcador('Todo bien con el commit abc1234')).toBeNull();
    expect(ultimoMarcador(`commit ${VERIF} resultado verde`)).toBeNull();
    expect(ultimoMarcador(`texto commit: ${VERIF} · resultado: verde`)).toBeNull();
  });

  it('admite la línea entre comillas de código', () => {
    expect(ultimoMarcador(`\`commit: ${VERIF} · resultado: verde\``)?.resultado).toBe('verde');
  });
});

describe('qué puede cambiar desde la comprobación en staging', () => {
  it('documentación y release-please sí; código no', () => {
    expect(
      fueraDeLoPermitido(
        ['docs/31-revision-completa.md', ARCHIVO_STAGING, 'CHANGELOG.md', '.release-please-manifest.json'],
        true,
        true,
      ),
    ).toEqual([]);
    expect(fueraDeLoPermitido(['src/main.tsx', 'docs/04.md', 'supabase/migrations/0041_x.sql'], true)).toEqual([
      'src/main.tsx',
      'supabase/migrations/0041_x.sql',
    ]);
  });

  // docs/32 RV-205: CHANGELOG.md va en el bundle (Novedades); ya no está exento por su nombre.
  it('CHANGELOG.md solo si sus líneas son las de release-please', () => {
    expect(fueraDeLoPermitido(['CHANGELOG.md'], true)).toEqual(['CHANGELOG.md']);
    expect(fueraDeLoPermitido(['CHANGELOG.md'], true, true)).toEqual([]);
  });

  it('compararChangelog: las mismas líneas, en cualquier orden; una de más o de menos, no', () => {
    const rp = ['+## [0.9.0](https://x/compare/v0.8.0...v0.9.0) (2026-10-08)', '+* algo ([#500](u))'];
    expect(compararChangelog([...rp].reverse(), rp)).toBeNull();
    expect(compararChangelog([...rp, '+* texto a mano'], rp)).toContain('«+* texto a mano»');
    expect(compararChangelog([rp[0]!], rp)).toContain('no tiene todas las líneas');
  });

  it('package.json, solo si únicamente cambia la versión', () => {
    expect(fueraDeLoPermitido(['package.json', 'package-lock.json'], true)).toEqual([]);
    expect(fueraDeLoPermitido(['package.json'], false)).toEqual(['package.json']);
  });

  it('diffSoloDeVersion distingue la versión de una dependencia', () => {
    const version = [
      'diff --git a/package.json b/package.json',
      '--- a/package.json',
      '+++ b/package.json',
      '@@ -4 +4 @@',
      '-  "version": "0.8.0",',
      '+  "version": "0.9.0",',
    ].join('\n');
    expect(diffSoloDeVersion(version)).toBe(true);
    expect(diffSoloDeVersion('')).toBe(true);
    expect(diffSoloDeVersion(`${version}\n@@ -20 +20 @@\n-    "leaflet": "^1.9.3",\n+    "leaflet": "^1.9.4",`)).toBe(
      false,
    );
  });

  const base: Omit<DatosStaging, 'marcador'> = {
    develop: DEV,
    verificado: VERIF,
    deployStaging: true,
    ci: true,
    servido: null,
    esAntecesor: true,
    fuera: [],
  };

  it('verde con el mismo commit', () => {
    expect(evaluarStaging({ ...base, marcador: { commit: DEV, resultado: 'verde' }, verificado: DEV }).ok).toBe(true);
  });

  it('verde con un antecesor, si después solo cambian docs y lo de release-please', () => {
    const r = evaluarStaging({ ...base, marcador: { commit: VERIF, resultado: 'verde' } });
    expect(r.ok).toBe(true);
  });

  it('rojo sin deploy-staging, sin CI o sin staging sirviéndolo, aunque sea el mismo commit (RV-205)', () => {
    const m = { commit: DEV, resultado: 'verde' as const };
    const mismo = { ...base, marcador: m, verificado: DEV };
    expect(evaluarStaging({ ...mismo, deployStaging: false }).detalle).toContain('deploy-staging.yml');
    expect(evaluarStaging({ ...mismo, ci: false }).detalle).toContain('ci.yml');
    const r = evaluarStaging({ ...mismo, servido: 'staging no dice qué commit sirve' });
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain('staging no dice qué commit sirve');
  });

  it('rojo: sin marcador, en rojo, commit desconocido, fuera de la historia o con código nuevo', () => {
    expect(evaluarStaging({ ...base, marcador: null }).detalle).toContain('no tiene ninguna línea');
    expect(evaluarStaging({ ...base, marcador: { commit: VERIF, resultado: 'rojo' } }).detalle).toContain('en rojo');
    expect(
      evaluarStaging({ ...base, marcador: { commit: VERIF, resultado: 'verde' }, verificado: null }).detalle,
    ).toContain('no está en el repositorio');
    expect(
      evaluarStaging({ ...base, marcador: { commit: VERIF, resultado: 'verde' }, esAntecesor: false }).detalle,
    ).toContain('no está en la historia');
    const r = evaluarStaging({
      ...base,
      marcador: { commit: VERIF, resultado: 'verde' },
      fuera: ['functions/api/push.ts'],
    });
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain('functions/api/push.ts');
  });
});

describe('la puerta (DEC-176)', () => {
  const verde: DatosPuerta = {
    ciMain: 'verde',
    staging: { ok: true, detalle: 'en verde' },
    produccion: { codigo: 0, filas: [] },
    bloqueos: [],
  };

  it('todo en verde: se aprueba', () => {
    const r = evaluarPuerta(verde);
    expect(r.verde).toBe(true);
    expect(r.lineas).toHaveLength(4);
  });

  it('cada condición, sola, la cierra', () => {
    expect(evaluarPuerta({ ...verde, ciMain: 'rojo' }).verde).toBe(false);
    expect(evaluarPuerta({ ...verde, ciMain: 'pendiente' }).verde).toBe(false);
    expect(evaluarPuerta({ ...verde, ciMain: 'sin checks' }).verde).toBe(false);
    expect(evaluarPuerta({ ...verde, staging: { ok: false, detalle: 'x' } }).verde).toBe(false);
    expect(evaluarPuerta({ ...verde, produccion: { codigo: 1, filas: ['a · b · FALTA'] } }).verde).toBe(false);
    expect(evaluarPuerta({ ...verde, produccion: { codigo: 2, filas: [] } }).verde).toBe(false);
    expect(evaluarPuerta({ ...verde, bloqueos: [{ number: 9, title: 'x' }] }).verde).toBe(false);
  });

  it('si no se pueden leer las issues, tampoco pasa', () => {
    const r = evaluarPuerta({ ...verde, bloqueos: null });
    expect(r.verde).toBe(false);
    expect(resumenPuerta(r, MAIN)).toContain('no se ha podido consultar');
  });

  it('el resumen dice qué falló, con el commit', () => {
    const r = evaluarPuerta({
      ...verde,
      produccion: { codigo: 2, filas: ['base de datos · migraciones · NO COMPROBADO'] },
    });
    const texto = resumenPuerta(r, MAIN);
    expect(texto).toContain(`en rojo para ${MAIN.slice(0, 7)}`);
    expect(texto).toContain('NO · comprobar-produccion --completo: algo imprescindible queda sin comprobar');
    expect(texto).toContain('OK · CI de main');
  });

  it('el cuerpo de pending_deployments: approved o rejected, con el id del environment', () => {
    expect(JSON.parse(cuerpoAprobacion(22, true, 'bien'))).toEqual({
      environment_ids: [22],
      state: 'approved',
      comment: 'bien',
    });
    expect(JSON.parse(cuerpoAprobacion(22, false, 'mal')).state).toBe('rejected');
    expect(JSON.parse(cuerpoAprobacion(22, true, 'x'.repeat(5000))).comment).toHaveLength(998);
  });
});

describe('checks y ejecuciones', () => {
  it('estadoChecks', () => {
    expect(estadoChecks([])).toBe('sin checks');
    expect(
      estadoChecks([
        { name: 'ci-calidad', bucket: 'pass' },
        { name: 'ci-e2e', bucket: 'skipping' },
      ]),
    ).toBe('verde');
    expect(
      estadoChecks([
        { name: 'ci-calidad', bucket: 'pass' },
        { name: 'ci-e2e', bucket: 'pending' },
      ]),
    ).toBe('pendiente');
    expect(
      estadoChecks([
        { name: 'ci-calidad', bucket: 'cancel' },
        { name: 'ci-e2e', bucket: 'pending' },
      ]),
    ).toBe('rojo');
  });

  // Lo que pasó en la release 0.9.0: ci-e2e no existe hasta que acaban sus partes, y gh pr checks
  // --required solo enseña los que ya existen. Un check obligatorio que falta no es verde.
  it('estadoChecks: un obligatorio que aún no aparece está pendiente, no en verde', () => {
    const obligatorios = ['ci-calidad', 'ci-sql', 'ci-e2e'];
    const sinE2e = [
      { name: 'ci-calidad', bucket: 'pass' },
      { name: 'ci-sql', bucket: 'pass' },
    ];
    expect(estadoChecks(sinE2e, obligatorios)).toBe('pendiente');
    expect(estadoChecks([...sinE2e, { name: 'ci-e2e', bucket: 'pass' }], obligatorios)).toBe('verde');
    expect(estadoChecks([...sinE2e, { name: 'ci-e2e', bucket: 'skipping' }], obligatorios)).toBe('verde');
    expect(leerChecks(ok(JSON.stringify(sinE2e)), obligatorios)).toBe('pendiente');
  });

  it('checksObligatorios: los de la protección de la rama; sin ninguno, se para', () => {
    const s = simulado([
      [/branches\/develop\/protection\/required_status_checks/, ok('["ci-calidad","ci-sql","ci-e2e"]')],
      [/branches\/main\/protection\/required_status_checks/, ok('[]')],
    ]);
    expect(checksObligatorios(s.ctx, 'develop')).toEqual(['ci-calidad', 'ci-sql', 'ci-e2e']);
    expect(() => checksObligatorios(s.ctx, 'main')).toThrow(/no exige ningún check/);
  });

  it('leerChecks: sin checks es un estado, no un error; otro fallo de gh sí lo es', () => {
    expect(leerChecks({ codigo: 1, salida: '', error: "no checks reported on the 'x' branch" })).toBe('sin checks');
    expect(leerChecks({ codigo: 8, salida: '[{"name":"ci-sql","bucket":"pending"}]', error: '' })).toBe('pendiente');
    expect(() => leerChecks(falla('HTTP 401'))).toThrow(/HTTP 401/);
  });

  it('estadoEjecucion', () => {
    expect(estadoEjecucion(null)).toBe('sin checks');
    expect(estadoEjecucion({ status: 'in_progress', conclusion: null })).toBe('pendiente');
    expect(estadoEjecucion({ status: 'completed', conclusion: 'success' })).toBe('verde');
    expect(estadoEjecucion({ status: 'completed', conclusion: 'failure' })).toBe('rojo');
  });

  it('filasQueBloquean: solo FALTA y NO COMPROBADO, sin colores', () => {
    const salida = [
      '| Grupo | Qué | Estado | Nota |',
      '| a | X | OK | |',
      '| base de datos | migraciones | NO COMPROBADO | sin SUPABASE_DB_URL_PROD |',
      '\x1b[31m| Pages | SAL_IP | FALTA | |\x1b[0m',
    ].join('\n');
    expect(filasQueBloquean(salida)).toEqual(['base de datos · migraciones · NO COMPROBADO', 'Pages · SAL_IP · FALTA']);
  });
});

describe('PR de release-please y empujón (DEC-079)', () => {
  const pr = {
    number: 545,
    title: 'chore(develop): release hidrantes-albolote 0.9.0',
    headRefName: 'release-please--branches--develop--components--hidrantes-albolote',
    headRefOid: VERIF,
    labels: [{ name: 'autorelease: pending' }],
  };

  it('localiza el PR por rama y etiqueta', () => {
    const otro = { ...pr, number: 497, headRefName: 'dependabot/npm', labels: [] };
    const { ctx } = simulado([[/^gh pr list/, ok(JSON.stringify([otro, pr]))]]);
    expect(localizarRelease(ctx)?.number).toBe(545);
  });

  it('sin PR abierto, null; con dos, se para', () => {
    expect(localizarRelease(simulado([[/^gh pr list/, ok('[]')]]).ctx)).toBeNull();
    const dos = simulado([[/^gh pr list/, ok(JSON.stringify([pr, { ...pr, number: 546 }]))]]);
    expect(() => localizarRelease(dos.ctx)).toThrow(/2 PR de release/);
  });

  it('la CI del bot en action_required no cuenta: hace falta el empujón', () => {
    const runs = [{ headSha: VERIF, conclusion: 'action_required' }];
    expect(hayCiDePr(simulado([[/^gh run list/, ok(JSON.stringify(runs))]]).ctx, pr)).toBe(false);
  });

  it('hace falta el empujón si ninguna CI de pull_request es de su cabeza', () => {
    expect(hayCiDePr(simulado([[/^gh run list/, ok(JSON.stringify([{ headSha: DEV }]))]]).ctx, pr)).toBe(false);
    expect(hayCiDePr(simulado([[/^gh run list/, ok(JSON.stringify([{ headSha: VERIF }]))]]).ctx, pr)).toBe(true);
  });

  it('el empujón: commit-tree encima de la cabeza y push del sha, sin cambiar de rama', () => {
    const nuevo = 'd'.repeat(40);
    const s = simulado([
      [/^git fetch origin release-please/, ok()],
      [/^git rev-parse FETCH_HEAD/, ok(VERIF)],
      [/^git show -s --format=%T/, ok('e'.repeat(40))],
      [/^git commit-tree/, ok(nuevo)],
      [/^git push origin/, ok()],
    ]);
    expect(empujon(s.ctx, pr)).toBe(nuevo);
    expect(s.lineas()).toContain(`git commit-tree ${'e'.repeat(40)} -p ${VERIF} -m ${MENSAJE_EMPUJON}`);
    expect(s.lineas()).toContain(`git push origin ${nuevo}:refs/heads/${pr.headRefName}`);
    expect(s.lineas().some((l) => /switch|checkout|--force/.test(l))).toBe(false);
  });

  it('si la rama ha cambiado entre medias, no empuja', () => {
    const s = simulado([
      [/^git fetch/, ok()],
      [/^git rev-parse FETCH_HEAD/, ok(DEV)],
    ]);
    expect(() => empujon(s.ctx, pr)).toThrow(/ha cambiado/);
    expect(s.lineas().some((l) => l.startsWith('git push'))).toBe(false);
  });
});

describe('la puerta con gh, git y npm simulados', () => {
  // El commit de release-please (en develop) y el del bot en su PR: CHANGELOG.md cambia en los dos igual.
  const RP = '1'.repeat(40);
  const BOT = '2'.repeat(40);
  const LINEAS_RP = ['+## [0.9.0](https://x/compare/v0.8.0...v0.9.0) (2026-10-08)', '+* algo ([#500](u))'];
  const ejecucion = (extra: object = {}) => ok(JSON.stringify({ id: 1, html_url: 'u', ...extra }));

  function reglasPuerta({
    marcador = `commit: ${VERIF} · resultado: verde`,
    diff = ['CHANGELOG.md', 'package.json', ARCHIVO_STAGING].join('\n'),
    diffVersion = '-  "version": "0.8.0",\n+  "version": "0.9.0",',
    diffChangelog = LINEAS_RP.join('\n'),
    patchBot = `@@ -1,3 +1,5 @@\n # Changelog\n${LINEAS_RP.join('\n')}\n `,
    prDelCommit = [{ number: 545, head: 'release-please--branches--develop', user: 'github-actions[bot]' }] as object[],
    produccion = 0,
    issues = '[]',
    ci = { status: 'completed', conclusion: 'success' },
    deployStaging = true,
    ciStaging = true,
    html = `<head><meta name="commit" content="${VERIF}"></head>` as string | null,
  } = {}): Regla[] {
    return [
      [new RegExp(`actions/workflows/ci\\.yml/runs\\?head_sha=${MAIN}&event=push`), ejecucion(ci)],
      [/actions\/workflows\/ci\.yml\/runs\?head_sha=\w+&status=success/, ciStaging ? ejecucion() : ok('null')],
      [
        /actions\/workflows\/deploy-staging\.yml\/runs\?head_sha=\w+&status=success/,
        deployStaging ? ejecucion() : ok('null'),
      ],
      [/^curl .*hidrantes-albolote-staging\.pages\.dev/, html === null ? falla('curl: (28) timeout', 28) : ok(html)],
      [/^git show -s --format=%P/, ok(`${'f'.repeat(40)} ${DEV}`)],
      [new RegExp(`^git show ${DEV}:${ARCHIVO_STAGING}`), ok(marcador)],
      [/^git rev-parse --verify --quiet (\w+)\^\{commit\}/, ok(VERIF)],
      [/^git merge-base --is-ancestor/, ok()],
      [/^git diff --name-only/, ok(diff)],
      [/^git diff -U0 \w+ \w+ -- CHANGELOG\.md/, ok(diffChangelog)],
      [/^git diff -U0/, ok(diffVersion)],
      [/^git log --format=%H \w+\.\.\w+ -- CHANGELOG\.md/, ok(RP)],
      [new RegExp(`^gh api repos/\\S+/commits/${RP}/pulls`), ok(JSON.stringify(prDelCommit))],
      [
        /^gh api repos\/\S+\/pulls\/545\/commits/,
        ok(
          JSON.stringify([
            { sha: BOT, autor: 'github-actions[bot]' },
            { sha: 'e'.repeat(40), autor: 'alguien' },
          ]),
        ),
      ],
      [
        new RegExp(`^gh api repos/\\S+/commits/${BOT} `),
        ok(JSON.stringify([{ filename: 'CHANGELOG.md', patch: patchBot }])),
      ],
      [/^git diff --quiet /, ok()],
      [/^git ls-files --others/, ok()],
      [
        /^npm run --silent comprobar-produccion -- --completo/,
        { codigo: produccion, salida: '| bd | migraciones | FALTA | x |', error: '' },
      ],
      [/^gh issue list/, ok(issues)],
    ];
  }

  // docs/32 RV-205: cada motivo por el que la marca sola ya no basta.
  it('rojo sin una ejecución de deploy-staging.yml en verde con el commit de la marca', () => {
    const r = comprobarStaging(simulado(reglasPuerta({ deployStaging: false })).ctx, DEV);
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain('deploy-staging.yml');
  });

  it('rojo sin una ejecución de ci.yml en verde con el commit de la marca', () => {
    const r = comprobarStaging(simulado(reglasPuerta({ ciStaging: false })).ctx, DEV);
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain('ci.yml');
  });

  it('rojo si staging no responde o no dice su commit', () => {
    expect(comprobarStaging(simulado(reglasPuerta({ html: null })).ctx, DEV).detalle).toContain(
      'no dice qué commit sirve',
    );
    expect(comprobarStaging(simulado(reglasPuerta({ html: '<head></head>' })).ctx, DEV).ok).toBe(false);
  });

  it('rojo si staging sirve un commit con código que no se comprobó', () => {
    const SERV = '9'.repeat(40);
    const reglas = reglasPuerta({ html: `<meta name="commit" content="${SERV}">` });
    reglas.unshift(
      [new RegExp(`^git rev-parse --verify --quiet ${SERV}`), ok(SERV)],
      [new RegExp(`^git diff --name-only --no-renames ${VERIF} ${SERV}`), ok('src/app.tsx')],
      [new RegExp(`^git merge-base --is-ancestor ${DEV} ${SERV}`), falla('', 1)],
    );
    const r = comprobarStaging(simulado(reglas).ctx, DEV);
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain(`staging sirve ${SERV.slice(0, 7)}, con cambios no comprobados: src/app.tsx`);
  });

  it('rojo si staging sirve un commit que no viene después del comprobado', () => {
    const SERV = '9'.repeat(40);
    const reglas = reglasPuerta({ html: `<meta name="commit" content="${SERV}">` });
    reglas.unshift(
      [new RegExp(`^git rev-parse --verify --quiet ${SERV}`), ok(SERV)],
      [new RegExp(`^git merge-base --is-ancestor ${VERIF} ${SERV}`), falla('', 1)],
    );
    expect(comprobarStaging(simulado(reglas).ctx, DEV).detalle).toContain('no viene después');
  });

  it('verde si staging sirve un commit posterior con solo docs (el del propio registro)', () => {
    const SERV = '9'.repeat(40);
    const reglas = reglasPuerta({ html: `<meta name="commit" content="${SERV}">` });
    reglas.unshift(
      [new RegExp(`^git rev-parse --verify --quiet ${SERV}`), ok(SERV)],
      [new RegExp(`^git diff --name-only --no-renames ${VERIF} ${SERV}`), ok(ARCHIVO_STAGING)],
      [new RegExp(`^git merge-base --is-ancestor ${DEV} ${SERV}`), falla('', 1)],
    );
    expect(comprobarStaging(simulado(reglas).ctx, DEV).ok).toBe(true);
  });

  it('verde si staging ya sirve algo posterior a lo que se publica (develop avanzó durante la CI de main)', () => {
    const SERV = '9'.repeat(40);
    const reglas = reglasPuerta({ html: `<meta name="commit" content="${SERV}">` });
    reglas.unshift(
      [new RegExp(`^git rev-parse --verify --quiet ${SERV}`), ok(SERV)],
      // Lo de después de develop no se publica: no se mira.
      [new RegExp(`^git diff --name-only --no-renames ${VERIF} ${SERV}`), ok('src/app.tsx')],
    );
    const s = simulado(reglas);
    expect(comprobarStaging(s.ctx, DEV).ok).toBe(true);
    expect(s.lineas()).toContain(`git merge-base --is-ancestor ${DEV} ${SERV}`);
  });

  it('rojo si CHANGELOG.md tiene una línea que no puso release-please', () => {
    const r = comprobarStaging(
      simulado(reglasPuerta({ diffChangelog: [...LINEAS_RP, '+* Ahora todo es gratis'].join('\n') })).ctx,
      DEV,
    );
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain('«+* Ahora todo es gratis»');
  });

  it('rojo si CHANGELOG.md cambia en un commit que no es de un PR de release-please', () => {
    const r = comprobarStaging(
      simulado(reglasPuerta({ prDelCommit: [{ number: 600, head: 'fase-9/algo', user: 'aron285-coder' }] })).ctx,
      DEV,
    );
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain('no viene de un PR de release-please');
  });

  it('rojo si el PR de release-please lo abre otro (no su bot)', () => {
    const prDelCommit = [{ number: 545, head: 'release-please--branches--develop', user: 'alguien' }];
    expect(comprobarStaging(simulado(reglasPuerta({ prDelCommit })).ctx, DEV).ok).toBe(false);
  });

  it('las líneas que un commit a mano añade a la rama del PR de release no cuentan como de release-please', () => {
    // El diff de develop trae una línea más; los commits del bot, no.
    const r = comprobarStaging(
      simulado(reglasPuerta({ diffChangelog: [...LINEAS_RP, '+* retocado a mano en la rama'].join('\n') })).ctx,
      DEV,
    );
    expect(r.ok).toBe(false);
  });

  it('verde: CI de main, staging con un antecesor y solo versión, producción y sin bloqueos', async () => {
    const { ctx } = simulado(reglasPuerta());
    const d = await datosPuerta(ctx, MAIN, DEV, { esperarCi: true });
    expect(evaluarPuerta(d).verde).toBe(true);
  });

  it('el develop que se compara es el segundo padre del merge en main', async () => {
    const s = simulado(reglasPuerta());
    const { developDe } = await import('./publicar.ts');
    expect(developDe(s.ctx, MAIN)).toBe(DEV);
  });

  it('rojo si después de la comprobación cambia código, o una dependencia', () => {
    expect(comprobarStaging(simulado(reglasPuerta({ diff: 'src/app.tsx' })).ctx, DEV).ok).toBe(false);
    const dep = reglasPuerta({ diffVersion: '-    "leaflet": "1",\n+    "leaflet": "2",' });
    expect(comprobarStaging(simulado(dep).ctx, DEV).ok).toBe(false);
  });

  it('rojo si el registro de staging no existe en ese commit', () => {
    const reglas = reglasPuerta();
    reglas.splice(2, 1, [new RegExp(`^git show ${DEV}:`), falla('does not exist', 128)]);
    expect(comprobarStaging(simulado(reglas).ctx, DEV).detalle).toContain('no tiene ninguna línea');
  });

  it('rojo con comprobar-produccion 1 o 2, con las filas en el detalle', async () => {
    for (const codigo of [1, 2]) {
      const d = await datosPuerta(simulado(reglasPuerta({ produccion: codigo })).ctx, MAIN, DEV, { esperarCi: false });
      const r = evaluarPuerta(d);
      expect(r.verde).toBe(false);
      expect(resumenPuerta(r, MAIN)).toContain('bd · migraciones · FALTA');
    }
  });

  it('rojo si el checkout local no tiene las migraciones y deploy-prod.yml de lo que se publica', async () => {
    const reglas = reglasPuerta();
    reglas.unshift([/^git diff --quiet /, falla('', 1)]);
    const s = simulado(reglas);
    const r = evaluarPuerta(await datosPuerta(s.ctx, MAIN, DEV, { esperarCi: false }));
    expect(r.verde).toBe(false);
    expect(resumenPuerta(r, MAIN)).toContain('no se ha comprobado la versión que se publica');
    expect(s.lineas().some((l) => l.startsWith('npm run'))).toBe(false);
  });

  it('compara el árbol de trabajo con develop, no solo HEAD', async () => {
    const s = simulado(reglasPuerta());
    await datosPuerta(s.ctx, MAIN, DEV, { esperarCi: false });
    expect(s.lineas()).toContain(
      `git diff --quiet ${DEV} -- .github/workflows/deploy-prod.yml supabase/migrations scripts/comprobar-produccion.ts`,
    );
  });

  it('rojo si hay archivos no seguidos en lo que lee comprobar-produccion (una migración sin añadir)', async () => {
    const reglas = reglasPuerta();
    reglas.unshift([/^git ls-files --others/, ok('supabase/migrations/0041_nueva.sql')]);
    const s = simulado(reglas);
    const r = evaluarPuerta(await datosPuerta(s.ctx, MAIN, DEV, { esperarCi: false }));
    expect(r.verde).toBe(false);
    expect(s.lineas().some((l) => l.startsWith('npm run'))).toBe(false);
  });

  it('las issues bloquea-release: una salida vacía o que no es una lista cierra la puerta', async () => {
    for (const issues of ['', '{"mensaje":"x"}', 'no es json']) {
      const d = await datosPuerta(simulado(reglasPuerta({ issues })).ctx, MAIN, DEV, { esperarCi: false });
      expect(d.bloqueos).toBeNull();
      expect(evaluarPuerta(d).verde).toBe(false);
    }
  });

  it('rojo con una issue bloquea-release abierta', async () => {
    const d = await datosPuerta(simulado(reglasPuerta({ issues: '[{"number":600,"title":"Algo"}]' })).ctx, MAIN, DEV, {
      esperarCi: false,
    });
    expect(resumenPuerta(evaluarPuerta(d), MAIN)).toContain('#600 Algo');
  });

  it('espera a que la CI de main acabe', async () => {
    let n = 0;
    const reglas = reglasPuerta();
    reglas[0] = [
      new RegExp(`actions/workflows/ci\\.yml/runs\\?head_sha=${MAIN}&event=push`),
      () =>
        ok(
          JSON.stringify(
            ++n < 3
              ? { id: 1, status: 'in_progress', conclusion: null }
              : { id: 1, status: 'completed', conclusion: 'success' },
          ),
        ),
    ];
    const d = await datosPuerta(simulado(reglas).ctx, MAIN, DEV, { esperarCi: true });
    expect(d.ciMain).toBe('verde');
    expect(n).toBe(3);
  });
});

describe('esperar a los checks del PR', () => {
  const proteccion: Regla = [/protection\/required_status_checks/, ok('["ci-calidad"]')];

  it('no da por buenos los checks de la cabeza anterior', async () => {
    let vistas = 0;
    const s = simulado([
      proteccion,
      [/^gh pr view 545/, () => ok(++vistas < 3 ? VERIF : DEV)],
      [/^gh pr checks 545/, ok('[{"name":"ci-calidad","bucket":"pass"}]')],
    ]);
    await esperarChecks(s.ctx, 545, DEV, 'develop');
    expect(vistas).toBe(3);
    expect(s.lineas().filter((l) => l.startsWith('gh pr checks'))).toHaveLength(1);
  });

  it('si la cabeza del PR cambia después de verla, se para con ese motivo', async () => {
    let vistas = 0;
    const s = simulado([
      proteccion,
      [/^gh pr view 545/, () => ok(++vistas < 2 ? DEV : MAIN)],
      [/^gh pr checks 545/, ok('[{"name":"ci-calidad","bucket":"pending"}]')],
    ]);
    await expect(esperarChecks(s.ctx, 545, DEV, 'develop')).rejects.toThrow(/alguien ha empujado a la rama/);
    expect(vistas).toBe(2);
  });

  it('si el PR no llega a enseñar la cabeza esperada, se para pronto', async () => {
    const s = simulado([proteccion, [/^gh pr view 545/, ok(MAIN)]]);
    // Reloj simulado: cada espera son 4 minutos; el límite general (90 min) queda muy lejos.
    let t = 0;
    const reloj = vi.spyOn(Date, 'now').mockImplementation(() => t);
    s.ctx.limites.checks = 90 * 60_000;
    s.ctx.esperar = async () => {
      t += 4 * 60_000;
    };
    try {
      await expect(esperarChecks(s.ctx, 545, DEV, 'develop')).rejects.toThrow(/cabeza del PR #545 es ccccccc/);
      expect(t).toBe(8 * 60_000);
    } finally {
      reloj.mockRestore();
    }
  });

  it('espera a que aparezca ci-e2e aunque los demás obligatorios ya estén en verde', async () => {
    let n = 0;
    const s = simulado([
      [/branches\/develop\/protection\/required_status_checks/, ok('["ci-calidad","ci-sql","ci-e2e"]')],
      [/^gh pr view 545/, ok(DEV)],
      [
        /^gh pr checks 545/,
        () =>
          ok(
            JSON.stringify([
              { name: 'ci-calidad', bucket: 'pass' },
              { name: 'ci-sql', bucket: 'pass' },
              ...(++n < 4 ? [] : [{ name: 'ci-e2e', bucket: 'pass' }]),
            ]),
          ),
      ],
    ]);
    await esperarChecks(s.ctx, 545, DEV, 'develop');
    expect(n).toBe(4);
  });

  it('en rojo, se para', async () => {
    const s = simulado([
      proteccion,
      [/^gh pr view/, ok(DEV)],
      [/^gh pr checks/, { codigo: 1, salida: '[{"name":"ci-sql","bucket":"fail"}]', error: '' }],
    ]);
    await expect(esperarChecks(s.ctx, 545, DEV, 'develop')).rejects.toThrow(/en rojo/);
  });
});

describe('fusionar el PR', () => {
  it('reconoce el rechazo de GitHub por un check obligatorio que aún corre', () => {
    expect(checkAunCorriendo('Required status check "ci-e2e" is queued.')).toBe(true);
    expect(checkAunCorriendo('Required status checks "ci-e2e" and "ci-sql" are in progress')).toBe(true);
    expect(checkAunCorriendo('Required status check "ci-e2e" is expected.')).toBe(true);
    expect(checkAunCorriendo('Pull request is not mergeable: the merge commit cannot be cleanly created')).toBe(false);
    expect(checkAunCorriendo('Required status check "ci-e2e" has failed')).toBe(false);
  });

  it('si ci-e2e aún está en cola, espera y vuelve a intentarlo (release 0.10.0)', async () => {
    let n = 0;
    const s = simulado([
      [
        /^gh pr merge 568 .*--merge --match-head-commit/,
        () => (++n < 3 ? falla('GraphQL: Required status check "ci-e2e" is queued. (mergePullRequest)') : ok()),
      ],
    ]);
    await fusionar(s.ctx, 568, '--merge', DEV);
    expect(n).toBe(3);
  });

  it('otro fallo de la fusión se para enseguida', async () => {
    let n = 0;
    const s = simulado([
      [/^gh pr merge 568/, () => (++n, falla('Head branch was modified. Review and try the merge again.'))],
    ]);
    await expect(fusionar(s.ctx, 568, '--merge', DEV)).rejects.toThrow(/No se ha podido fusionar el PR #568/);
    expect(n).toBe(1);
  });

  it('si el check no acaba nunca, se agota la espera', async () => {
    const s = simulado([[/^gh pr merge 568/, falla('Required status check "ci-e2e" is queued.')]]);
    let t = 0;
    const reloj = vi.spyOn(Date, 'now').mockImplementation(() => t);
    s.ctx.esperar = async () => {
      t += 30_000;
    };
    try {
      await expect(fusionar(s.ctx, 568, '--merge', DEV)).rejects.toThrow(/agotado la espera: la fusión del PR #568/);
    } finally {
      reloj.mockRestore();
    }
  });
});

describe('aprobar o rechazar', () => {
  const run = { id: 77, status: 'waiting', conclusion: null, html_url: 'https://github.com/x/actions/runs/77' };
  const verde = evaluarPuerta({
    ciMain: 'verde',
    staging: { ok: true, detalle: 'ok' },
    produccion: { codigo: 0, filas: [] },
    bloqueos: [],
  });

  it('en verde: aprueba con el id del environment production y el resumen', () => {
    const s = simulado([
      [/^gh api repos\/.+\/environments\/production/, ok('22235262912')],
      [/^gh api -X POST .+\/actions\/runs\/77\/pending_deployments --input -/, ok('[]')],
    ]);
    decidir(s.ctx, run, MAIN, verde);
    const post = s.llamadas.find((l) => l.linea.includes('pending_deployments'))!;
    const cuerpo = JSON.parse(post.entrada!);
    expect(cuerpo.environment_ids).toEqual([22235262912]);
    expect(cuerpo.state).toBe('approved');
    expect(cuerpo.comment).toContain('en verde');
    expect(s.lineas().some((l) => l.startsWith('gh issue create'))).toBe(false);
  });

  it('en rojo: rechaza, abre la issue bloquea-release y termina con error', () => {
    const rojo = evaluarPuerta({
      ciMain: 'rojo',
      staging: { ok: true, detalle: 'ok' },
      produccion: { codigo: 0, filas: [] },
      bloqueos: [],
    });
    const s = simulado([
      [/^gh api repos\/.+\/environments\/production/, ok('22')],
      [/pending_deployments/, ok('[]')],
      [/^gh label create/, ok()],
      [/^gh issue create/, ok('https://github.com/x/issues/601')],
    ]);
    expect(() => decidir(s.ctx, run, MAIN, rojo)).toThrow(/en rojo/);
    expect(JSON.parse(s.llamadas.find((l) => l.linea.includes('pending_deployments'))!.entrada!).state).toBe(
      'rejected',
    );
    const issue = s.llamadas.find((l) => l.linea.startsWith('gh issue create'))!;
    expect(issue.linea).toContain(`--label ${ETIQUETA_BLOQUEO}`);
    expect(issue.entrada).toContain('NO · CI de main: rojo');
    expect(issue.entrada).toContain(run.html_url);
  });

  it('si GitHub no acepta la aprobación, se para', () => {
    const s = simulado([
      [/environments\/production/, ok('22')],
      [/pending_deployments/, falla('HTTP 422')],
    ]);
    expect(() => decidir(s.ctx, run, MAIN, verde)).toThrow(/HTTP 422/);
  });
});

describe('--solo-comprobar no cambia nada', () => {
  it('no empuja, no fusiona, no abre PR ni aprueba', async () => {
    const pr = {
      number: 545,
      title: 'chore(develop): release hidrantes-albolote 0.9.0',
      headRefName: 'release-please--branches--develop--components--hidrantes-albolote',
      headRefOid: VERIF,
      labels: [{ name: 'autorelease: pending' }],
    };
    const s = simulado(
      [
        [/^gh pr list .*--base develop/, ok(JSON.stringify([pr]))],
        [/^gh run list/, ok('[]')],
        [/protection\/required_status_checks/, ok('["ci-calidad","ci-sql","ci-e2e"]')],
        [/^gh pr checks/, falla("no checks reported on the 'x' branch")],
        [/^git fetch origin develop main/, ok()],
        [/^git rev-parse origin\/develop/, ok(DEV)],
        [/^git rev-parse origin\/main/, ok(MAIN)],
        [/^git show origin\/develop:package.json/, ok('{"version":"0.8.0"}')],
        [/^gh pr list .*--base main/, ok('[]')],
        [/^git rev-list --count/, ok('12')],
        [/actions\/workflows\/deploy-prod\.yml\/runs/, ok('null')],
        [/actions\/workflows\/deploy-staging\.yml\/runs/, ok(JSON.stringify({ id: 2, status: 'completed' }))],
        [/^curl /, ok(`<meta name="commit" content="${DEV}">`)],
        [
          /actions\/workflows\/ci\.yml\/runs/,
          ok(JSON.stringify({ id: 1, status: 'completed', conclusion: 'success' })),
        ],
        [new RegExp(`^git show ${DEV}:`), ok(`commit: ${DEV} · resultado: verde`)],
        [/^git rev-parse --verify/, ok(DEV)],
        [/^git diff --quiet /, ok()],
        [/^git ls-files --others/, ok()],
        [/^npm run --silent comprobar-produccion/, ok('')],
        [/^gh issue list/, ok('[]')],
      ],
      { soloComprobar: true },
    );
    await publicar(s.ctx);
    const prohibidas = /^(git push|git commit-tree|gh pr merge|gh pr create|gh issue create|gh label create)|-X POST/;
    expect(s.lineas().filter((l) => prohibidas.test(l))).toEqual([]);
    expect(s.lineas()).toContain(
      'gh issue list --repo aron285-coder/hidrantes-albolote --label bloquea-release --state open --json number,title',
    );
  });

  it('--hasta release se para tras el paso 1', async () => {
    const s = simulado([[/^gh pr list .*--base develop/, ok('[]')]], { soloComprobar: true, hasta: 'release' });
    await publicar(s.ctx);
    expect(s.lineas()).toHaveLength(1);
  });
});
