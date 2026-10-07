// Publicar una versión en producción, sin pasos a mano (docs/31 RV-139c, DEC-176). Repite lo que hizo
// la release 0.9.0, para que cualquier sesión lo haga igual:
//
//   1. release     El PR abierto de release-please: el empujón vacío que lanza su CI (DEC-079, DEC-153),
//                  con `git commit-tree` + push del sha a su rama; espera la CI y lo fusiona con squash.
//   2. main        PR develop → main: lo abre (o usa el abierto), espera la CI y lo fusiona con
//                  **merge commit**, nunca squash (DEC-096; ci-calidad lo comprueba, RV-135).
//   3. despliegue  Espera a que la ejecución de deploy-prod.yml de ese commit pida la aprobación.
//   4. puerta      CI de main en verde; la comprobación en staging (RV-139b) en verde con el mismo
//                  commit de develop; `npm run comprobar-produccion -- --completo` sin bloqueo; ninguna
//                  issue abierta con la etiqueta `bloquea-release`.
//   5. aprobar     Puerta en verde: aprueba el environment production (pending_deployments, approved)
//                  con el resumen. Si no: lo rechaza con el motivo y abre una issue `bloquea-release`.
//   6. paridad     Espera al final del deploy (que ya comprueba la paridad) y repite
//                  `npm run comprobar-produccion -- --completo`.
//
//   npm run publicar                         todo
//   npm run publicar -- --solo-comprobar     no empuja, no fusiona ni aprueba: dice qué haría y qué
//                                            diría la puerta ahora mismo
//   npm run publicar -- --hasta puerta       para después de ese paso (nombre o número, 1 a 6)
//
// Se puede relanzar: cada paso mira el estado real (PR ya fusionado, deploy ya aprobado…) y sigue.
// Nunca imprime valores de secretos: solo usa la sesión de gh y git del propietario (DEC-176).

import { abortar, ejecutar, ejecutarScript, log, type Resultado } from './lib/comun.ts';

export const REPO = 'aron285-coder/hidrantes-albolote';
export const ETIQUETA_BLOQUEO = 'bloquea-release';
/** Lo escribe RV-139b; el formato del marcador está en docs/04 §12.1. */
export const ARCHIVO_STAGING = 'docs/verificacion/revision-completa-staging.md';
export const MENSAJE_EMPUJON = 'chore(release): lanzar la CI del PR de versión';

export const PASOS = ['release', 'main', 'despliegue', 'puerta', 'aprobar', 'paridad'] as const;
export type Paso = (typeof PASOS)[number];

// ---------- argumentos ----------

export interface Opciones {
  soloComprobar: boolean;
  hasta: Paso;
}

export const USO =
  'Uso: npm run publicar [-- --solo-comprobar] [-- --hasta <release|main|despliegue|puerta|aprobar|paridad|1-6>]';

/** Estricto: una opción desconocida es un error, no se ignora (una errata no debe publicar). */
export function analizarArgumentos(argv: string[]): Opciones {
  const opciones: Opciones = { soloComprobar: false, hasta: 'paridad' };
  let vistoHasta = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--solo-comprobar') {
      opciones.soloComprobar = true;
      continue;
    }
    if (a === '--hasta' || a.startsWith('--hasta=')) {
      if (vistoHasta) abortar(`--hasta repetido. ${USO}`);
      vistoHasta = true;
      const valor = a === '--hasta' ? argv[++i] : a.slice('--hasta='.length);
      if (!valor || valor.startsWith('--')) abortar(`--hasta necesita un paso. ${USO}`);
      const n = Number(valor);
      const paso = Number.isInteger(n) && n >= 1 && n <= PASOS.length ? PASOS[n - 1] : (valor as Paso);
      if (!PASOS.includes(paso)) abortar(`Paso desconocido: ${valor}. ${USO}`);
      opciones.hasta = paso;
      continue;
    }
    abortar(`Opción desconocida: ${a}. ${USO}`);
  }
  return opciones;
}

export function llegaA(opciones: Opciones, paso: Paso): boolean {
  return PASOS.indexOf(paso) <= PASOS.indexOf(opciones.hasta);
}

// ---------- la comprobación en staging (RV-139b) ----------

export interface Marcador {
  commit: string;
  resultado: 'verde' | 'rojo';
}

const RE_MARCADOR = /^\s*(?:[-*]\s*)?`?commit:\s*([0-9a-f]{7,40})\s*·\s*resultado:\s*(verde|rojo)\s*`?\s*$/i;

/** El último marcador del registro: cada comprobación añade el suyo debajo y manda el más reciente. */
export function ultimoMarcador(texto: string): Marcador | null {
  let ultimo: Marcador | null = null;
  for (const linea of texto.split(/\r?\n/)) {
    const m = RE_MARCADOR.exec(linea);
    if (m) ultimo = { commit: m[1]!.toLowerCase(), resultado: m[2]!.toLowerCase() as Marcador['resultado'] };
  }
  return ultimo;
}

/**
 * Lo que puede cambiar entre el commit comprobado en staging y el que llega a main sin repetir la
 * comprobación: documentación (incluido el propio registro) y lo que toca el PR de release-please.
 * package.json y package-lock.json, solo en la línea de la versión (`soloVersion`).
 */
export function fueraDeLoPermitido(archivos: string[], soloVersion: boolean): string[] {
  return archivos.filter((a) => {
    if (a.startsWith('docs/') || a === 'CHANGELOG.md' || a === '.release-please-manifest.json') return false;
    if (a === 'package.json' || a === 'package-lock.json') return !soloVersion;
    return true;
  });
}

/** `git diff -U0` de package.json y package-lock.json: ¿solo cambian líneas "version"? */
export function diffSoloDeVersion(diff: string): boolean {
  return diff
    .split(/\r?\n/)
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l))
    .every((l) => /^[+-]\s*"version":\s*"[^"]*",?\s*$/.test(l));
}

export interface Comprobacion {
  ok: boolean;
  detalle: string;
}

export function evaluarStaging(e: {
  marcador: Marcador | null;
  /** El commit de develop que llega a main (segundo padre del merge). */
  develop: string;
  /** El commit del marcador, resuelto a sha completo; null si no existe en el repositorio. */
  verificado: string | null;
  esAntecesor: boolean;
  archivos: string[];
  soloVersion: boolean;
}): Comprobacion {
  if (!e.marcador)
    return { ok: false, detalle: `${ARCHIVO_STAGING} no tiene ninguna línea «commit: <sha> · resultado: verde»` };
  const corto = e.marcador.commit.slice(0, 7);
  if (e.marcador.resultado !== 'verde')
    return { ok: false, detalle: `la última comprobación en staging (${corto}) está en rojo` };
  if (!e.verificado) return { ok: false, detalle: `el commit del marcador (${corto}) no está en el repositorio` };
  if (e.verificado === e.develop) return { ok: true, detalle: `en verde con ${corto}, el mismo commit` };
  if (!e.esAntecesor)
    return {
      ok: false,
      detalle: `en verde con ${corto}, que no está en la historia de develop (${e.develop.slice(0, 7)})`,
    };
  const fuera = fueraDeLoPermitido(e.archivos, e.soloVersion);
  if (fuera.length) {
    return {
      ok: false,
      detalle: `en verde con ${corto}, pero desde entonces cambian archivos que llegan a producción: ${fuera.slice(0, 10).join(', ')}${fuera.length > 10 ? '…' : ''}`,
    };
  }
  return { ok: true, detalle: `en verde con ${corto}; desde entonces solo cambian documentación y la versión` };
}

// ---------- la puerta ----------

export type EstadoCi = 'verde' | 'rojo' | 'pendiente' | 'sin checks';

export interface DatosPuerta {
  ciMain: EstadoCi;
  staging: Comprobacion;
  /** Código de `comprobar-produccion -- --completo`: 0 bien, 1 falta algo, 2 sin comprobar. */
  produccion: { codigo: number; filas: string[] };
  /** null: no se ha podido consultar (eso también cierra la puerta). */
  bloqueos: { number: number; title: string }[] | null;
}

export interface LineaPuerta {
  que: string;
  ok: boolean;
  detalle: string;
}

export interface ResultadoPuerta {
  verde: boolean;
  lineas: LineaPuerta[];
}

export function evaluarPuerta(d: DatosPuerta): ResultadoPuerta {
  const prod =
    d.produccion.codigo === 0
      ? 'nada imprescindible falta, y todo está comprobado'
      : d.produccion.codigo === 1
        ? 'falta algo imprescindible'
        : d.produccion.codigo === 2
          ? 'algo imprescindible queda sin comprobar'
          : `ha terminado con ${d.produccion.codigo}`;
  const lineas: LineaPuerta[] = [
    {
      que: 'CI de main',
      ok: d.ciMain === 'verde',
      detalle: d.ciMain === 'sin checks' ? 'no hay ejecución de la CI para este commit' : d.ciMain,
    },
    { que: 'Comprobación en staging (RV-139b)', ok: d.staging.ok, detalle: d.staging.detalle },
    {
      que: 'comprobar-produccion --completo',
      ok: d.produccion.codigo === 0,
      detalle: d.produccion.filas.length ? `${prod}: ${d.produccion.filas.join('; ')}` : prod,
    },
    {
      que: `Issues abiertas con «${ETIQUETA_BLOQUEO}»`,
      ok: d.bloqueos !== null && d.bloqueos.length === 0,
      detalle:
        d.bloqueos === null
          ? 'no se ha podido consultar'
          : d.bloqueos.length === 0
            ? 'ninguna'
            : d.bloqueos.map((b) => `#${b.number} ${b.title}`).join('; '),
    },
  ];
  return { verde: lineas.every((l) => l.ok), lineas };
}

export function resumenPuerta(r: ResultadoPuerta, sha: string): string {
  const cabecera = r.verde
    ? `Puerta automática (DEC-176) en verde para ${sha.slice(0, 7)}.`
    : `Puerta automática (DEC-176) en rojo para ${sha.slice(0, 7)}.`;
  return [cabecera, ...r.lineas.map((l) => `- ${l.ok ? 'OK' : 'NO'} · ${l.que}: ${l.detalle}`)].join('\n');
}

/** El cuerpo de POST …/pending_deployments. GitHub limita el comentario: se recorta. */
export function cuerpoAprobacion(entorno: number, verde: boolean, comentario: string): string {
  return JSON.stringify({
    environment_ids: [entorno],
    state: verde ? 'approved' : 'rejected',
    comment: comentario.length > 1000 ? `${comentario.slice(0, 997)}…` : comentario,
  });
}

// ---------- checks de un PR ----------

export function estadoChecks(checks: { name: string; bucket: string }[]): EstadoCi {
  if (!checks.length) return 'sin checks';
  if (checks.some((c) => c.bucket === 'fail' || c.bucket === 'cancel')) return 'rojo';
  if (checks.some((c) => c.bucket === 'pending')) return 'pendiente';
  return 'verde';
}

/** `gh pr checks --json` sale con 1 y sin JSON si no hay checks, y con 8 si hay pendientes. */
export function leerChecks(r: Resultado): EstadoCi {
  if (r.salida.startsWith('[')) return estadoChecks(JSON.parse(r.salida) as { name: string; bucket: string }[]);
  if (/no (required )?checks reported/i.test(`${r.error} ${r.salida}`)) return 'sin checks';
  abortar(`No se han podido leer los checks: ${r.error || r.salida}`);
}

/** Una ejecución de Actions (status/conclusion de la API) como estado de CI. */
export function estadoEjecucion(run: { status: string; conclusion: string | null } | null): EstadoCi {
  if (!run) return 'sin checks';
  if (run.status !== 'completed') return 'pendiente';
  return run.conclusion === 'success' ? 'verde' : 'rojo';
}

/** Filas de la tabla de comprobar-produccion que impiden publicar (sin colores; solo nombres). */
export function filasQueBloquean(salida: string): string[] {
  // eslint-disable-next-line no-control-regex
  const limpia = salida.replace(/\x1b\[[0-9;]*m/g, '');
  return limpia
    .split(/\r?\n/)
    .filter((l) => /\|\s*(FALTA|NO COMPROBADO)\s*\|/.test(l))
    .map((l) =>
      l
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(' · '),
    );
}

// ---------- el contexto (gh, git y npm; simulable en los tests) ----------

export type Ejecutor = (comando: string, args: string[], opciones?: { entrada?: string }) => Resultado;

export interface Contexto {
  ej: Ejecutor;
  opciones: Opciones;
  esperar: (ms: number) => Promise<void>;
  /** Cuánto se espera como mucho, por cosa (ms). */
  limites: { checks: number; despliegue: number; cada: number };
}

function json<T>(ctx: Contexto, args: string[], que: string): T {
  const r = ctx.ej('gh', args);
  if (r.codigo !== 0) abortar(`${que}: ${r.error || r.salida}`);
  return JSON.parse(r.salida || 'null') as T;
}

function git(ctx: Contexto, args: string[]): Resultado {
  return ctx.ej('git', args);
}

function gitOk(ctx: Contexto, args: string[], que: string): string {
  const r = git(ctx, args);
  if (r.codigo !== 0) abortar(`${que}: ${r.error || r.salida}`);
  return r.salida.trim();
}

async function sondear<T>(ctx: Contexto, leer: () => T | null, max: number, que: string): Promise<T> {
  const fin = Date.now() + max;
  for (;;) {
    const v = leer();
    if (v !== null) return v;
    if (Date.now() >= fin) abortar(`Se ha agotado la espera: ${que}.`);
    await ctx.esperar(ctx.limites.cada);
  }
}

function checksDe(ctx: Contexto, pr: number): EstadoCi {
  return leerChecks(ctx.ej('gh', ['pr', 'checks', String(pr), '--repo', REPO, '--required', '--json', 'name,bucket']));
}

async function esperarChecks(ctx: Contexto, pr: number): Promise<void> {
  log.info(`Esperando a los checks obligatorios del PR #${pr}…`);
  const estado = await sondear(
    ctx,
    () => {
      const e = checksDe(ctx, pr);
      return e === 'verde' || e === 'rojo' ? e : null;
    },
    ctx.limites.checks,
    `los checks del PR #${pr}`,
  );
  if (estado === 'rojo') abortar(`La CI del PR #${pr} está en rojo: arréglala y vuelve a lanzar npm run publicar.`);
  log.ok(`CI del PR #${pr} en verde.`);
}

// ---------- paso 1: el PR de release-please ----------

export interface PrRelease {
  number: number;
  title: string;
  headRefName: string;
  headRefOid: string;
}

export function localizarRelease(ctx: Contexto): PrRelease | null {
  const prs = json<(PrRelease & { labels: { name: string }[] })[]>(
    ctx,
    [
      'pr',
      'list',
      '--repo',
      REPO,
      '--base',
      'develop',
      '--state',
      'open',
      '--json',
      'number,title,headRefName,headRefOid,labels',
    ],
    'No se han podido listar los PR',
  );
  const release = prs.filter(
    (p) => p.headRefName.startsWith('release-please--') && p.labels.some((l) => l.name === 'autorelease: pending'),
  );
  if (release.length > 1)
    abortar(`Hay ${release.length} PR de release abiertos: ${release.map((p) => `#${p.number}`).join(', ')}.`);
  return release[0] ?? null;
}

/** ¿Hay ya una CI de pull_request para la cabeza del PR? Si no, hace falta el empujón (DEC-079). */
export function hayCiDePr(ctx: Contexto, pr: PrRelease): boolean {
  const runs = json<{ headSha: string }[]>(
    ctx,
    [
      'run',
      'list',
      '--repo',
      REPO,
      '--workflow',
      'ci.yml',
      '--branch',
      pr.headRefName,
      '--event',
      'pull_request',
      '-L',
      '20',
      '--json',
      'headSha',
    ],
    'No se han podido listar las ejecuciones de la CI',
  );
  return runs.some((r) => r.headSha === pr.headRefOid);
}

/** Commit vacío encima de la cabeza del PR, sin cambiar de rama, y push de ese sha a la rama. */
export function empujon(ctx: Contexto, pr: PrRelease): string {
  gitOk(ctx, ['fetch', 'origin', pr.headRefName], `git fetch de ${pr.headRefName}`);
  const cabeza = gitOk(ctx, ['rev-parse', 'FETCH_HEAD'], 'git rev-parse FETCH_HEAD');
  if (cabeza !== pr.headRefOid)
    abortar(`La rama del PR #${pr.number} ha cambiado mientras tanto: vuelve a lanzar npm run publicar.`);
  const arbol = gitOk(ctx, ['show', '-s', '--format=%T', cabeza], 'git show del árbol');
  const sha = gitOk(ctx, ['commit-tree', arbol, '-p', cabeza, '-m', MENSAJE_EMPUJON], 'git commit-tree');
  gitOk(ctx, ['push', 'origin', `${sha}:refs/heads/${pr.headRefName}`], `git push a ${pr.headRefName}`);
  return sha;
}

async function pasoRelease(ctx: Contexto): Promise<void> {
  log.paso('1 · PR de release-please');
  const pr = localizarRelease(ctx);
  if (!pr) {
    log.info('No hay PR de release abierto: nada que fusionar (ya se fusionó, o no hay cambios que publicar).');
    return;
  }
  log.info(`#${pr.number} ${pr.title} (${pr.headRefOid.slice(0, 7)})`);
  let cabeza = pr.headRefOid;
  if (hayCiDePr(ctx, pr)) log.info('Su CI de pull_request ya existe: no hace falta el empujón.');
  else if (ctx.opciones.soloComprobar)
    log.info(`Haría el empujón vacío a ${pr.headRefName} (DEC-079) para lanzar su CI.`);
  else {
    cabeza = empujon(ctx, pr);
    log.ok(`Empujón hecho: ${cabeza.slice(0, 7)} en ${pr.headRefName}.`);
  }
  if (ctx.opciones.soloComprobar) {
    log.info(`Checks ahora: ${checksDe(ctx, pr.number)}. Esperaría a que estén en verde y lo fusionaría con squash.`);
    return;
  }
  await esperarChecks(ctx, pr.number);
  const r = ctx.ej('gh', ['pr', 'merge', String(pr.number), '--repo', REPO, '--squash', '--match-head-commit', cabeza]);
  if (r.codigo !== 0) abortar(`No se ha podido fusionar el PR #${pr.number}: ${r.error || r.salida}`);
  log.ok(`PR #${pr.number} fusionado con squash en develop.`);
}

// ---------- paso 2: develop → main ----------

function versionDe(ctx: Contexto, ref: string): string {
  const r = git(ctx, ['show', `${ref}:package.json`]);
  try {
    return (JSON.parse(r.salida) as { version?: string }).version ?? '?';
  } catch {
    return '?';
  }
}

/** Devuelve el sha de main que se publica: el merge commit, o la cabeza de main si no hay nada nuevo. */
async function pasoMain(ctx: Contexto): Promise<string> {
  log.paso('2 · PR develop → main (merge commit)');
  gitOk(ctx, ['fetch', 'origin', 'develop', 'main'], 'git fetch de develop y main');
  const develop = gitOk(ctx, ['rev-parse', 'origin/develop'], 'git rev-parse origin/develop');
  const version = versionDe(ctx, 'origin/develop');
  const abiertos = json<{ number: number; headRefOid: string }[]>(
    ctx,
    [
      'pr',
      'list',
      '--repo',
      REPO,
      '--base',
      'main',
      '--head',
      'develop',
      '--state',
      'open',
      '--json',
      'number,headRefOid',
    ],
    'No se han podido listar los PR a main',
  );
  const nuevos = gitOk(ctx, ['rev-list', '--count', 'origin/main..origin/develop'], 'git rev-list');
  if (!abiertos.length && nuevos === '0') {
    const main = gitOk(ctx, ['rev-parse', 'origin/main'], 'git rev-parse origin/main');
    log.info(`main ya tiene todo develop: se sigue con ${main.slice(0, 7)}.`);
    return main;
  }
  if (ctx.opciones.soloComprobar) {
    log.info(
      abiertos.length
        ? `Usaría el PR #${abiertos[0]!.number}, esperaría su CI y lo fusionaría con --merge (${version}).`
        : `Abriría el PR develop → main con ${nuevos} commits (${version}), esperaría su CI y lo fusionaría con --merge.`,
    );
    return gitOk(ctx, ['rev-parse', 'origin/main'], 'git rev-parse origin/main');
  }
  let numero = abiertos[0]?.number;
  if (!numero) {
    const cuerpo = [
      `Pone producción al día con staging: versión ${version} (DEC-096).`,
      '',
      'Abierto por `npm run publicar` (DEC-176). Se fusiona con **merge commit**, nunca squash: ci-calidad lo comprueba (RV-135). Después, la puerta automática aprueba o rechaza el environment `production`.',
      '',
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    ].join('\n');
    const r = ctx.ej(
      'gh',
      [
        'pr',
        'create',
        '--repo',
        REPO,
        '--base',
        'main',
        '--head',
        'develop',
        '--title',
        `chore(produccion): main al día con develop (${version})`,
        '--body-file',
        '-',
      ],
      { entrada: cuerpo },
    );
    if (r.codigo !== 0) abortar(`No se ha podido abrir el PR develop → main: ${r.error || r.salida}`);
    numero = Number(/\/pull\/(\d+)/.exec(r.salida)?.[1]);
    if (!numero) abortar(`No he entendido la respuesta de gh pr create: ${r.salida}`);
    log.ok(`PR #${numero} abierto.`);
  }
  await esperarChecks(ctx, numero);
  const m = ctx.ej('gh', ['pr', 'merge', String(numero), '--repo', REPO, '--merge', '--match-head-commit', develop]);
  if (m.codigo !== 0) abortar(`No se ha podido fusionar el PR #${numero}: ${m.error || m.salida}`);
  const sha = json<string>(
    ctx,
    ['pr', 'view', String(numero), '--repo', REPO, '--json', 'mergeCommit', '--jq', '.mergeCommit.oid | tojson'],
    'No se ha podido leer el merge commit',
  );
  log.ok(`PR #${numero} fusionado con merge commit: ${sha.slice(0, 7)} en main.`);
  return sha;
}

// ---------- paso 3: el deploy esperando ----------

export interface Ejecucion {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
}

export function ejecucionDe(ctx: Contexto, workflow: string, sha: string): Ejecucion | null {
  return json<Ejecucion | null>(
    ctx,
    [
      'api',
      `repos/${REPO}/actions/workflows/${workflow}/runs?head_sha=${sha}&event=push&per_page=5`,
      '--jq',
      '.workflow_runs[0] // null | tojson',
    ],
    `No se han podido leer las ejecuciones de ${workflow}`,
  );
}

async function pasoDespliegue(ctx: Contexto, main: string): Promise<Ejecucion | null> {
  log.paso(`3 · deploy-prod.yml de ${main.slice(0, 7)}`);
  if (ctx.opciones.soloComprobar) {
    const run = ejecucionDe(ctx, 'deploy-prod.yml', main);
    log.info(
      run
        ? `La del main actual: ejecución ${run.id}, ${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}. Al publicar, esperaría la del merge nuevo.`
        : 'El main actual no tiene ejecución de deploy-prod.yml. Al publicar, esperaría la del merge nuevo.',
    );
    return run;
  }
  const run = await sondear(
    ctx,
    () => {
      const r = ejecucionDe(ctx, 'deploy-prod.yml', main);
      return r && (r.status === 'waiting' || r.status === 'completed' || r.status === 'in_progress') ? r : null;
    },
    ctx.limites.despliegue,
    'la ejecución de deploy-prod.yml',
  );
  log.info(`Ejecución ${run.id}: ${run.status}. ${run.html_url}`);
  return run;
}

// ---------- paso 4: la puerta ----------

/** El commit de develop que llega a main: segundo padre del merge; si no es un merge, el propio. */
export function developDe(ctx: Contexto, main: string): string {
  const padres = gitOk(ctx, ['show', '-s', '--format=%P', main], 'git show de los padres').split(/\s+/);
  return padres.length >= 2 ? padres[1]! : main;
}

export function comprobarStaging(ctx: Contexto, develop: string): Comprobacion {
  const r = git(ctx, ['show', `${develop}:${ARCHIVO_STAGING}`]);
  const marcador = r.codigo === 0 ? ultimoMarcador(r.salida) : null;
  if (!marcador) {
    return evaluarStaging({
      marcador: null,
      develop,
      verificado: null,
      esAntecesor: false,
      archivos: [],
      soloVersion: false,
    });
  }
  const v = git(ctx, ['rev-parse', '--verify', '--quiet', `${marcador.commit}^{commit}`]);
  const verificado = v.codigo === 0 ? v.salida.trim() : null;
  if (!verificado || verificado === develop || marcador.resultado !== 'verde') {
    return evaluarStaging({ marcador, develop, verificado, esAntecesor: false, archivos: [], soloVersion: false });
  }
  const anc = git(ctx, ['merge-base', '--is-ancestor', verificado, develop]);
  if (anc.codigo > 1) abortar(`git merge-base: ${anc.error}`);
  const archivos = gitOk(ctx, ['diff', '--name-only', verificado, develop], 'git diff').split(/\r?\n/).filter(Boolean);
  const diff = gitOk(
    ctx,
    ['diff', '-U0', verificado, develop, '--', 'package.json', 'package-lock.json'],
    'git diff de la versión',
  );
  return evaluarStaging({
    marcador,
    develop,
    verificado,
    esAntecesor: anc.codigo === 0,
    archivos,
    soloVersion: diffSoloDeVersion(diff),
  });
}

export function comprobarProduccion(ctx: Contexto): DatosPuerta['produccion'] {
  log.info('npm run comprobar-produccion -- --completo (lanza comprobar-produccion.yml y espera)…');
  const r = ctx.ej('npm', ['run', '--silent', 'comprobar-produccion', '--', '--completo']);
  return { codigo: r.codigo, filas: filasQueBloquean(`${r.salida}\n${r.error}`) };
}

export function bloqueosAbiertos(ctx: Contexto): DatosPuerta['bloqueos'] {
  const r = ctx.ej('gh', [
    'issue',
    'list',
    '--repo',
    REPO,
    '--label',
    ETIQUETA_BLOQUEO,
    '--state',
    'open',
    '--json',
    'number,title',
  ]);
  if (r.codigo !== 0) return null;
  try {
    return JSON.parse(r.salida || '[]') as { number: number; title: string }[];
  } catch {
    return null;
  }
}

/** `develop`: el commit de develop que se publica (el segundo padre del merge en main). */
export async function datosPuerta(
  ctx: Contexto,
  main: string,
  develop: string,
  { esperarCi }: { esperarCi: boolean },
): Promise<DatosPuerta> {
  const leerCi = () => estadoEjecucion(ejecucionDe(ctx, 'ci.yml', main));
  const ciMain = esperarCi
    ? await sondear(
        ctx,
        () => {
          const e = leerCi();
          return e === 'verde' || e === 'rojo' ? e : null;
        },
        ctx.limites.checks,
        'la CI de main',
      )
    : leerCi();
  return {
    ciMain,
    staging: comprobarStaging(ctx, develop),
    produccion: comprobarProduccion(ctx),
    bloqueos: bloqueosAbiertos(ctx),
  };
}

function mostrarPuerta(r: ResultadoPuerta): void {
  for (const l of r.lineas) (l.ok ? log.ok : log.error)(`${l.que}: ${l.detalle}`);
}

// ---------- paso 5: aprobar o rechazar ----------

export function idProduccion(ctx: Contexto): number {
  return json<number>(
    ctx,
    ['api', `repos/${REPO}/environments/production`, '--jq', '.id'],
    'No se ha podido leer el environment production',
  );
}

export function decidir(ctx: Contexto, run: Ejecucion, main: string, puerta: ResultadoPuerta): void {
  const resumen = resumenPuerta(puerta, main);
  const cuerpo = cuerpoAprobacion(idProduccion(ctx), puerta.verde, resumen);
  const r = ctx.ej(
    'gh',
    ['api', '-X', 'POST', `repos/${REPO}/actions/runs/${run.id}/pending_deployments`, '--input', '-'],
    {
      entrada: cuerpo,
    },
  );
  if (r.codigo !== 0)
    abortar(`No se ha podido ${puerta.verde ? 'aprobar' : 'rechazar'} el despliegue: ${r.error || r.salida}`);
  if (puerta.verde) {
    log.ok(`Environment production aprobado para ${main.slice(0, 7)}.`);
    return;
  }
  log.error(`Despliegue rechazado para ${main.slice(0, 7)}.`);
  ctx.ej('gh', [
    'label',
    'create',
    ETIQUETA_BLOQUEO,
    '--repo',
    REPO,
    '--color',
    'B60205',
    '--description',
    'La puerta de producción no deja publicar (DEC-176)',
    '--force',
  ]);
  const issue = ctx.ej(
    'gh',
    [
      'issue',
      'create',
      '--repo',
      REPO,
      '--label',
      ETIQUETA_BLOQUEO,
      '--title',
      `La puerta de producción ha parado ${main.slice(0, 7)}`,
      '--body-file',
      '-',
    ],
    {
      entrada: [
        resumen,
        '',
        `Ejecución rechazada: ${run.html_url}`,
        '',
        'Arregla lo que está en NO, cierra esta issue y vuelve a lanzar `npm run publicar` (un deploy rechazado no se reintenta solo: hace falta un commit nuevo en main, o relanzar la ejecución con `gh run rerun`). docs/04 §12.1.',
      ].join('\n'),
    },
  );
  if (issue.codigo !== 0) log.error(`Tampoco se ha podido abrir la issue: ${issue.error || issue.salida}`);
  else log.info(`Issue abierta: ${issue.salida.trim()}`);
  abortar('La puerta está en rojo: producción no se ha tocado.');
}

// ---------- paso 6: final del deploy y comprobación ----------

async function pasoParidad(ctx: Contexto, run: Ejecucion): Promise<void> {
  log.paso('6 · Final del deploy y comprobación de producción');
  const fin = await sondear(
    ctx,
    () => {
      const r = json<Ejecucion>(
        ctx,
        ['api', `repos/${REPO}/actions/runs/${run.id}`, '--jq', '{id, status, conclusion, html_url}'],
        'No se ha podido leer el deploy',
      );
      return r.status === 'completed' ? r : null;
    },
    ctx.limites.despliegue,
    'el final de deploy-prod.yml',
  );
  if (fin.conclusion !== 'success') {
    abortar(
      `deploy-prod.yml ha terminado con ${fin.conclusion}: mira «Deploy de producción fallido» y docs/15. ${fin.html_url}`,
    );
  }
  log.ok('deploy-prod.yml en verde (incluye la paridad con develop).');
  const prod = comprobarProduccion(ctx);
  if (prod.codigo !== 0)
    abortar(`comprobar-produccion ha salido con ${prod.codigo}: ${prod.filas.join('; ') || 'mira su salida'}`);
  log.ok('Producción tiene todo lo que la versión necesita.');
}

// ---------- todo ----------

export async function publicar(ctx: Contexto): Promise<void> {
  const o = ctx.opciones;
  if (o.soloComprobar) log.aviso('--solo-comprobar: no se empuja, no se fusiona y no se aprueba nada.');
  await pasoRelease(ctx);
  if (!llegaA(o, 'main')) return;
  const main = await pasoMain(ctx);
  if (!llegaA(o, 'despliegue')) return;
  const run = await pasoDespliegue(ctx, main);
  if (!llegaA(o, 'puerta')) return;

  if (run?.status === 'in_progress' && !o.soloComprobar) {
    log.info('Ese deploy ya está aprobado y en marcha: se espera a que acabe.');
    if (llegaA(o, 'paridad')) await pasoParidad(ctx, run);
    return;
  }
  if (run?.status === 'completed' && !o.soloComprobar) {
    if (run.conclusion !== 'success')
      abortar(`deploy-prod.yml de ${main.slice(0, 7)} ya terminó con ${run.conclusion}. ${run.html_url}`);
    log.info('Ese deploy ya terminó bien: no hay nada que aprobar.');
    if (llegaA(o, 'paridad')) await pasoParidad(ctx, run);
    return;
  }

  log.paso(`4 · Puerta automática (DEC-176) para ${main.slice(0, 7)}`);
  // Con --solo-comprobar, lo que se publicaría: la cabeza de develop, aunque aún no esté en main.
  const develop = o.soloComprobar
    ? gitOk(ctx, ['rev-parse', 'origin/develop'], 'git rev-parse origin/develop')
    : developDe(ctx, main);
  const puerta = evaluarPuerta(await datosPuerta(ctx, main, develop, { esperarCi: !o.soloComprobar }));
  mostrarPuerta(puerta);
  if (o.soloComprobar) {
    const accion = run?.status === 'waiting' ? `la ejecución ${run.id}` : 'el próximo deploy';
    log.info(
      `${puerta.verde ? 'Aprobaría' : 'Rechazaría'} ${accion}${puerta.verde ? '' : ' y abriría una issue bloquea-release'}.`,
    );
    return;
  }
  if (!llegaA(o, 'aprobar')) return;
  if (!run || run.status !== 'waiting')
    abortar(`deploy-prod.yml no está esperando la aprobación (${run?.status ?? 'sin ejecución'}).`);
  log.paso('5 · Aprobación del environment production');
  decidir(ctx, run, main, puerta);
  if (!llegaA(o, 'paridad')) return;
  await pasoParidad(ctx, run);
  log.ok('Publicado. Anota la versión en docs/verificacion/paridad-produccion.md §2.');
}

async function principal(): Promise<void> {
  const opciones = analizarArgumentos(process.argv.slice(2));
  const sesion = ejecutar('gh', ['auth', 'status']);
  if (sesion.codigo !== 0) abortar('Hace falta una sesión de gh: `gh auth login` (la del propietario, DEC-176).');
  await publicar({
    ej: ejecutar,
    opciones,
    esperar: (ms) => new Promise((ok) => setTimeout(ok, ms)),
    limites: { checks: 90 * 60_000, despliegue: 40 * 60_000, cada: 20_000 },
  });
}

if (import.meta.main) ejecutarScript(principal);
