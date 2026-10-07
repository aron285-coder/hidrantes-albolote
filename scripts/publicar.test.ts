import { describe, expect, it } from 'vitest';
import { ErrorDeScript, type Resultado } from './lib/comun.ts';
import {
  ARCHIVO_STAGING,
  type Contexto,
  type DatosPuerta,
  ETIQUETA_BLOQUEO,
  MENSAJE_EMPUJON,
  analizarArgumentos,
  comprobarStaging,
  cuerpoAprobacion,
  datosPuerta,
  decidir,
  diffSoloDeVersion,
  empujon,
  estadoChecks,
  estadoEjecucion,
  evaluarPuerta,
  evaluarStaging,
  filasQueBloquean,
  fueraDeLoPermitido,
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
      ),
    ).toEqual([]);
    expect(fueraDeLoPermitido(['src/main.tsx', 'docs/04.md', 'supabase/migrations/0041_x.sql'], true)).toEqual([
      'src/main.tsx',
      'supabase/migrations/0041_x.sql',
    ]);
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

  const base = { develop: DEV, verificado: VERIF, esAntecesor: true, archivos: [] as string[], soloVersion: true };

  it('verde con el mismo commit', () => {
    expect(evaluarStaging({ ...base, marcador: { commit: DEV, resultado: 'verde' }, verificado: DEV }).ok).toBe(true);
  });

  it('verde con un antecesor, si después solo cambian docs y versión', () => {
    const r = evaluarStaging({
      ...base,
      marcador: { commit: VERIF, resultado: 'verde' },
      archivos: ['CHANGELOG.md', ARCHIVO_STAGING],
    });
    expect(r.ok).toBe(true);
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
      archivos: ['functions/api/push.ts'],
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
  function reglasPuerta({
    marcador = `commit: ${VERIF} · resultado: verde`,
    diff = ['CHANGELOG.md', 'package.json', ARCHIVO_STAGING].join('\n'),
    diffVersion = '-  "version": "0.8.0",\n+  "version": "0.9.0",',
    produccion = 0,
    issues = '[]',
    ci = { status: 'completed', conclusion: 'success' },
  } = {}): Regla[] {
    return [
      [/actions\/workflows\/ci\.yml\/runs/, ok(JSON.stringify({ id: 1, html_url: 'u', ...ci }))],
      [/^git show -s --format=%P/, ok(`${'f'.repeat(40)} ${DEV}`)],
      [new RegExp(`^git show ${DEV}:${ARCHIVO_STAGING}`), ok(marcador)],
      [/^git rev-parse --verify/, ok(VERIF)],
      [/^git merge-base --is-ancestor/, ok()],
      [/^git diff --name-only/, ok(diff)],
      [/^git diff -U0/, ok(diffVersion)],
      [
        /^npm run --silent comprobar-produccion -- --completo/,
        { codigo: produccion, salida: '| bd | migraciones | FALTA | x |', error: '' },
      ],
      [/^gh issue list/, ok(issues)],
    ];
  }

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
      /actions\/workflows\/ci\.yml\/runs/,
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
        [/^gh pr checks/, falla("no checks reported on the 'x' branch")],
        [/^git fetch origin develop main/, ok()],
        [/^git rev-parse origin\/develop/, ok(DEV)],
        [/^git rev-parse origin\/main/, ok(MAIN)],
        [/^git show origin\/develop:package.json/, ok('{"version":"0.8.0"}')],
        [/^gh pr list .*--base main/, ok('[]')],
        [/^git rev-list --count/, ok('12')],
        [/actions\/workflows\/deploy-prod\.yml\/runs/, ok('null')],
        [
          /actions\/workflows\/ci\.yml\/runs/,
          ok(JSON.stringify({ id: 1, status: 'completed', conclusion: 'success' })),
        ],
        [new RegExp(`^git show ${DEV}:`), ok(`commit: ${DEV} · resultado: verde`)],
        [/^git rev-parse --verify/, ok(DEV)],
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
