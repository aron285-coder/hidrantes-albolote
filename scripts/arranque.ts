// Arranque en un comando (04 §11, 09 Fase 0). Idempotente: se puede repetir sin romper nada.
//
//   npm run arranque                       todo (repositorio, Supabase, Cloudflare, secretos, issues)
//   npm run arranque -- --local            solo el entorno local: .env.local + rol en Supabase local
//   npm run arranque -- --rotar <qué>      db | cloudflare | sal-ip | vapid | gpg | vigilancia | todo
//   npm run arranque -- --solo-faltantes   pone lo que falta sin rotar nada, con las sesiones de gh
//                                          y wrangler (docs/19 P-01, RV-52)
//
// Pide a mano solo lo que ninguna API devuelve: token de Cloudflare, token de acceso de Supabase
// (Management API) y las contraseñas de `postgres` de dev y prod. Nada de eso se guarda en disco:
// la contraseña de `postgres` solo sirve para crear el rol hidrantes_migrador (DEC-052).

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { claveAleatoria, parGpg, paresVapid, salAleatoria } from './lib/claves.ts';
import {
  RAIZ,
  abortar,
  argumentos,
  confirmar,
  ejecutar,
  ejecutarOk,
  ejecutarScript,
  errorSeguro,
  log,
  preguntar,
  psql,
  psqlOk,
} from './lib/comun.ts';
import {
  Cloudflare,
  SupabaseGestion,
  asegurarBucket,
  elegirClaves,
  gh,
  ghApi,
  ghApiOpcional,
} from './lib/servicios.ts';
import { crearIssues } from './crear-issues.ts';
import { prepararLocal } from './migrar.ts';

// ---------- nombres fijos (DEC-045, CLAUDE.md §7) ----------

const PROPIETARIO = 'aron285-coder';
const REPO = `${PROPIETARIO}/hidrantes-albolote`;
const CHECKS_OBLIGATORIOS = ['ci-calidad', 'ci-sql', 'ci-e2e'];

interface Entorno {
  clave: 'staging' | 'production';
  entornoApp: 'staging' | 'produccion';
  rama: 'develop' | 'main';
  proyectoSupabase: string;
  proyectoPages: string;
  bucket: string;
}

export const ENTORNOS: Entorno[] = [
  {
    clave: 'staging',
    entornoApp: 'staging',
    rama: 'develop',
    proyectoSupabase: 'uniformidad-dev',
    proyectoPages: 'hidrantes-albolote-staging',
    bucket: 'hidrantes-fotos-dev',
  },
  {
    clave: 'production',
    entornoApp: 'produccion',
    rama: 'main',
    proyectoSupabase: 'uniformidad-prod',
    proyectoPages: 'hidrantes-albolote',
    bucket: 'hidrantes-fotos',
  },
];

export const ROTABLES = ['db', 'cloudflare', 'sal-ip', 'vapid', 'gpg', 'vigilancia'] as const;
export type Rotable = (typeof ROTABLES)[number];

/**
 * `--rotar db`, `--rotar db,gpg` o `--rotar todo`. Se admite la lista porque rehacer los secretos de
 * los trabajos automáticos (DEC-071) necesita la base de datos y la clave GPG a la vez, y rotarlo
 * todo cambiaría de paso las claves VAPID, que dejarían sin avisos a los móviles ya suscritos.
 */
export function aRotar(pedida: string | undefined): Set<Rotable> {
  if (!pedida) return new Set();
  if (pedida === 'todo') return new Set(ROTABLES);
  const partes = pedida.split(',').map((p) => p.trim());
  for (const p of partes) {
    if (!(ROTABLES as readonly string[]).includes(p)) {
      abortar(`--rotar ${p} no existe. Opciones: ${ROTABLES.join(', ')}, todo (o varias separadas por comas)`);
    }
  }
  return new Set(partes as Rotable[]);
}

// ---------- 1. sesiones y credenciales ----------

function comprobarSesiones(): void {
  log.paso('1. Sesiones de línea de comandos');
  const comprobaciones: [string, string[], string][] = [
    ['gh', ['auth', 'status'], 'gh auth login'],
    ['npx', ['--no-install', 'wrangler', 'whoami'], 'npx wrangler login'],
  ];
  for (const [cmd, args, login] of comprobaciones) {
    const r = ejecutar(cmd, args);
    if (r.codigo !== 0 || /not authenticated/i.test(r.salida + r.error)) {
      abortar(`Falta la sesión de ${cmd === 'npx' ? 'wrangler' : cmd}. Ejecuta: ${login}`);
    }
    log.ok(cmd === 'npx' ? 'wrangler' : cmd);
  }
  if (ejecutar('git', ['config', 'user.name']).salida !== PROPIETARIO) {
    abortar(`git user.name debe ser ${PROPIETARIO} en este repositorio.`);
  }
  log.ok(`git como ${PROPIETARIO}`);
}

async function pedirCredenciales(necesitaBd: boolean) {
  log.paso('Credenciales (no se muestran al escribir y no se guardan en disco)');
  const tokenCf = process.env.CLOUDFLARE_API_TOKEN || (await preguntar('Token de API de Cloudflare', { oculto: true }));
  const cloudflare = new Cloudflare(tokenCf);
  await cloudflare.verificarToken();
  log.ok('token de Cloudflare válido');

  log.info('Token de acceso de Supabase: https://supabase.com/dashboard/account/tokens (puedes borrarlo al terminar)');
  const supabase = new SupabaseGestion(
    process.env.SUPABASE_ACCESS_TOKEN || (await preguntar('Token de acceso de Supabase', { oculto: true })),
  );
  const proyectos = await supabase.proyectos();
  log.ok(`token de Supabase válido (${proyectos.length} proyectos)`);

  const clavesPostgres = new Map<string, string>();
  if (necesitaBd) {
    for (const e of ENTORNOS) {
      clavesPostgres.set(e.clave, await preguntar(`Contraseña de postgres de ${e.proyectoSupabase}`, { oculto: true }));
    }
  }
  return { tokenCf, cloudflare, cuentaCf: await cloudflare.cuenta(), supabase, proyectos, clavesPostgres };
}

// ---------- 2. repositorio GitHub ----------

function asegurarRepositorio(): void {
  log.paso('2. Repositorio GitHub');
  if (ejecutar('git', ['rev-parse', '--verify', 'main']).codigo !== 0) {
    abortar('No hay commits en main. Haz el primer commit antes del arranque.');
  }
  if (!ghApiOpcional(`repos/${REPO}`)) {
    // Público: GitHub Free no ofrece protección de ramas ni environments en privados (DEC-053).
    gh([
      'repo',
      'create',
      REPO,
      '--public',
      '--source',
      RAIZ,
      '--remote',
      'origin',
      '--description',
      'Mapa de hidrantes y bocas de riego · Protección Civil de Albolote',
    ]);
    log.ok(`creado ${REPO} (público)`);
  } else {
    log.ok(`${REPO} ya existe`);
  }
  if (ejecutar('git', ['remote', 'get-url', 'origin']).codigo !== 0) {
    ejecutarOk('git', ['remote', 'add', 'origin', `https://github.com/${REPO}.git`]);
  }
  if (ejecutar('git', ['rev-parse', '--verify', 'develop']).codigo !== 0)
    ejecutarOk('git', ['branch', 'develop', 'main']);
  for (const rama of ['main', 'develop']) {
    if (!ghApiOpcional(`repos/${REPO}/branches/${rama}`)) {
      ejecutarOk('git', ['push', '-u', 'origin', rama]);
      log.ok(`rama ${rama} subida`);
    }
  }

  ghApi(`repos/${REPO}`, 'PATCH', {
    default_branch: 'develop',
    has_wiki: false,
    has_projects: false,
    allow_auto_merge: true,
    delete_branch_on_merge: true,
    allow_squash_merge: true,
    allow_merge_commit: true,
    allow_rebase_merge: false,
    security_and_analysis: {
      secret_scanning: { status: 'enabled' },
      secret_scanning_push_protection: { status: 'enabled' },
    },
  });
  ghApi(`repos/${REPO}/vulnerability-alerts`, 'PUT');
  ghApi(`repos/${REPO}/actions/permissions/workflow`, 'PUT', {
    default_workflow_permissions: 'read',
    // Necesario para que release-please pueda abrir su PR (el nombre de la API engaña: crea y aprueba).
    can_approve_pull_request_reviews: true,
  });
  log.ok('ajustes: rama por defecto develop, auto-merge, escaneo de secretos, alertas de Dependabot');

  for (const rama of ['main', 'develop']) {
    ghApi(`repos/${REPO}/branches/${rama}/protection`, 'PUT', {
      required_status_checks: { strict: false, contexts: CHECKS_OBLIGATORIOS },
      enforce_admins: true,
      required_pull_request_reviews: { required_approving_review_count: 0, dismiss_stale_reviews: false },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false,
      required_linear_history: false,
    });
  }
  log.ok('protección de main y develop: solo PR, CI verde, sin force push ni borrado');

  const idPropietario = Number(ghApi(`users/${PROPIETARIO}`).match(/"id":\s*(\d+)/)?.[1]);
  for (const e of ENTORNOS) {
    ghApi(`repos/${REPO}/environments/${e.clave}`, 'PUT', {
      ...(e.clave === 'production'
        ? { reviewers: [{ type: 'User', id: idPropietario }], prevent_self_review: false }
        : {}),
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    });
    const politicas = ghApi(`repos/${REPO}/environments/${e.clave}/deployment-branch-policies`);
    if (!politicas.includes(`"name":"${e.rama}"`)) {
      ghApi(`repos/${REPO}/environments/${e.clave}/deployment-branch-policies`, 'POST', {
        name: e.rama,
        type: 'branch',
      });
    }
  }
  log.ok('environments: staging (develop) y production (main, con tu aprobación)');

  const etiquetas: [string, string, string][] = [
    ...Array.from({ length: 10 }, (_, n): [string, string, string] => [`fase-${n}`, '1D3A63', `Fase ${n} de 09`]),
    ['alcance', 'B08A2E', 'Desacuerdo de alcance: va a 12 antes de tocar código'],
    ['vigilancia', 'DD5A1F', 'Abierta por vigilancia.yml'],
    ['defecto', '9C2B1E', 'Error del software (no confundir con el estado "no funciona")'],
    ['piloto', '2E7D4F', 'Surgido en el piloto'],
  ];
  const existentes = gh([
    'label',
    'list',
    '--repo',
    REPO,
    '--limit',
    '200',
    '--json',
    'name',
    '--jq',
    '.[].name',
  ]).split('\n');
  for (const [nombre, color, descripcion] of etiquetas) {
    if (!existentes.includes(nombre)) {
      gh(['label', 'create', nombre, '--repo', REPO, '--color', color, '--description', descripcion]);
    }
  }
  const hitos = ghApi(`repos/${REPO}/milestones?state=all&per_page=100`);
  for (let n = 0; n <= 9; n++) {
    if (!hitos.includes(`"title":"Fase ${n}"`)) ghApi(`repos/${REPO}/milestones`, 'POST', { title: `Fase ${n}` });
  }
  log.ok('etiquetas y milestones de las fases');
}

// ---------- 3–4. Supabase ----------

/**
 * El pooler (Supavisor) guarda en caché las credenciales de cada rol: justo después de cambiar la
 * contraseña de hidrantes_migrador sigue esperando la anterior durante un rato. Se reintenta hasta
 * tres minutos antes de darlo por fallido.
 */
async function esperarConexion(url: string, maxSegundos = 180): Promise<string> {
  const inicio = Date.now();
  let avisado = false;
  for (;;) {
    const r = psql(url, 'select current_user;', { tuplas: true });
    if (r.codigo === 0) return r.salida;
    const esCache = /password authentication failed/i.test(r.error);
    if (!esCache || Date.now() - inicio > maxSegundos * 1000)
      abortar(`psql falló:\n${errorSeguro(r.error || r.salida)}`);
    if (!avisado) {
      log.info('el pooler aún no conoce la contraseña nueva; reintentando (hasta 3 min)…');
      avisado = true;
    }
    await new Promise((ok) => setTimeout(ok, 10_000));
  }
}

interface DatosSupabase {
  ref: string;
  url: string;
  anon: string;
  servicio: string;
  urlMigrador?: string;
}

async function prepararSupabase(
  cred: Awaited<ReturnType<typeof pedirCredenciales>>,
  e: Entorno,
  rotarDb: boolean,
): Promise<DatosSupabase> {
  log.paso(`3. Supabase · ${e.proyectoSupabase} (${e.clave})`);
  const p = cred.proyectos.find((x) => x.name === e.proyectoSupabase);
  if (!p) abortar(`No encuentro el proyecto ${e.proyectoSupabase} en tu cuenta de Supabase.`);
  if (p.status !== 'ACTIVE_HEALTHY') {
    abortar(`${e.proyectoSupabase} está ${p.status}. Si está en pausa, restáuralo en el panel de Supabase y repite.`);
  }
  const ref = p.ref ?? p.id;
  const url = `https://${ref}.supabase.co`;
  const { anon, servicio } = elegirClaves(await cred.supabase.claves(ref));
  log.ok(`proyecto ${ref}`);

  let urlMigrador: string | undefined;
  if (rotarDb) {
    const host = await cred.supabase.hostPooler(ref);
    const clavePostgres = cred.clavesPostgres.get(e.clave)!;
    const urlPostgres = `postgresql://postgres.${ref}:${encodeURIComponent(clavePostgres)}@${host}:5432/postgres`;
    if (psql(urlPostgres, 'select 1;').codigo !== 0)
      abortar(`La contraseña de postgres de ${e.proyectoSupabase} no es correcta.`);

    const teniaPostgis =
      psqlOk(urlPostgres, "select count(*) from pg_extension where extname = 'postgis';", {
        tuplas: true,
      }) === '1';
    const claveMigrador = claveAleatoria();
    const bootstrap = readFileSync(path.join(RAIZ, 'supabase', 'sql', 'arranque-bd.sql'), 'utf8');
    psqlOk(urlPostgres, `\\set clave '${claveMigrador}'\n${bootstrap}`);
    log.ok('extensiones, esquema hidrantes y rol hidrantes_migrador (DEC-052)');

    urlMigrador = `postgresql://hidrantes_migrador.${ref}:${claveMigrador}@${host}:5432/postgres`;
    const quien = await esperarConexion(urlMigrador);
    if (quien !== 'hidrantes_migrador') abortar(`El pooler conecta como ${quien}, no como hidrantes_migrador.`);
    ejecutarOk('npx', ['--no-install', 'tsx', 'scripts/migrar.ts'], { env: { SUPABASE_DB_URL: urlMigrador } });
    log.ok('historial de migraciones listo; conexión por el pooler como hidrantes_migrador');

    if (!teniaPostgis && e.clave === 'staging') {
      log.aviso('PostGIS se acaba de activar en dev (04 §5). Comprueba que la app de uniformidad sigue bien en dev.');
      if (!(await confirmar('¿Uniformidad sigue funcionando en dev? (si no, se detiene aquí sin tocar prod)'))) {
        abortar('Detenido antes de producción. Revisa uniformidad en dev y vuelve a lanzar el arranque.');
      }
    }
  }

  if (await cred.supabase.anadirEsquemaExpuesto(ref, 'hidrantes')) log.ok('esquema hidrantes expuesto en la API');
  else log.ok('esquema hidrantes ya expuesto en la API');

  const pages = `https://${e.proyectoPages}.pages.dev`;
  const redirecciones = [`${pages}/**`];
  if (e.clave === 'staging')
    redirecciones.push(`https://*.${e.proyectoPages}.pages.dev/**`, 'http://localhost:5173/**');
  const nuevas = await cred.supabase.anadirRedirecciones(ref, redirecciones);
  log.ok(nuevas.length ? `redirecciones de Auth añadidas: ${nuevas.join(', ')}` : 'redirecciones de Auth ya presentes');

  log.ok(
    `bucket ${e.bucket} ${await asegurarBucket(url, servicio, e.bucket)} (5 MB, jpeg/webp, sin escritura para anon)`,
  );
  return { ref, url, anon, servicio, urlMigrador };
}

// ---------- 5. Cloudflare Pages ----------

async function prepararPages(
  cred: Awaited<ReturnType<typeof pedirCredenciales>>,
  e: Entorno,
  sb: DatosSupabase,
  rotar: Set<Rotable>,
): Promise<{ vapidPublica?: string; vigilancia?: string; escribir: () => Promise<void> }> {
  log.paso(`5. Cloudflare Pages · ${e.proyectoPages}`);
  let proyecto = await cred.cloudflare.proyecto(cred.cuentaCf, e.proyectoPages);
  if (!proyecto) {
    await cred.cloudflare.crearProyecto(cred.cuentaCf, e.proyectoPages, e.rama);
    proyecto = await cred.cloudflare.proyecto(cred.cuentaCf, e.proyectoPages);
    log.ok(`creado (rama de producción: ${e.rama})`);
  } else {
    log.ok('ya existe');
  }
  const actuales = Object.keys(proyecto?.deployment_configs?.production?.env_vars ?? {});
  const pages = `https://${e.proyectoPages}.pages.dev`;

  const secretos: Record<string, string> = {
    SUPABASE_URL: sb.url,
    SUPABASE_SERVICE_ROLE_KEY: sb.servicio,
    // Nominatim exige contacto (RV-25): la URL del repositorio, nunca un correo (DEC-053).
    NOMINATIM_USER_AGENT: `hidrantes-albolote/1.0 (+https://github.com/${REPO})`,
    VAPID_SUBJECT: pages,
  };
  if (!actuales.includes('SAL_IP') || rotar.has('sal-ip')) secretos.SAL_IP = salAleatoria();
  let vapidPublica: string | undefined;
  if (!actuales.includes('VAPID_PRIVATE_KEY') || rotar.has('vapid')) {
    const par = paresVapid();
    secretos.VAPID_PRIVATE_KEY = par.privada;
    // /api/push firma con las dos: WebCrypto no deduce la pública de la privada (DEC-059)
    secretos.VAPID_PUBLIC_KEY = par.publica;
    vapidPublica = par.publica;
  }
  // Secreto compartido con avisos.yml y vigilancia.yml para llamar a /api/push (RV-08). Vive en
  // Pages y, con el mismo valor, en un secreto del repositorio (sin environment, DEC-071). El de
  // Pages no se puede leer: si falta el del repositorio, se hacen los dos de nuevo.
  let vigilancia: string | undefined;
  if (
    !actuales.includes('VIGILANCIA_SECRETO') ||
    rotar.has('vigilancia') ||
    !existeSecretoRepo(`VIGILANCIA_SECRETO_${sufijoDe(e)}`)
  ) {
    vigilancia = salAleatoria();
    secretos.VIGILANCIA_SECRETO = vigilancia;
  }
  // Se escribe después, y con un secreto de vigilancia nuevo, tras el Worker (docs/20 RV-72).
  const escribir = async () => {
    await cred.cloudflare.fijarSecretos(cred.cuentaCf, e.proyectoPages, secretos);
    log.ok(`variables cifradas: ${Object.keys(secretos).join(', ')}`);
    aplicarSecretosPages(e);
    log.info('GITHUB_DISPATCH_TOKEN se añade en la Fase 7, cuando exista /api/lanzar-workflow (DEC-053).');
  };
  return { vapidPublica, vigilancia, escribir };
}

/** Sufijo de los secretos y variables de repositorio que no pueden ir en un environment (DEC-071). */
export const sufijoDe = (e: Pick<Entorno, 'clave'>) => (e.clave === 'staging' ? 'STAGING' : 'PROD');

// ---------- 6–8. GPG y secretos de GitHub ----------

function fijarSecreto(nombre: string, valor: string, entorno?: string): void {
  const args = ['secret', 'set', nombre, '--repo', REPO];
  if (entorno) args.push('--env', entorno);
  gh(args, valor);
}

function fijarVariable(nombre: string, valor: string, entorno?: string): void {
  const args = ['variable', 'set', nombre, '--repo', REPO, '--body', valor];
  if (entorno) args.push('--env', entorno);
  gh(args);
}

function existeSecreto(nombre: string, entorno: string): boolean {
  return gh(['secret', 'list', '--repo', REPO, '--env', entorno, '--json', 'name', '--jq', '.[].name'])
    .split('\n')
    .includes(nombre);
}

function existeSecretoRepo(nombre: string): boolean {
  return gh(['secret', 'list', '--repo', REPO, '--json', 'name', '--jq', '.[].name']).split('\n').includes(nombre);
}

async function prepararGpg(rotar: boolean): Promise<string | null> {
  log.paso('6. Clave GPG de los respaldos');
  if (existeSecreto('GPG_PUBLIC_KEY', 'production') && !rotar) {
    log.ok('ya existe (usa --rotar gpg para cambiarla)');
    // La pública no se puede recuperar de un secreto de GitHub, así que si falta la del repositorio
    // —la que usa respaldo.yml, DEC-071— hay que generar otro par.
    if (!existeSecretoRepo('GPG_PUBLIC_KEY')) {
      log.aviso('Falta GPG_PUBLIC_KEY en el repositorio: sin ella no hay respaldo. Vuelve con --rotar gpg.');
    }
    return null;
  }
  const { publica, privada, huella } = await parGpg();
  fijarSecreto('GPG_PUBLIC_KEY', publica, 'production');
  // También en el repositorio: respaldo.yml corre por calendario y no puede usar un entorno con
  // aprobación humana (DEC-071). Es una clave pública: no revela nada.
  fijarSecreto('GPG_PUBLIC_KEY', publica);
  console.log('\n\x1b[33m' + '═'.repeat(72));
  console.log(' CLAVE PRIVADA DE LOS RESPALDOS · se muestra UNA sola vez');
  console.log(' Guárdala ahora en el gestor de contraseñas o en el sobre de la agrupación (15 §2).');
  console.log(' Sin ella, los respaldos no se pueden descifrar. No la pegues en ningún chat.');
  console.log('═'.repeat(72) + '\x1b[0m\n');
  console.log(privada);
  await preguntar('Pulsa Enter cuando la hayas guardado');
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); // limpia la pantalla y el historial de la consola
  log.ok(`clave pública subida · huella ${huella}`);
  return huella;
}

function secretosGithub(
  e: Entorno,
  sb: DatosSupabase,
  cuentaCf: string,
  tokenCf: string | null,
  vapidPublica?: string,
  vigilancia?: string,
) {
  log.paso(`7. Secretos y variables de GitHub · ${e.clave}`);
  if (sb.urlMigrador) fijarSecreto('SUPABASE_DB_URL', sb.urlMigrador, e.clave);
  fijarSecreto('SUPABASE_URL', sb.url, e.clave);
  fijarSecreto('SUPABASE_SERVICE_ROLE_KEY', sb.servicio, e.clave);
  if (tokenCf) fijarSecreto('CLOUDFLARE_API_TOKEN', tokenCf, e.clave);
  fijarSecreto('CLOUDFLARE_ACCOUNT_ID', cuentaCf, e.clave);

  fijarVariable('VITE_ENTORNO', e.entornoApp, e.clave);
  fijarVariable('VITE_SUPABASE_URL', sb.url, e.clave);
  fijarVariable('VITE_SUPABASE_ANON_KEY', sb.anon, e.clave);
  fijarVariable('PAGES_PROYECTO', e.proyectoPages, e.clave);
  fijarVariable('SUPABASE_PROJECT_REF', sb.ref, e.clave);
  if (vapidPublica) fijarVariable('VITE_VAPID_PUBLIC_KEY', vapidPublica, e.clave);

  // Para mantener-activo.yml: sin environment, porque production exige aprobación en cada ejecución.
  // La URL y la anon key son públicas por diseño (04 §1).
  const sufijo = sufijoDe(e);
  fijarVariable(`SUPABASE_URL_${sufijo}`, sb.url);
  fijarVariable(`SUPABASE_ANON_KEY_${sufijo}`, sb.anon);

  // Por el mismo motivo, respaldo.yml necesita en el repositorio lo que el entorno `production`
  // guarda tras una aprobación humana (DEC-071). Y `promover-piloto.yml` necesita los dos lados a
  // la vez —lee de staging y escribe en producción—, y un trabajo solo puede llevar un environment,
  // así que también los de staging viven en el repositorio (DEC-078).
  if (sb.urlMigrador) fijarSecreto(`SUPABASE_DB_URL_${sufijo}`, sb.urlMigrador);
  fijarSecreto(`SUPABASE_SERVICE_ROLE_KEY_${sufijo}`, sb.servicio);
  // avisos.yml llama a /api/push cada 15 minutos con este secreto (RV-08).
  if (vigilancia) fijarSecreto(`VIGILANCIA_SECRETO_${sufijo}`, vigilancia);
  if (!sb.urlMigrador && !existeSecretoRepo(`SUPABASE_DB_URL_${sufijo}`)) {
    log.aviso(`Falta SUPABASE_DB_URL_${sufijo}: vuelve a lanzarlo con --rotar db (DEC-071).`);
  }
  log.ok('hecho');
}

// ---------- 8b. propietario como administrador ----------

/**
 * El correo del propietario no puede ir en una migración (repositorio público, DEC-053): se guarda
 * como secreto y asegurar-propietario.ts lo da de alta en cada despliegue si falta.
 */
async function asegurarSecretoPropietario(): Promise<void> {
  log.paso('8b. Propietario como administrador');
  const existe = gh(['secret', 'list', '--repo', REPO, '--json', 'name', '--jq', '.[].name'])
    .split('\n')
    .includes('PROPIETARIO_EMAIL');
  if (existe && !(await confirmar('PROPIETARIO_EMAIL ya existe. ¿Cambiarlo?'))) {
    log.ok('se mantiene');
    return;
  }
  const porDefecto = ejecutar('git', ['config', 'user.email']).salida;
  const r = await preguntar(`Correo de Google con el que entrarás al panel [${porDefecto}]`);
  const email = (r || porDefecto).trim().toLowerCase();
  if (!/^[^@\s']+@[^@\s']+\.[^@\s']+$/.test(email)) abortar('Eso no parece un correo.');
  fijarSecreto('PROPIETARIO_EMAIL', email);
  log.ok('guardado como secreto; se da de alta en el próximo despliegue');
}

// ---------- 9. skills, 10. issues, 11. docs/entornos.md ----------

async function instalarSkills(): Promise<void> {
  log.paso('9. Skills de Claude Code (04 §15)');
  if (!(await confirmar('¿Instalar los skills oficiales (supabase, cloudflare, anthropics) en .claude/skills?'))) {
    log.aviso('Saltado. Se pueden instalar después repitiendo el arranque.');
    return;
  }
  const r = ejecutar(
    'npx',
    ['--yes', 'skills', 'add', 'supabase/agent-skills', 'cloudflare/skills', 'anthropics/skills'],
    {
      heredar: true,
    },
  );
  if (r.codigo === 0) log.ok('instalados');
  else log.aviso('No se pudieron instalar; no bloquea el arranque. Repite más tarde.');
  log.info('task-shaper es de la organización: su plantilla ya está en .github/ISSUE_TEMPLATE/tarea.md.');
}

/**
 * Pages aplica sus secretos solo a los despliegues **nuevos**; el del repositorio vale al momento.
 * Tras rotar VIGILANCIA_SECRETO, avisos.yml recibía 401 cada 15 minutos hasta el siguiente
 * despliegue (docs/18 RV-38). Staging se vuelve a desplegar ahora; producción exige la aprobación
 * del environment y solo se despliega por PR develop → main, así que se dice el paso.
 */
export function pasoTrasSecretosPages(e: { clave: 'staging' | 'production' }): { comando?: string[]; aviso: string } {
  if (e.clave === 'staging') {
    return {
      comando: ['workflow', 'run', 'Desplegar staging', '--ref', 'develop'],
      aviso: 'staging se vuelve a desplegar ahora para que las Functions vean los secretos nuevos',
    };
  }
  return {
    aviso:
      'producción verá los secretos nuevos en su siguiente despliegue (PR develop → main con tu aprobación). Hasta entonces el Worker de los avisos recibe 401 en PROD, lo anota sin datos y sigue con staging (15 §2).',
  };
}

function aplicarSecretosPages(e: Entorno): void {
  const paso = pasoTrasSecretosPages(e);
  if (!paso.comando) return log.aviso(paso.aviso);
  const r = ejecutar('gh', paso.comando);
  if (r.codigo === 0) log.ok(paso.aviso);
  else
    log.aviso(
      `No se ha podido lanzar el despliegue de staging (${errorSeguro(r.error)}): gh ${paso.comando.join(' ')}`,
    );
}

function escribirEntornos(datos: Map<string, DatosSupabase>, cuentaCf: string, huella: string | null): void {
  log.paso('11. docs/entornos.md');
  const archivo = path.join(RAIZ, 'docs', 'entornos.md');
  const anterior = (() => {
    try {
      return readFileSync(archivo, 'utf8');
    } catch {
      return '';
    }
  })();
  const huellaTexto = huella ?? anterior.match(/Huella GPG de respaldos \| `([^`]+)`/)?.[1] ?? '—';
  // La nota que acompaña a la huella (cuándo y por qué se regeneró) se conserva si la clave no cambia.
  const notaHuella = huella
    ? ''
    : (anterior.match(/Huella GPG de respaldos \| `[^`]+`([^|\n]*)\|/)?.[1] ?? '').trimEnd();
  const filas = ENTORNOS.map((e) => {
    const d = datos.get(e.clave)!;
    return `| ${e.clave} | \`${e.rama}\` | \`${e.proyectoSupabase}\` · \`${d.ref}\` | \`${e.bucket}\` | https://${e.proyectoPages}.pages.dev |`;
  });
  writeFileSync(
    archivo,
    `# Entornos creados por el arranque

Generado por \`npm run arranque\` el ${new Date().toISOString().slice(0, 10)}. Sin secretos: los valores viven
en GitHub Environments y en Cloudflare Pages (04 §10).

| Entorno | Rama | Proyecto Supabase · ref | Bucket | URL |
|---|---|---|---|---|
${filas.join('\n')}

| Cosa | Valor |
|---|---|
| Repositorio | https://github.com/${REPO} (público, DEC-053) |
| Cuenta de Cloudflare | \`${cuentaCf}\` |
| Rol de migraciones | \`hidrantes_migrador\` por el pooler en modo sesión, puerto 5432 (DEC-052) |
| Huella GPG de respaldos | \`${huellaTexto}\`${notaHuella} |
| Secretos por environment | \`SUPABASE_DB_URL\`, \`SUPABASE_URL\`, \`SUPABASE_SERVICE_ROLE_KEY\`, \`CLOUDFLARE_API_TOKEN\`, \`CLOUDFLARE_ACCOUNT_ID\` (+ \`GPG_PUBLIC_KEY\` en production) |
| Variables por environment | \`VITE_ENTORNO\`, \`VITE_SUPABASE_URL\`, \`VITE_SUPABASE_ANON_KEY\`, \`VITE_VAPID_PUBLIC_KEY\`, \`PAGES_PROYECTO\`, \`SUPABASE_PROJECT_REF\` |
| Variables del repositorio | \`SUPABASE_URL_STAGING\`, \`SUPABASE_ANON_KEY_STAGING\`, \`SUPABASE_URL_PROD\`, \`SUPABASE_ANON_KEY_PROD\` (mantener-activo.yml, DEC-054) |
| Secretos del repositorio | \`SUPABASE_DB_URL_{STAGING,PROD}\`, \`SUPABASE_SERVICE_ROLE_KEY_{STAGING,PROD}\`, \`GPG_PUBLIC_KEY\` (respaldo y promoción del piloto: DEC-071, DEC-078), \`VIGILANCIA_SECRETO_{STAGING,PROD}\` (vigilancia y envío manual de avisos, DEC-088) |
| Secretos del Worker \`hidrantes-avisos\` | \`VIGILANCIA_SECRETO_{STAGING,PROD}\`, con los mismos valores que Pages y el repositorio (docs/19 RV-52, DEC-097) |
| Variables cifradas de Pages | \`SUPABASE_URL\`, \`SUPABASE_SERVICE_ROLE_KEY\`, \`SAL_IP\`, \`NOMINATIM_USER_AGENT\`, \`VAPID_PRIVATE_KEY\`, \`VAPID_PUBLIC_KEY\`, \`VAPID_SUBJECT\`, \`VIGILANCIA_SECRETO\` (DEC-088) |

Rotar un secreto: \`npm run arranque -- --rotar <db|cloudflare|sal-ip|vapid|gpg|vigilancia|todo>\` (15).

Pages aplica sus secretos solo a los despliegues nuevos: tras rotar uno, el arranque vuelve a desplegar
staging (\`gh workflow run "Desplegar staging" --ref develop\`); producción lo aplica en su siguiente
despliegue, el PR \`develop → main\` (15 §2, docs/18 RV-38).
`,
  );
  log.ok('escrito (sin secretos): haz commit en una rama y PR a develop');
}

// ---------- Worker de los avisos (docs/19 RV-52, DEC-097) ----------

export const CONFIG_WORKER = 'workers/avisos/wrangler.toml';

/** Cómo acabó escribir un secreto del Worker: puesto, el Worker no existe aún, o cualquier otro fallo. */
export type EscrituraWorker = 'ok' | 'sin-worker' | 'error';

/** Código de la API de Cloudflare para "ese Worker no existe" (en wrangler, WORKER_NOT_FOUND_ERR_CODE). */
const WORKER_NO_EXISTE = /\b10007\b/;

/**
 * Pone un secreto del Worker `hidrantes-avisos`. Sin token, con la sesión de `wrangler login`. Un
 * Worker que aún no existe (antes de su primer despliegue desde staging) no es un error; un corte de
 * red o una sesión caducada, sí (docs/20 RV-72).
 */
function fijarSecretoWorker(nombre: string, valor: string, tokenCf?: string): EscrituraWorker {
  const env = tokenCf ? { ...process.env, CLOUDFLARE_API_TOKEN: tokenCf } : process.env;
  const r = ejecutar('npx', ['--no-install', 'wrangler', 'secret', 'put', nombre, '--config', CONFIG_WORKER], {
    entrada: valor,
    env,
  });
  if (r.codigo === 0) return 'ok';
  return WORKER_NO_EXISTE.test(r.salida) ? 'sin-worker' : 'error';
}

/**
 * Un secreto de vigilancia nuevo, en orden: primero el Worker y, solo si lo acepta, Pages y el
 * repositorio (`resto`). Al revés, un fallo del Worker dejaba Pages con el valor nuevo y el Worker con
 * el viejo: 401 y avisos parados (docs/20 RV-72, DEC-102). Si el Worker ya lo tiene y falla lo demás,
 * se dice cómo completarlo.
 */
export async function vigilanciaEnOrden(
  sufijo: string,
  worker: () => EscrituraWorker,
  resto: () => void | Promise<void>,
): Promise<void> {
  const nombre = `VIGILANCIA_SECRETO_${sufijo}`;
  const w = worker();
  if (w === 'error') {
    abortar(
      `El Worker hidrantes-avisos no ha aceptado ${nombre}: no se ha tocado Pages ni el repositorio, y todo sigue como estaba. Comprueba la sesión (npx wrangler whoami) y repite el mismo comando.`,
    );
  }
  if (w === 'sin-worker') {
    log.aviso(
      `El Worker hidrantes-avisos aún no existe. Tras su primer despliegue (deploy-staging.yml), npm run arranque -- --solo-faltantes le pone ${nombre}.`,
    );
  }
  try {
    await resto();
  } catch (e) {
    if (w !== 'ok') throw e;
    abortar(
      [
        `La rotación de ${nombre} ha quedado a medias: el Worker ya tiene el valor nuevo, y Pages o el repositorio no. Hasta completarla, /api/push responde 401 al Worker.`,
        'Para completarla, en este orden:',
        '  1. gh auth status && npx wrangler whoami            (las dos sesiones, en vigor)',
        '  2. npm run arranque -- --rotar vigilancia          (genera otro valor y lo pone en los tres sitios, el Worker primero)',
        '  3. gh workflow run "Desplegar staging" --ref develop   (si el paso 2 no lo lanza; producción lo verá en su siguiente despliegue)',
        `Causa: ${e instanceof Error ? e.message : String(e)}`,
      ].join('\n'),
    );
  }
}

// ---------- --solo-faltantes (docs/19 P-01) ----------

/** Lo que hay de cada secreto, por nombres; nunca valores. */
export interface HayEntorno {
  clave: 'staging' | 'production';
  pages: string[];
  repo: string[];
  worker: string[];
}

export interface PlanFaltantes {
  clave: 'staging' | 'production';
  /** Se genera un secreto de vigilancia nuevo y se pone en Pages, el repositorio y el Worker. */
  vigilancia: boolean;
  /** Se generan porque faltan; lo que ya está no se toca nunca. */
  salIp: boolean;
  vapid: boolean;
  nominatim: boolean;
  /** Lo que solo sabe poner el arranque completo, con el token de Supabase. */
  aMano: string[];
}

/**
 * Qué poner sin rotar nada de lo que ya está (cambiar las claves VAPID dejaría sin avisos a los
 * suscritos, ver `aRotar`). El secreto de vigilancia no se puede leer de Pages ni del repositorio:
 * si falta en cualquiera de los tres sitios, se genera uno nuevo para los tres. Eso no afecta a
 * nadie; solo hay que volver a desplegar Pages para que la Function lo lea (RV-38).
 */
export function planFaltantes(h: HayEntorno): PlanFaltantes {
  const sufijo = sufijoDe(h);
  const vigilancia =
    !h.pages.includes('VIGILANCIA_SECRETO') ||
    !h.repo.includes(`VIGILANCIA_SECRETO_${sufijo}`) ||
    !h.worker.includes(`VIGILANCIA_SECRETO_${sufijo}`);
  return {
    clave: h.clave,
    vigilancia,
    salIp: !h.pages.includes('SAL_IP'),
    vapid: !h.pages.includes('VAPID_PRIVATE_KEY') || !h.pages.includes('VAPID_PUBLIC_KEY'),
    nominatim: !h.pages.includes('NOMINATIM_USER_AGENT'),
    aMano: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((n) => !h.pages.includes(n)),
  };
}

function nombresSecretosPages(proyecto: string): string[] {
  const r = ejecutar('npx', ['--no-install', 'wrangler', 'pages', 'secret', 'list', '--project-name', proyecto]);
  if (r.codigo !== 0) abortar(`No se pueden listar los secretos de Pages de ${proyecto}: npx wrangler login`);
  return [...r.salida.matchAll(/^\s*-\s+([A-Z0-9_]+):/gm)].map((m) => m[1]!);
}

/**
 * Los nombres de los secretos del Worker, de la salida de `wrangler secret list`. Tres casos: el Worker
 * no existe (`[]`: hay que ponerlos), la lista, o un error, que **para**. Antes, un error también daba
 * `[]`, y --solo-faltantes rotaba todos los secretos de vigilancia por un corte de red (docs/20 RV-72).
 */
export function secretosWorkerDe(r: { codigo: number; salida: string }): string[] {
  const error = () =>
    abortar(
      'No se han podido leer los secretos del Worker hidrantes-avisos: no se cambia nada. Comprueba la sesión (npx wrangler whoami) y repite.',
    );
  if (r.codigo !== 0) return WORKER_NO_EXISTE.test(r.salida) ? [] : error();
  try {
    return (JSON.parse(r.salida.slice(r.salida.indexOf('['))) as { name: string }[]).map((s) => s.name);
  } catch {
    return error();
  }
}

function fijarSecretoPages(proyecto: string, nombre: string, valor: string): void {
  // En producción y en previsualizaciones, como fijarSecretos del arranque completo.
  for (const extra of [[], ['--env', 'preview']]) {
    ejecutarOk(
      'npx',
      ['--no-install', 'wrangler', 'pages', 'secret', 'put', nombre, '--project-name', proyecto, ...extra],
      { entrada: valor },
    );
  }
}

/**
 * El Worker de los avisos, si aún no existe en la cuenta. Normalmente lo despliega deploy-staging.yml;
 * con un token de Cloudflare solo de Pages no puede, y aquí se hace con la sesión de `wrangler login`
 * (DEC-097). Sin el Worker no hay dónde poner sus secretos.
 */
function desplegarWorkerSiFalta(): void {
  const r = ejecutar('npx', ['--no-install', 'wrangler', 'deployments', 'list', '--config', CONFIG_WORKER]);
  if (r.codigo === 0) return;
  ejecutarOk('npx', ['--no-install', 'wrangler', 'deploy', '--config', CONFIG_WORKER]);
  log.ok('Worker hidrantes-avisos desplegado con su cron cada 5 minutos');
}

/** Lo que --solo-faltantes lee y escribe fuera; en los tests, simulado. */
export interface OpsFaltantes {
  secretosRepo(): string[];
  /** La salida tal cual de `wrangler secret list`, para `secretosWorkerDe`. */
  secretosWorker(): { codigo: number; salida: string };
  secretosPages(proyecto: string): string[];
  fijarPages(proyecto: string, nombre: string, valor: string): void;
  fijarRepo(nombre: string, valor: string): void;
  fijarWorker(nombre: string, valor: string): EscrituraWorker;
  fijarVariable(nombre: string, valor: string, entorno: string): void;
  aplicar(e: Entorno): void;
  aleatorio(): string;
  vapid(): { privada: string; publica: string };
}

const OPS_REALES: OpsFaltantes = {
  secretosRepo: () => gh(['secret', 'list', '--repo', REPO, '--json', 'name', '--jq', '.[].name']).split(/\r?\n/),
  secretosWorker: () => ejecutar('npx', ['--no-install', 'wrangler', 'secret', 'list', '--config', CONFIG_WORKER]),
  secretosPages: nombresSecretosPages,
  fijarPages: fijarSecretoPages,
  fijarRepo: (nombre, valor) => fijarSecreto(nombre, valor),
  fijarWorker: (nombre, valor) => fijarSecretoWorker(nombre, valor),
  fijarVariable,
  aplicar: aplicarSecretosPages,
  aleatorio: salAleatoria,
  vapid: paresVapid,
};

/**
 * Pone solo lo que falta. **Primero lee todo** (repositorio, Worker y las dos Pages) y solo después
 * escribe: un fallo al leer para antes de cambiar nada (docs/20 RV-72). Devuelve lo que solo sabe
 * poner el arranque completo.
 */
export async function ponerFaltantes(op: OpsFaltantes, entornos: Entorno[] = ENTORNOS): Promise<string[]> {
  const repo = op.secretosRepo();
  const worker = secretosWorkerDe(op.secretosWorker());
  const planes = entornos.map((e) => ({
    e,
    plan: planFaltantes({ clave: e.clave, pages: op.secretosPages(e.proyectoPages), repo, worker }),
  }));
  const aMano: string[] = [];
  for (const { e, plan } of planes) {
    const sufijo = sufijoDe(e);
    const puestos: string[] = [];
    if (plan.vigilancia) {
      const valor = op.aleatorio();
      await vigilanciaEnOrden(
        sufijo,
        () => op.fijarWorker(`VIGILANCIA_SECRETO_${sufijo}`, valor),
        () => {
          op.fijarPages(e.proyectoPages, 'VIGILANCIA_SECRETO', valor);
          op.fijarRepo(`VIGILANCIA_SECRETO_${sufijo}`, valor);
        },
      );
      puestos.push('VIGILANCIA_SECRETO (Worker, Pages y repositorio)');
    }
    if (plan.salIp) {
      op.fijarPages(e.proyectoPages, 'SAL_IP', op.aleatorio());
      puestos.push('SAL_IP');
    }
    if (plan.nominatim) {
      op.fijarPages(e.proyectoPages, 'NOMINATIM_USER_AGENT', `hidrantes-albolote/1.0 (+https://github.com/${REPO})`);
      puestos.push('NOMINATIM_USER_AGENT');
    }
    if (plan.vapid) {
      // Solo si faltan: nadie puede estar suscrito con unas claves que no existen.
      const par = op.vapid();
      op.fijarPages(e.proyectoPages, 'VAPID_PRIVATE_KEY', par.privada);
      op.fijarPages(e.proyectoPages, 'VAPID_PUBLIC_KEY', par.publica);
      op.fijarVariable('VITE_VAPID_PUBLIC_KEY', par.publica, e.clave);
      puestos.push('VAPID_PRIVATE_KEY y VAPID_PUBLIC_KEY');
    }
    aMano.push(...plan.aMano.map((n) => `${n} en Pages ${e.proyectoPages}`));
    if (puestos.length) {
      log.ok(`${e.clave}: ${puestos.join(', ')}`);
      op.aplicar(e);
    } else log.ok(`${e.clave}: no falta nada`);
  }
  return aMano;
}

/** Pone solo lo que falta, con las sesiones de gh y wrangler: sin pedir tokens ni contraseñas. */
async function soloFaltantes(): Promise<void> {
  log.paso('Solo lo que falta (sin rotar nada de lo que ya está)');
  comprobarSesiones();
  desplegarWorkerSiFalta();
  const aMano = await ponerFaltantes(OPS_REALES);
  if (aMano.length) log.aviso(`Faltan y solo los pone el arranque completo (npm run arranque): ${aMano.join('; ')}`);
}

// ---------- modo local ----------

function arranqueLocal(): void {
  log.paso('Entorno local');
  const estado = ejecutar('npx', ['--no-install', 'supabase', 'status', '-o', 'json']);
  if (estado.codigo !== 0) abortar('Supabase local no está en marcha. Ejecuta: npx supabase start');
  const s = JSON.parse(estado.salida.slice(estado.salida.indexOf('{'))) as Record<string, string>;
  writeFileSync(
    path.join(RAIZ, '.env.local'),
    [
      '# Generado por npm run arranque -- --local. Solo Supabase local; no se commitea.',
      'VITE_ENTORNO=local',
      `VITE_SUPABASE_URL=${s.API_URL}`,
      `VITE_SUPABASE_ANON_KEY=${s.ANON_KEY}`,
      '',
    ].join('\n'),
  );
  log.ok('.env.local escrito');
  // Variables de las Pages Functions para `wrangler pages dev` (no se commitea, .gitignore).
  writeFileSync(
    path.join(RAIZ, '.dev.vars'),
    [
      `SUPABASE_URL=${s.API_URL}`,
      `SUPABASE_SERVICE_ROLE_KEY=${s.SERVICE_ROLE_KEY}`,
      'SAL_IP=sal-local',
      // probar-functions.ts llama a /api/push con él (RV-08); solo vale contra la pila local.
      'VIGILANCIA_SECRETO=vigilancia-local', // detectar-secretos:permitir (valor local de prueba)
      '',
    ].join('\n'),
  );
  log.ok('.dev.vars escrito');
  prepararLocal();
  ejecutarOk('npx', ['--no-install', 'tsx', 'scripts/migrar.ts', '--local']);
  log.ok('rol hidrantes_migrador y migraciones en Supabase local');
}

// ---------- principal ----------

async function principal(): Promise<void> {
  const { banderas, valores } = argumentos();
  if (banderas.has('local')) return arranqueLocal();
  if (banderas.has('solo-faltantes')) return await soloFaltantes();

  const rotar = aRotar(valores.get('rotar'));
  const esRotacion = rotar.size > 0;
  // En el arranque completo se (re)crea siempre el rol; al rotar, solo si se pide `db`.
  const tocarBd = !esRotacion || rotar.has('db');

  comprobarSesiones();
  const cred = await pedirCredenciales(tocarBd);
  // El token de Cloudflare va a GitHub en el arranque completo o al rotarlo; si no, no se toca.
  const tokenCf = !esRotacion || rotar.has('cloudflare') ? cred.tokenCf : null;
  if (!esRotacion) asegurarRepositorio();

  const datos = new Map<string, DatosSupabase>();
  for (const e of ENTORNOS) {
    const sb = await prepararSupabase(cred, e, tocarBd);
    datos.set(e.clave, sb);
    const { vapidPublica, vigilancia, escribir } = await prepararPages(cred, e, sb, rotar);
    const resto = async () => {
      await escribir();
      secretosGithub(e, sb, cred.cuentaCf, tokenCf, vapidPublica, vigilancia);
    };
    // El Worker de los avisos llama a /api/push con el mismo secreto (docs/19 RV-52): se escribe
    // primero, y si no lo acepta no se toca nada más (docs/20 RV-72).
    if (vigilancia) {
      const sufijo = sufijoDe(e);
      await vigilanciaEnOrden(
        sufijo,
        () => fijarSecretoWorker(`VIGILANCIA_SECRETO_${sufijo}`, vigilancia, cred.tokenCf),
        resto,
      );
    } else await resto();
  }
  const huella = await prepararGpg(rotar.has('gpg'));

  if (!esRotacion) {
    await asegurarSecretoPropietario();
    await instalarSkills();
    log.paso('10. Issues de las fases 1–9');
    crearIssues(REPO);
  }
  escribirEntornos(datos, cred.cuentaCf, huella);

  log.paso('Hecho');
  log.info(`Staging:    https://${ENTORNOS[0].proyectoPages}.pages.dev (se despliega al fusionar en develop)`);
  log.info(`Producción: https://${ENTORNOS[1].proyectoPages}.pages.dev (tras PR develop → main y tu aprobación)`);
  log.info('Puedes borrar ya el token de acceso de Supabase: no se ha guardado en ningún sitio.');
}

if (import.meta.main) ejecutarScript(principal);
