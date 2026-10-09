// Traspaso de un secreto de GitHub con clave efímera (docs/31 §1.2, RV-131, DEC-172).
//
//   npm run traspasar-secreto -- --secreto SUPABASE_DB_URL_PROD,SUPABASE_SERVICE_ROLE_KEY_PROD \
//                                --desde repositorio --hacia prod-tareas
//   npm run traspasar-secreto -- --secreto CLOUDFLARE_API_TOKEN --desde staging --hacia prod-tareas
//
// GitHub no deja leer un secreto: para moverlo de sitio sin que nadie vea su valor,
//   1. se genera aquí un par RSA de 4096 bits de un solo uso; la privada solo vive en memoria;
//   2. se lanza `traspaso.yml` en `develop`, en el sitio donde está el secreto, con la pública: cifra
//      el valor con una clave AES-256-GCM de un solo uso, cifra esa clave con la pública (RSA-OAEP) y
//      sube solo el sobre cifrado como artefacto de 1 día (híbrido: sirve para secretos de varios KB,
//      como GPG_PUBLIC_KEY; docs/32 RV-208);
//   3. se descarga, se descifra en memoria y se pasa por tubería a `gh secret set` en el destino;
//   4. se borran el artefacto y la ejecución, pase lo que pase.
//
// No borra el secreto del origen: eso se hace después de comprobar que los workflows funcionan desde
// el destino (RV-131 paso 3). El valor nunca se escribe en disco, en la salida ni en un argumento.
//
// Usa age en la especificación; aquí RSA-OAEP y AES-256-GCM con node:crypto, que ya está en el runner
// y en el PC, sin instalar nada (DEC-172). Solo lo lanza quien diga la variable del repositorio
// PROPIETARIO; el repositorio sale de `git remote` (scripts/lib/comun.ts).

import {
  constants,
  createDecipheriv,
  generateKeyPairSync,
  type KeyObject,
  privateDecrypt,
  randomUUID,
} from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  abortar,
  argumentos,
  ejecutar,
  ejecutarOk,
  ejecutarScript,
  errorSeguro,
  log,
  repositorio,
} from './lib/comun.ts';

export const WORKFLOW = 'traspaso.yml';
/** traspaso.yml solo corre en develop: es la única rama que admite el environment prod-tareas. */
export const RAMA = 'develop';
const NOMBRE_VALIDO = /^[A-Z][A-Z0-9_]{0,99}$/;
const SITIO_VALIDO = /^(repositorio|[a-z][a-z0-9-]{0,49})$/;

export interface Pedido {
  secretos: string[];
  desde: string;
  hacia: string;
}

/** Valida los argumentos. `repositorio` es el nivel del repositorio; cualquier otro, un environment. */
export function pedidoDe(valores: Map<string, string>): Pedido {
  const secretos = (valores.get('secreto') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const desde = valores.get('desde') ?? '';
  const hacia = valores.get('hacia') ?? '';
  if (secretos.length === 0) abortar('Falta --secreto NOMBRE[,NOMBRE…]');
  for (const s of secretos) if (!NOMBRE_VALIDO.test(s)) abortar(`Nombre de secreto no válido: ${s}`);
  if (!SITIO_VALIDO.test(desde)) abortar("--desde tiene que ser 'repositorio' o el nombre de un environment");
  if (!SITIO_VALIDO.test(hacia)) abortar("--hacia tiene que ser 'repositorio' o el nombre de un environment");
  if (desde === hacia) abortar('--desde y --hacia son el mismo sitio');
  return { secretos, desde, hacia };
}

/** Un par RSA de un solo uso: la pública, en DER y base64 para pasarla como entrada del workflow. */
export function parEfimero(): { publica: string; privada: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  return { publica: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), privada: privateKey };
}

/** El sobre que escribe traspaso.yml: todo en base64. */
interface Sobre {
  v: 1;
  /** La clave AES-256 de un solo uso, cifrada con RSA-OAEP (SHA-256, MGF1 con SHA-256). */
  clave: string;
  iv: string;
  etiqueta: string;
  datos: string;
}

function leerSobre(texto: string): Sobre {
  if (texto.trim() === '') abortar('El artefacto cifrado está vacío');
  let sobre: Partial<Sobre>;
  try {
    sobre = JSON.parse(texto) as Partial<Sobre>;
  } catch {
    abortar('El artefacto cifrado no es el sobre de traspaso.yml (¿una versión vieja del workflow?)');
  }
  const campos = ['clave', 'iv', 'etiqueta', 'datos'] as const;
  if (sobre?.v !== 1 || campos.some((c) => typeof sobre[c] !== 'string'))
    abortar('El artefacto cifrado no es el sobre de traspaso.yml (¿una versión vieja del workflow?)');
  return sobre as Sobre;
}

/**
 * Lo que hace traspaso.yml, al revés (docs/32 RV-208): RSA-OAEP descifra la clave AES de un solo uso
 * y AES-256-GCM, el valor. La etiqueta de GCM comprueba que el sobre no se ha tocado: si no cuadra,
 * se para, no se fija un valor estropeado.
 */
export function descifrar(privada: KeyObject, texto: string): string {
  const sobre = leerSobre(texto);
  const b = (s: string) => Buffer.from(s, 'base64');
  const iv = b(sobre.iv);
  const etiqueta = b(sobre.etiqueta);
  if (iv.length !== 12 || etiqueta.length !== 16)
    abortar('El sobre de traspaso.yml está mal formado (IV o etiqueta de otro tamaño)');
  let clave: Buffer;
  try {
    clave = privateDecrypt(
      { key: privada, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      b(sobre.clave),
    );
  } catch {
    // Sin el mensaje de node:crypto: no lleva el valor, pero tampoco ayuda. Lo que importa es parar.
    abortar('No se ha podido descifrar el artefacto: no es para esta clave');
  }
  if (clave.length !== 32) abortar('El sobre de traspaso.yml está mal formado (la clave AES no es de 256 bits)');
  let valor: Buffer;
  try {
    const aes = createDecipheriv('aes-256-gcm', clave, iv);
    aes.setAuthTag(etiqueta);
    valor = Buffer.concat([aes.update(b(sobre.datos)), aes.final()]);
  } catch {
    abortar('No se ha podido descifrar el artefacto: la etiqueta GCM no cuadra, se ha modificado');
  }
  if (valor.length === 0) abortar('El secreto descifrado está vacío');
  return valor.toString('utf8');
}

/**
 * Antes de lanzar nada: traspaso.yml solo corre si quien lo lanza es la variable PROPIETARIO del
 * repositorio. Si falta o es otro, los dos trabajos se saltarían y no habría artefacto; mejor decirlo
 * aquí, con lo que hay que hacer.
 */
export function comprobarPropietario(variable: string | null, sesion: string, repo: string): void {
  if (!variable)
    abortar(
      `Falta la variable del repositorio PROPIETARIO (la pone npm run arranque): ` +
        `gh variable set PROPIETARIO --repo ${repo} --body <login de GitHub de quien lanza los traspasos>`,
    );
  // Los logins de GitHub, y el == de las expresiones de Actions, no distinguen mayúsculas.
  if (variable.toLowerCase() !== sesion.toLowerCase())
    abortar(`traspaso.yml solo lo puede lanzar ${variable} (variable PROPIETARIO) y la sesión de gh es de ${sesion}`);
}

/**
 * La variable PROPIETARIO, o null si no existe. Cualquier otro fallo (permisos, red) aborta con su
 * motivo: decir «falta» invitaría a pisar una variable que sí está.
 */
export function propietarioDe(r: { codigo: number; salida: string; error: string }): string | null {
  if (r.codigo === 0) return r.salida.trim() || null;
  if (/not found|HTTP 404/i.test(r.error)) return null;
  abortar(`No se puede leer la variable PROPIETARIO: ${errorSeguro(r.error || r.salida)}`);
}

/** La ejecución de este traspaso, por su `run-name` ("Traspaso <id>"). */
export function ejecucionDe(lista: { databaseId: number; displayTitle: string }[], id: string): number | null {
  return lista.find((r) => r.displayTitle === `Traspaso ${id}`)?.databaseId ?? null;
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const gh = (args: string[], entrada?: string) => ejecutarOk('gh', args, { entrada });

async function buscarEjecucion(id: string): Promise<number> {
  for (let i = 0; i < 30; i++) {
    await esperar(3000);
    const lista = JSON.parse(
      gh([
        'run',
        'list',
        '--repo',
        repositorio().completo,
        '--workflow',
        WORKFLOW,
        '--limit',
        '20',
        '--json',
        'databaseId,displayTitle',
      ]),
    ) as { databaseId: number; displayTitle: string }[];
    const encontrada = ejecucionDe(lista, id);
    if (encontrada) return encontrada;
  }
  abortar(`No aparece la ejecución de ${WORKFLOW} (Traspaso ${id}) en 90 s`);
}

async function esperarFin(run: number): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const r = JSON.parse(
      gh(['run', 'view', String(run), '--repo', repositorio().completo, '--json', 'status,conclusion']),
    ) as {
      status: string;
      conclusion: string;
    };
    if (r.status === 'completed') return r.conclusion;
    await esperar(5000);
  }
  abortar(`La ejecución ${run} no ha terminado en 8 minutos`);
}

/** Borra los artefactos y la ejecución. Se intenta todo aunque algo falle, y se dice qué quedó. */
function limpiar(run: number): void {
  const quedan: string[] = [];
  const artefactos = ejecutar('gh', [
    'api',
    `repos/${repositorio().completo}/actions/runs/${run}/artifacts`,
    '--jq',
    '.artifacts[].id',
  ]);
  // Si no se pueden listar, se borra igual la ejecución, que se lleva sus artefactos.
  if (artefactos.codigo !== 0)
    log.aviso('No se pudo leer la lista de artefactos: se borra la ejecución, que se los lleva');
  for (const a of artefactos.salida.split('\n').filter(Boolean)) {
    if (ejecutar('gh', ['api', '-X', 'DELETE', `repos/${repositorio().completo}/actions/artifacts/${a}`]).codigo !== 0)
      quedan.push(`artefacto ${a}`);
  }
  if (ejecutar('gh', ['api', '-X', 'DELETE', `repos/${repositorio().completo}/actions/runs/${run}`]).codigo !== 0)
    quedan.push(`ejecución ${run}`);
  if (quedan.length)
    log.aviso(`No se pudo borrar: ${quedan.join(', ')} (el artefacto caduca en 1 día; solo lleva texto cifrado)`);
  else log.ok('artefacto y ejecución borrados');
}

function fijar(nombre: string, valor: string, hacia: string): void {
  const args = ['secret', 'set', nombre, '--repo', repositorio().completo];
  if (hacia !== 'repositorio') args.push('--env', hacia);
  // Por stdin: nunca como argumento (CLAUDE.md §3, comun.ts).
  gh(args, valor);
}

async function traspasar(nombre: string, desde: string, hacia: string): Promise<void> {
  log.paso(`${nombre}: ${desde} → ${hacia}`);
  const { publica, privada } = parEfimero();
  const id = randomUUID();
  gh([
    'workflow',
    'run',
    WORKFLOW,
    '--repo',
    repositorio().completo,
    '--ref',
    RAMA,
    '-f',
    `secreto=${nombre}`,
    '-f',
    `origen=${desde}`,
    '-f',
    `clave=${publica}`,
    '-f',
    `id=${id}`,
  ]);
  const run = await buscarEjecucion(id);
  log.info(`ejecución ${run}`);
  const carpeta = mkdtempSync(path.join(tmpdir(), 'traspaso-'));
  try {
    const conclusion = await esperarFin(run);
    if (conclusion !== 'success')
      abortar(`traspaso.yml terminó en ${conclusion}: mira la ejecución ${run} (no lleva el valor)`);
    gh(['run', 'download', String(run), '--repo', repositorio().completo, '-n', 'cifrado', '-D', carpeta]);
    const valor = descifrar(privada, readFileSync(path.join(carpeta, 'cifrado.json'), 'utf8'));
    fijar(nombre, valor, hacia);
    log.ok(`${nombre} puesto en ${hacia}`);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
    limpiar(run);
  }
}

/** Los nombres de los secretos de un sitio. Un environment que no existe es un error, no una lista vacía. */
function secretosDe(sitio: string): string[] {
  if (
    sitio !== 'repositorio' &&
    ejecutar('gh', ['api', `repos/${repositorio().completo}/environments/${sitio}`]).codigo !== 0
  ) {
    abortar(`El environment ${sitio} no existe (un trabajo que lo nombre lo crearía sin protección)`);
  }
  const extra = sitio === 'repositorio' ? [] : ['--env', sitio];
  return gh(['secret', 'list', '--repo', repositorio().completo, ...extra, '--json', 'name', '--jq', '.[].name']).split(
    /\r?\n/,
  );
}

/**
 * Antes de lanzar nada: el secreto tiene que estar en el origen. Un trabajo con environment también
 * ve los del repositorio, así que sin esta comprobación `--desde staging` copiaría en silencio el del
 * repositorio si staging no lo tuviera. Y los dos environments tienen que existir.
 */
export function comprobarOrigen(secretos: string[], enOrigen: string[], desde: string): void {
  const faltan = secretos.filter((s) => !enOrigen.includes(s));
  if (faltan.length) abortar(`No están en ${desde}: ${faltan.join(', ')}. No se lanza nada.`);
}

async function principal(): Promise<void> {
  const { secretos, desde, hacia } = pedidoDe(argumentos().valores);
  const sesion = ejecutar('gh', ['auth', 'status']);
  if (sesion.codigo !== 0) abortar('Hace falta la sesión de gh: gh auth login');
  const variable = ejecutar('gh', ['variable', 'get', 'PROPIETARIO', '--repo', repositorio().completo]);
  comprobarPropietario(propietarioDe(variable), gh(['api', 'user', '--jq', '.login']), repositorio().completo);
  comprobarOrigen(secretos, secretosDe(desde), desde);
  secretosDe(hacia);
  for (const s of secretos) {
    try {
      await traspasar(s, desde, hacia);
    } catch (e) {
      abortar(`${s}: ${errorSeguro(e instanceof Error ? e.message : String(e))}`);
    }
  }
  log.ok(`Hecho. El origen (${desde}) sigue teniendo los secretos: se borran después de comprobar los workflows.`);
}

if (import.meta.main) ejecutarScript(principal);
