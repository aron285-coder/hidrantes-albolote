// Publicar una versión en producción, sin pasos a mano (docs/31 RV-139c, DEC-176). Es como se publicó
// la 0.9.0 (docs/32 RV-200), y como se publica cada versión desde entonces, la haga quien la haga:
//
//   1. release     El PR abierto de release-please: el empujón vacío que lanza su CI (DEC-079, DEC-153),
//                  con `git commit-tree` + push del sha a su rama; espera a que estén en verde **todos**
//                  los checks obligatorios de develop (uno que aún no existe no es verde) y lo fusiona
//                  con squash.
//   2. main        PR develop → main: lo abre (o usa el abierto), espera la CI y lo fusiona con
//                  **merge commit**, nunca squash (DEC-096; ci-calidad lo comprueba, RV-135).
//   3. despliegue  Espera a que la ejecución de deploy-prod.yml de ese commit pida la aprobación.
//   4. puerta      CI de main en verde; la comprobación en staging (RV-139b) en verde, y no solo por la
//                  línea escrita (docs/32 RV-205): deploy-staging.yml y ci.yml en verde con ese commit,
//                  staging sirviéndolo, y entre él y lo que se publica solo docs/** y lo que pone
//                  release-please; `npm run comprobar-produccion -- --completo` sin bloqueo; ninguna
//                  issue abierta con la etiqueta `bloquea-release`.
//   5. aprobar     Puerta en verde: aprueba el environment production (pending_deployments, approved)
//                  con el resumen. Si no: lo rechaza con el motivo y abre una issue `bloquea-release`.
//   6. paridad     Espera al final del deploy (que ya comprueba la paridad) y repite
//                  `npm run comprobar-produccion -- --completo`.
//
//   npm run publicar                         todo
//   npm run publicar -- --solo-comprobar     no empuja, no fusiona ni aprueba: dice qué haría y qué
//                                            diría la puerta ahora mismo (lanza comprobar-produccion.yml,
//                                            que solo lee, y espera unos minutos)
//   npm run publicar -- --hasta puerta       para después de ese paso (nombre o número, 1 a 6)
//
// Se puede relanzar: cada paso mira el estado real (PR ya fusionado, deploy ya aprobado…) y sigue.
// Nunca imprime valores de secretos: solo usa la sesión de gh y git del propietario (DEC-176).

import { abortar, ejecutar, ejecutarScript, errorSeguro, log, repositorio, type Resultado } from './lib/comun.ts';
import { commitDeHtml } from './paridad.ts';

/** `propietario/nombre` del checkout (git remote), no escrito a mano (docs/32 RV-208). */
const repo = () => repositorio().completo;
export const ETIQUETA_BLOQUEO = 'bloquea-release';
/** Lo escribe RV-139b; el formato del marcador está en docs/04 §12.1. */
export const ARCHIVO_STAGING = 'docs/verificacion/revision-completa-staging.md';
export const MENSAJE_EMPUJON = 'chore(release): lanzar la CI del PR de versión';
export const URL_STAGING = 'https://hidrantes-albolote-staging.pages.dev/';
/** Quien abre y escribe el PR de release-please (GITHUB_TOKEN de release-please.yml). */
export const BOT_RELEASE = 'github-actions[bot]';

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
 * comprobación (docs/32 RV-205): docs/** y lo que pone el PR de release-please. CHANGELOG.md va en el
 * bundle (Novedades): solo vale si sus líneas son las que escribió release-please (`changelogDeRelease`,
 * de `comprobarChangelog`). package.json y package-lock.json, solo en la línea de la versión.
 */
export function fueraDeLoPermitido(archivos: string[], soloVersion: boolean, changelogDeRelease = false): string[] {
  return archivos.filter((a) => {
    if (a.startsWith('docs/') || a === '.release-please-manifest.json') return false;
    if (a === 'CHANGELOG.md') return !changelogDeRelease;
    if (a === 'package.json' || a === 'package-lock.json') return !soloVersion;
    return true;
  });
}

/** Las líneas que cambian en un diff o en un `patch` de la API: con su + o su -, sin cabeceras. */
export function lineasCambiadas(diff: string): string[] {
  return diff.split(/\r?\n/).filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
}

/** `git diff -U0` de package.json y package-lock.json: ¿solo cambian líneas "version"? */
export function diffSoloDeVersion(diff: string): boolean {
  return lineasCambiadas(diff).every((l) => /^[+-]\s*"version":\s*"[^"]*",?\s*$/.test(l));
}

/**
 * ¿Son las líneas de CHANGELOG.md entre dos commits exactamente las que escribió release-please en sus
 * PR? null si sí (o si no cambia); si no, el motivo. Compara listas ordenadas, con repeticiones.
 */
export function compararChangelog(cambiadas: string[], deRelease: string[]): string | null {
  const a = [...cambiadas].sort();
  const b = [...deRelease].sort();
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      const extra = a.find((l) => !b.includes(l));
      return extra
        ? `CHANGELOG.md tiene una línea que no puso release-please: «${extra.slice(0, 80)}»`
        : 'CHANGELOG.md no tiene todas las líneas que puso release-please';
    }
  }
  return null;
}

export interface Comprobacion {
  ok: boolean;
  detalle: string;
}

export interface DatosStaging {
  marcador: Marcador | null;
  /** El commit de develop que llega a main (segundo padre del merge). */
  develop: string;
  /** El commit del marcador, resuelto a sha completo; null si no existe en el repositorio. */
  verificado: string | null;
  /** deploy-staging.yml terminó con success con el commit del marcador. */
  deployStaging: boolean;
  /** ci.yml terminó con success con el commit del marcador. */
  ci: boolean;
  /** Qué falla en lo que sirve staging (<meta name="commit">); null si sirve ese código. */
  servido: string | null;
  esAntecesor: boolean;
  /** Lo que cambia entre el marcador y develop y no debería (archivos o líneas de CHANGELOG.md). */
  fuera: string[];
}

const lista = (xs: string[]) => `${xs.slice(0, 10).join(', ')}${xs.length > 10 ? '…' : ''}`;

export function evaluarStaging(e: DatosStaging): Comprobacion {
  if (!e.marcador)
    return { ok: false, detalle: `${ARCHIVO_STAGING} no tiene ninguna línea «commit: <sha> · resultado: verde»` };
  const corto = e.marcador.commit.slice(0, 7);
  if (e.marcador.resultado !== 'verde')
    return { ok: false, detalle: `la última comprobación en staging (${corto}) está en rojo` };
  if (!e.verificado) return { ok: false, detalle: `el commit del marcador (${corto}) no está en el repositorio` };
  // RV-205: la línea sola no basta; tiene que haber pasado de verdad por la CI y por staging.
  if (!e.deployStaging)
    return { ok: false, detalle: `no hay ninguna ejecución de deploy-staging.yml en verde con ${corto}` };
  if (!e.ci) return { ok: false, detalle: `no hay ninguna ejecución de ci.yml en verde con ${corto}` };
  if (e.servido) return { ok: false, detalle: `en verde con ${corto}, pero ${e.servido}` };
  if (e.verificado === e.develop) return { ok: true, detalle: `en verde con ${corto}, el mismo commit` };
  if (!e.esAntecesor)
    return {
      ok: false,
      detalle: `en verde con ${corto}, que no está en la historia de develop (${e.develop.slice(0, 7)})`,
    };
  if (e.fuera.length) {
    return {
      ok: false,
      detalle: `en verde con ${corto}, pero desde entonces cambia lo que llega a producción: ${lista(e.fuera)}`,
    };
  }
  return {
    ok: true,
    detalle: `en verde con ${corto} (CI, deploy y staging); desde entonces solo cambian docs/** y lo de release-please`,
  };
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
          : d.produccion.codigo === 3
            ? 'no se ha comprobado la versión que se publica'
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
      detalle: !d.produccion.filas.length
        ? prod
        : d.produccion.codigo === 0
          ? `${prod} (no imprescindibles: ${d.produccion.filas.join('; ')})`
          : `${prod}: ${d.produccion.filas.join('; ')}`,
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

/**
 * `obligatorios`: los checks que exige la protección de la rama base. Uno que todavía no aparece no
 * es verde: ci-e2e no existe hasta que acaban sus partes, y en la release 0.9.0 el paso 1 dio por
 * verde la CI del PR de versión con las partes de e2e aún corriendo.
 */
export function estadoChecks(checks: { name: string; bucket: string }[], obligatorios: string[] = []): EstadoCi {
  if (!checks.length) return 'sin checks';
  if (checks.some((c) => c.bucket === 'fail' || c.bucket === 'cancel')) return 'rojo';
  if (checks.some((c) => c.bucket === 'pending')) return 'pendiente';
  if (obligatorios.some((o) => !checks.some((c) => c.name === o))) return 'pendiente';
  return 'verde';
}

/** `gh pr checks --json` sale con 1 y sin JSON si no hay checks, y con 8 si hay pendientes. */
export function leerChecks(r: Resultado, obligatorios: string[] = []): EstadoCi {
  if (r.salida.startsWith('['))
    return estadoChecks(JSON.parse(r.salida) as { name: string; bucket: string }[], obligatorios);
  if (/no (required )?checks reported/i.test([r.error, r.salida].join(' '))) return 'sin checks';
  abortar(`No se han podido leer los checks: ${errorSeguro(r.error || r.salida)}`);
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
  if (r.codigo !== 0) abortar(`${que}: ${errorSeguro(r.error || r.salida)}`);
  return JSON.parse(r.salida || 'null') as T;
}

function git(ctx: Contexto, args: string[]): Resultado {
  return ctx.ej('git', args);
}

function gitOk(ctx: Contexto, args: string[], que: string): string {
  const r = git(ctx, args);
  if (r.codigo !== 0) abortar(`${que}: ${errorSeguro(r.error || r.salida)}`);
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

/** Los checks que exige la protección de `rama` (arranque.ts los pone; ci-calidad, ci-sql y ci-e2e). */
export function checksObligatorios(ctx: Contexto, rama: string): string[] {
  const nombres = json<string[] | null>(
    ctx,
    ['api', `repos/${repo()}/branches/${rama}/protection/required_status_checks`, '--jq', '.contexts | tojson'],
    `No se ha podido leer la protección de ${rama}`,
  );
  if (!Array.isArray(nombres) || !nombres.length)
    abortar(`La protección de ${rama} no exige ningún check: revísala (scripts/arranque.ts) antes de publicar.`);
  return nombres;
}

function checksDe(ctx: Contexto, pr: number, obligatorios: string[]): EstadoCi {
  return leerChecks(
    ctx.ej('gh', ['pr', 'checks', String(pr), '--repo', repo(), '--required', '--json', 'name,bucket']),
    obligatorios,
  );
}

/**
 * Espera a los checks obligatorios **de `cabeza`**: justo después de un push, el PR aún enseña los de
 * antes. Todos los que exige la protección de `base`: uno que aún no existe no es verde.
 */
export async function esperarChecks(ctx: Contexto, pr: number, cabeza: string, base: string): Promise<void> {
  log.info(`Esperando a los checks obligatorios del PR #${pr}…`);
  const obligatorios = checksObligatorios(ctx, base);
  // Sin ningún check al cabo de un rato, no van a llegar (p. ej., una CI del bot en action_required).
  const limiteSinChecks = Date.now() + Math.min(ctx.limites.checks, 15 * 60_000);
  // Justo después de un push, el PR aún puede enseñar la cabeza anterior unos segundos. Si ya enseñó
  // `cabeza` y luego otra, o no la enseña nunca, alguien ha empujado a la rama: se para con ese motivo.
  const limiteCabeza = Date.now() + Math.min(ctx.limites.checks, 5 * 60_000);
  let vistaCabeza = false;
  const estado = await sondear(
    ctx,
    () => {
      const actual = ctx.ej('gh', [
        'pr',
        'view',
        String(pr),
        '--repo',
        repo(),
        '--json',
        'headRefOid',
        '--jq',
        '.headRefOid',
      ]);
      if (actual.codigo !== 0)
        abortar(`No se ha podido leer el PR #${pr}: ${errorSeguro(actual.error || actual.salida)}`);
      const ahora = actual.salida.trim();
      if (ahora !== cabeza) {
        if (vistaCabeza || Date.now() > limiteCabeza)
          abortar(
            `La cabeza del PR #${pr} es ${ahora.slice(0, 7)}, no ${cabeza.slice(0, 7)}: alguien ha empujado a la rama. Míralo y vuelve a lanzar npm run publicar.`,
          );
        return null;
      }
      vistaCabeza = true;
      const e = checksDe(ctx, pr, obligatorios);
      if (e === 'sin checks' && Date.now() > limiteSinChecks) {
        abortar(`El PR #${pr} sigue sin checks: ¿ha corrido su CI? Míralo en Actions.`);
      }
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
      repo(),
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
  const runs = json<{ headSha: string; conclusion: string | null }[]>(
    ctx,
    [
      'run',
      'list',
      '--repo',
      repo(),
      '--workflow',
      'ci.yml',
      '--branch',
      pr.headRefName,
      '--event',
      'pull_request',
      '-L',
      '20',
      '--json',
      'headSha,conclusion',
    ],
    'No se han podido listar las ejecuciones de la CI',
  );
  // Las del bot salen con action_required y sin ningún trabajo: no cuentan (DEC-079).
  return runs.some((r) => r.headSha === pr.headRefOid && r.conclusion !== 'action_required');
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
    const ahora = checksDe(ctx, pr.number, checksObligatorios(ctx, 'develop'));
    log.info(`Checks ahora: ${ahora}. Esperaría a que estén en verde y lo fusionaría con squash.`);
    return;
  }
  await esperarChecks(ctx, pr.number, cabeza, 'develop');
  const r = ctx.ej('gh', [
    'pr',
    'merge',
    String(pr.number),
    '--repo',
    repo(),
    '--squash',
    '--match-head-commit',
    cabeza,
  ]);
  if (r.codigo !== 0) abortar(`No se ha podido fusionar el PR #${pr.number}: ${errorSeguro(r.error || r.salida)}`);
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
      repo(),
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
        repo(),
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
    if (r.codigo !== 0) abortar(`No se ha podido abrir el PR develop → main: ${errorSeguro(r.error || r.salida)}`);
    numero = Number(/\/pull\/(\d+)/.exec(r.salida)?.[1]);
    if (!numero) abortar(`No he entendido la respuesta de gh pr create: ${r.salida}`);
    log.ok(`PR #${numero} abierto.`);
  }
  await esperarChecks(ctx, numero, develop, 'main');
  const m = ctx.ej('gh', ['pr', 'merge', String(numero), '--repo', repo(), '--merge', '--match-head-commit', develop]);
  if (m.codigo !== 0) abortar(`No se ha podido fusionar el PR #${numero}: ${errorSeguro(m.error || m.salida)}`);
  const sha = json<string | null>(
    ctx,
    ['pr', 'view', String(numero), '--repo', repo(), '--json', 'mergeCommit', '--jq', '.mergeCommit.oid | tojson'],
    'No se ha podido leer el merge commit',
  );
  if (!sha) abortar(`El PR #${numero} no tiene merge commit: ¿está en una cola de fusión? Míralo y relanza.`);
  // El merge commit lo ha creado GitHub: sin traerlo, git no conoce sus padres (paso 4).
  gitOk(ctx, ['fetch', 'origin', 'main'], 'git fetch de main');
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
      `repos/${repo()}/actions/workflows/${workflow}/runs?head_sha=${sha}&event=push&per_page=5`,
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

/** Una ejecución de `workflow` con conclusion success y ese head_sha, o null. */
export function ejecucionVerdeDe(ctx: Contexto, workflow: string, sha: string): Ejecucion | null {
  return json<Ejecucion | null>(
    ctx,
    [
      'api',
      `repos/${repo()}/actions/workflows/${workflow}/runs?head_sha=${sha}&status=success&per_page=1`,
      '--jq',
      '.workflow_runs[0] // null | tojson',
    ],
    `No se han podido leer las ejecuciones de ${workflow}`,
  );
}

/** El commit que sirve `url` en <meta name="commit">; null si no responde o no lo dice. */
export function commitServido(ctx: Contexto, url: string): string | null {
  const r = ctx.ej('curl', ['-fsS', '--max-time', '30', '-H', 'Cache-Control: no-cache', url]);
  return r.codigo === 0 ? commitDeHtml(r.salida) : null;
}

function esAntecesor(ctx: Contexto, a: string, b: string): boolean {
  const r = git(ctx, ['merge-base', '--is-ancestor', a, b]);
  if (r.codigo > 1) abortar(`git merge-base: ${errorSeguro(r.error)}`);
  return r.codigo === 0;
}

/**
 * ¿Son las líneas de CHANGELOG.md de `desde..hasta` las que puso release-please? Cada commit que lo
 * toca tiene que venir de un PR de release-please abierto por su bot, y las líneas tienen que ser las
 * de los commits del bot en ese PR: un empujón a mano a la rama del PR que cambie el texto no vale.
 */
export function comprobarChangelog(ctx: Contexto, desde: string, hasta: string): string | null {
  const cambiadas = lineasCambiadas(
    gitOk(ctx, ['diff', '-U0', desde, hasta, '--', 'CHANGELOG.md'], 'git diff de CHANGELOG.md'),
  );
  if (!cambiadas.length) return null;
  const commits = gitOk(
    ctx,
    ['log', '--format=%H', `${desde}..${hasta}`, '--', 'CHANGELOG.md'],
    'git log de CHANGELOG.md',
  )
    .split(/\s+/)
    .filter(Boolean);
  const deRelease: string[] = [];
  const vistos = new Set<number>();
  for (const commit of commits) {
    const prs = json<{ number: number; head: string; user: string }[]>(
      ctx,
      [
        'api',
        `repos/${repo()}/commits/${commit}/pulls`,
        '--jq',
        '[.[] | {number, head: .head.ref, user: .user.login}] | tojson',
      ],
      `No se ha podido leer el PR de ${commit.slice(0, 7)}`,
    );
    const pr = prs.find((p) => p.head.startsWith('release-please--') && p.user === BOT_RELEASE);
    if (!pr) return `CHANGELOG.md cambia en ${commit.slice(0, 7)}, que no viene de un PR de release-please`;
    if (vistos.has(pr.number)) continue;
    vistos.add(pr.number);
    const delPr = json<{ sha: string; autor: string | null }[]>(
      ctx,
      [
        'api',
        `repos/${repo()}/pulls/${pr.number}/commits?per_page=100`,
        '--jq',
        '[.[] | {sha, autor: .author.login}] | tojson',
      ],
      `No se han podido leer los commits del PR #${pr.number}`,
    );
    for (const c of delPr.filter((x) => x.autor === BOT_RELEASE)) {
      const archivos = json<{ filename: string; patch?: string }[]>(
        ctx,
        ['api', `repos/${repo()}/commits/${c.sha}`, '--jq', '[.files[] | {filename, patch}] | tojson'],
        `No se ha podido leer el commit ${c.sha.slice(0, 7)} del PR #${pr.number}`,
      );
      for (const a of archivos.filter((x) => x.filename === 'CHANGELOG.md'))
        deRelease.push(...lineasCambiadas(a.patch ?? ''));
    }
  }
  return compararChangelog(cambiadas, deRelease);
}

/** Lo que cambia de `desde` a `hasta` y llega a producción sin haber pasado por staging. */
export function cambiosFuera(ctx: Contexto, desde: string, hasta: string): string[] {
  const archivos = gitOk(ctx, ['diff', '--name-only', '--no-renames', desde, hasta], 'git diff')
    .split(/\r?\n/)
    .filter(Boolean);
  if (!archivos.length) return [];
  const soloVersion = diffSoloDeVersion(
    gitOk(ctx, ['diff', '-U0', desde, hasta, '--', 'package.json', 'package-lock.json'], 'git diff de la versión'),
  );
  const changelog = archivos.includes('CHANGELOG.md') ? comprobarChangelog(ctx, desde, hasta) : null;
  const fuera = fueraDeLoPermitido(archivos, soloVersion, changelog === null);
  return changelog ? [changelog, ...fuera.filter((a) => a !== 'CHANGELOG.md')] : fuera;
}

/**
 * Lo que sirve staging tiene que ser el código comprobado: el mismo commit, o uno posterior del
 * mismo camino hacia lo que se publica con solo docs/** y lo de release-please por medio. Cada
 * commit de develop se despliega en staging, también el que solo añade el registro de la comprobación.
 */
export function comprobarServido(ctx: Contexto, verificado: string, develop: string): string | null {
  const servido = commitServido(ctx, URL_STAGING);
  if (!servido) return `staging (${URL_STAGING}) no dice qué commit sirve (<meta name="commit">)`;
  const v = git(ctx, ['rev-parse', '--verify', '--quiet', `${servido}^{commit}`]);
  const completo = v.codigo === 0 ? v.salida.trim() : null;
  if (!completo) return `staging sirve ${servido.slice(0, 7)}, que no está en el repositorio`;
  if (completo === verificado) return null;
  if (!esAntecesor(ctx, verificado, completo))
    return `staging sirve ${completo.slice(0, 7)}, que no viene después del commit comprobado`;
  // develop puede avanzar mientras corre la CI de main (un parche de Dependabot, un registro): si
  // staging ya sirve algo posterior a lo que se publica, el camino de la marca a `develop` lo mira
  // comprobarStaging con cambiosFuera; aquí no hay nada más que comprobar.
  if (esAntecesor(ctx, develop, completo)) return null;
  if (!esAntecesor(ctx, completo, develop))
    return `staging sirve ${completo.slice(0, 7)}, que no está en lo que se publica (${develop.slice(0, 7)})`;
  const fuera = cambiosFuera(ctx, verificado, completo);
  return fuera.length ? `staging sirve ${completo.slice(0, 7)}, con cambios no comprobados: ${lista(fuera)}` : null;
}

export function comprobarStaging(ctx: Contexto, develop: string): Comprobacion {
  const vacio = {
    develop,
    verificado: null,
    deployStaging: false,
    ci: false,
    servido: null,
    esAntecesor: false,
    fuera: [],
  };
  const r = git(ctx, ['show', `${develop}:${ARCHIVO_STAGING}`]);
  const marcador = r.codigo === 0 ? ultimoMarcador(r.salida) : null;
  if (!marcador) return evaluarStaging({ ...vacio, marcador: null });
  const v = git(ctx, ['rev-parse', '--verify', '--quiet', `${marcador.commit}^{commit}`]);
  const verificado = v.codigo === 0 ? v.salida.trim() : null;
  if (!verificado || marcador.resultado !== 'verde') return evaluarStaging({ ...vacio, marcador, verificado });
  const datos: DatosStaging = {
    ...vacio,
    marcador,
    verificado,
    deployStaging: ejecucionVerdeDe(ctx, 'deploy-staging.yml', verificado) !== null,
    ci: ejecucionVerdeDe(ctx, 'ci.yml', verificado) !== null,
  };
  if (!datos.deployStaging || !datos.ci) return evaluarStaging(datos);
  datos.servido = comprobarServido(ctx, verificado, develop);
  if (datos.servido) return evaluarStaging(datos);
  if (verificado === develop) return evaluarStaging({ ...datos, esAntecesor: true });
  datos.esAntecesor = esAntecesor(ctx, verificado, develop);
  if (datos.esAntecesor) datos.fuera = cambiosFuera(ctx, verificado, develop);
  return evaluarStaging(datos);
}

/** Lo que comprobar-produccion lee del checkout local: tiene que ser lo de la versión que se publica. */
export const LEIDO_EN_LOCAL = [
  '.github/workflows/deploy-prod.yml',
  'supabase/migrations',
  'scripts/comprobar-produccion.ts',
];

/**
 * comprobar-produccion lee deploy-prod.yml y las migraciones del checkout local: si no son las de
 * `develop` (el commit que se publica), no comprueba lo que la versión necesita, y sale con 3.
 */
export function comprobarProduccion(ctx: Contexto, develop: string): DatosPuerta['produccion'] {
  // El árbol de trabajo (no solo HEAD) contra `develop`, y sin archivos no seguidos en esas rutas:
  // una migración sin añadir o un cambio sin commit también los leería comprobar-produccion.
  const igual = git(ctx, ['diff', '--quiet', develop, '--', ...LEIDO_EN_LOCAL]);
  const sueltos = git(ctx, ['ls-files', '--others', '--exclude-standard', '--', ...LEIDO_EN_LOCAL]);
  if (igual.codigo !== 0 || sueltos.codigo !== 0 || sueltos.salida.trim()) {
    return {
      codigo: 3,
      filas: [
        `el checkout local no tiene ${LEIDO_EN_LOCAL.join(', ')} de ${develop.slice(0, 7)}: lanza npm run publicar desde develop al día`,
      ],
    };
  }
  log.info('npm run comprobar-produccion -- --completo (lanza comprobar-produccion.yml y espera)…');
  const r = ctx.ej('npm', ['run', '--silent', 'comprobar-produccion', '--', '--completo']);
  return { codigo: r.codigo, filas: filasQueBloquean([r.salida, r.error].join('\n')) };
}

export function bloqueosAbiertos(ctx: Contexto): DatosPuerta['bloqueos'] {
  const r = ctx.ej('gh', [
    'issue',
    'list',
    '--repo',
    repo(),
    '--label',
    ETIQUETA_BLOQUEO,
    '--state',
    'open',
    '--json',
    'number,title',
  ]);
  // Cerrado ante la duda: una salida vacía o que no es una lista no dice «ninguna».
  if (r.codigo !== 0 || !r.salida.trim()) return null;
  try {
    const lista = JSON.parse(r.salida) as unknown;
    return Array.isArray(lista) ? (lista as { number: number; title: string }[]) : null;
  } catch {
    return null;
  }
}

/**
 * `ciDe`: el commit cuya CI de push cuenta (el merge en main; con --solo-comprobar, la cabeza de
 * develop). `develop`: el commit de develop que se publica (el segundo padre del merge en main).
 */
export async function datosPuerta(
  ctx: Contexto,
  ciDe: string,
  develop: string,
  { esperarCi }: { esperarCi: boolean },
): Promise<DatosPuerta> {
  const leerCi = () => estadoEjecucion(ejecucionDe(ctx, 'ci.yml', ciDe));
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
    produccion: comprobarProduccion(ctx, develop),
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
    ['api', `repos/${repo()}/environments/production`, '--jq', '.id'],
    'No se ha podido leer el environment production',
  );
}

export function decidir(ctx: Contexto, run: Ejecucion, main: string, puerta: ResultadoPuerta): void {
  const resumen = resumenPuerta(puerta, main);
  const cuerpo = cuerpoAprobacion(idProduccion(ctx), puerta.verde, resumen);
  const r = ctx.ej(
    'gh',
    ['api', '-X', 'POST', `repos/${repo()}/actions/runs/${run.id}/pending_deployments`, '--input', '-'],
    {
      entrada: cuerpo,
    },
  );
  if (r.codigo !== 0)
    abortar(
      `No se ha podido ${puerta.verde ? 'aprobar' : 'rechazar'} el despliegue: ${errorSeguro(r.error || r.salida)}`,
    );
  if (puerta.verde) {
    log.ok(`Environment production aprobado para ${main.slice(0, 7)}.`);
    return;
  }
  log.error(`Despliegue rechazado para ${main.slice(0, 7)}.`);
  const etiqueta = ctx.ej('gh', [
    'label',
    'create',
    ETIQUETA_BLOQUEO,
    '--repo',
    repo(),
    '--color',
    'B60205',
    '--description',
    'La puerta de producción no deja publicar (DEC-176)',
    '--force',
  ]);
  if (etiqueta.codigo !== 0)
    log.aviso(
      `No se ha podido crear la etiqueta ${ETIQUETA_BLOQUEO}: ${errorSeguro(etiqueta.error || etiqueta.salida)}`,
    );
  const issue = ctx.ej(
    'gh',
    [
      'issue',
      'create',
      '--repo',
      repo(),
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
  if (issue.codigo !== 0) log.error(`Tampoco se ha podido abrir la issue: ${errorSeguro(issue.error || issue.salida)}`);
  else log.info(`Issue abierta: ${issue.salida.trim()}`);
  abortar('La puerta está en rojo: producción no se ha tocado.');
}

// ---------- paso 6: final del deploy y comprobación ----------

async function pasoParidad(ctx: Contexto, run: Ejecucion, develop: string): Promise<void> {
  log.paso('6 · Final del deploy y comprobación de producción');
  const fin = await sondear(
    ctx,
    () => {
      const r = json<Ejecucion | null>(
        ctx,
        ['api', `repos/${repo()}/actions/runs/${run.id}`, '--jq', '{id, status, conclusion, html_url}'],
        'No se ha podido leer el deploy',
      );
      if (!r) abortar(`No se ha podido leer la ejecución ${run.id} de deploy-prod.yml.`);
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
  const prod = comprobarProduccion(ctx, develop);
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

  // Con --solo-comprobar, lo que se publicaría: la cabeza de develop, aunque aún no esté en main.
  const develop = o.soloComprobar
    ? gitOk(ctx, ['rev-parse', 'origin/develop'], 'git rev-parse origin/develop')
    : developDe(ctx, main);

  if (run?.status === 'in_progress' && !o.soloComprobar) {
    log.aviso('Ese deploy ya está aprobado y en marcha: esta ejecución no ha pasado la puerta. Se espera a que acabe.');
    if (llegaA(o, 'paridad')) await pasoParidad(ctx, run, develop);
    return;
  }
  if (run?.status === 'completed' && !o.soloComprobar) {
    if (run.conclusion !== 'success')
      abortar(`deploy-prod.yml de ${main.slice(0, 7)} ya terminó con ${run.conclusion}. ${run.html_url}`);
    log.aviso('Ese deploy ya terminó bien, sin pasar por esta ejecución de la puerta: no hay nada que aprobar.');
    if (llegaA(o, 'paridad')) await pasoParidad(ctx, run, develop);
    return;
  }

  log.paso(`4 · Puerta automática (DEC-176) para ${main.slice(0, 7)}`);
  const ciDe = o.soloComprobar ? develop : main;
  const puerta = evaluarPuerta(await datosPuerta(ctx, ciDe, develop, { esperarCi: !o.soloComprobar }));
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
  await pasoParidad(ctx, run, develop);
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
