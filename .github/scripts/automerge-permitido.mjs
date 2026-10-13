// docs/32 RV-204 (DEC-181) y docs/35 RV-410 (DEC-198): ¿puede Dependabot fusionar solo este PR?
// Solo si cada dependencia que cambia es de desarrollo, de parche y está, con su nombre exacto, en la
// lista de permitidos; y si el lockfile del PR, comparado con el de la base, no cambia nada más: ni
// entradas nuevas o quitadas, ni otras versiones, ni scripts de instalación. Sin dependencias del
// proyecto: corre con el Node del runner, sin `npm ci`.
//
//   DEPENDENCIAS='<updated-dependencies-json>' LOCK_BASE=<lockfile de la base> LOCK_PR=<lockfile del PR> \
//     node .github/scripts/automerge-permitido.mjs <lista>
//
// El lockfile del PR llega como datos (lo baja automerge.yml con la API de contenidos): nunca se hace
// checkout del PR. Escribe `decision=fusionar` o `decision=esperar` (para $GITHUB_OUTPUT) y, si espera,
// el motivo en la salida de errores y en el resumen del job. Sale con 2 si no puede decidir.
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Los nombres de la lista: uno por línea, sin comentarios ni líneas en blanco. Sin comodines. */
export function leerLista(texto) {
  const nombres = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
  const comodines = nombres.filter((n) => /[*?[\]{}]/.test(n));
  if (comodines.length) throw new Error(`la lista solo admite nombres exactos: ${comodines.join(', ')}`);
  return nombres;
}

/** El nombre del paquete de una entrada de `packages` (`node_modules/a/node_modules/@b/c` → `@b/c`). */
export function paqueteDe(ruta) {
  const i = ruta.lastIndexOf('node_modules/');
  return i === -1 ? null : ruta.slice(i + 'node_modules/'.length);
}

/** JSON estable: mismas claves en el mismo orden, para comparar entradas. */
function estable(v) {
  if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estable(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/**
 * Lo que cambia en el lockfile y no es una de las dependencias del PR a la versión que dice
 * Dependabot. `permitidas`: nombre → versión nueva.
 */
export function cambiosNoPermitidos(lockBase, lockPr, permitidas) {
  const base = lockBase?.packages;
  const pr = lockPr?.packages;
  if (!base || typeof base !== 'object' || !pr || typeof pr !== 'object')
    return ['no se puede leer el lockfile de la base o el del PR (`packages`)'];
  const motivos = [];
  for (const ruta of Object.keys(base)) {
    if (!(ruta in pr)) motivos.push(`${ruta || '(raíz)'}: desaparece del lockfile`);
  }
  for (const [ruta, entrada] of Object.entries(pr)) {
    const antes = base[ruta];
    if (antes === undefined) {
      motivos.push(`${ruta}: entrada nueva en el lockfile`);
      if (entrada?.hasInstallScript) motivos.push(`${ruta}: trae un script de instalación`);
      continue;
    }
    if (estable(antes) === estable(entrada)) continue;
    if (entrada?.hasInstallScript) motivos.push(`${ruta}: cambia y trae un script de instalación`);
    if (ruta === '') {
      // La raíz: solo puede cambiar el rango de las dependencias de desarrollo del PR.
      const sinPermitidas = (e) => {
        const dev = { ...(e?.devDependencies ?? {}) };
        for (const n of Object.keys(permitidas)) delete dev[n];
        return estable({ ...e, devDependencies: dev });
      };
      if (sinPermitidas(antes) !== sinPermitidas(entrada))
        motivos.push('(raíz): cambia algo más que el rango de las dependencias del PR');
      continue;
    }
    const nombre = paqueteDe(ruta);
    if (!nombre || !(nombre in permitidas)) {
      motivos.push(`${ruta}: cambia y no es una dependencia del PR`);
      continue;
    }
    if (entrada?.version !== permitidas[nombre])
      motivos.push(`${ruta}: queda en ${entrada?.version ?? '?'} y Dependabot dice ${permitidas[nombre]}`);
    // Solo la versión, el tarball y su integridad pueden cambiar; nada de dependencias nuevas, bin…
    const resto = (e) => estable({ ...e, version: undefined, resolved: undefined, integrity: undefined });
    if (resto(antes) !== resto(entrada)) motivos.push(`${ruta}: cambia algo más que la versión`);
  }
  return motivos;
}

/** @returns {{ fusionar: boolean, motivos: string[] }} */
export function decidir(dependencias, nombres, lockBase, lockPr) {
  if (!nombres.length) return { fusionar: false, motivos: ['la lista de permitidos está vacía'] };
  if (!Array.isArray(dependencias) || !dependencias.length)
    return { fusionar: false, motivos: ['Dependabot no ha dicho qué dependencias cambian'] };
  const motivos = [];
  const permitidas = {};
  for (const d of dependencias) {
    const nombre = String(d?.dependencyName ?? '?');
    if (d?.dependencyType !== 'direct:development')
      motivos.push(`${nombre}: no es una dependencia de desarrollo (${d?.dependencyType ?? '?'})`);
    else if (d?.updateType !== 'version-update:semver-patch')
      motivos.push(`${nombre}: no es un parche (${d?.updateType ?? '?'})`);
    else if (!nombres.includes(nombre)) motivos.push(`${nombre}: no está en la lista de permitidos`);
    else if (typeof d?.newVersion !== 'string' || !d.newVersion)
      motivos.push(`${nombre}: Dependabot no dice a qué versión va`);
    else permitidas[nombre] = d.newVersion;
  }
  if (motivos.length) return { fusionar: false, motivos };
  motivos.push(...cambiosNoPermitidos(lockBase, lockPr, permitidas));
  return { fusionar: motivos.length === 0, motivos };
}

function principal() {
  const lista = process.argv[2];
  if (!lista || !process.env.LOCK_BASE || !process.env.LOCK_PR) {
    console.error(
      'Uso: DEPENDENCIAS=<json> LOCK_BASE=<archivo> LOCK_PR=<archivo> node automerge-permitido.mjs <lista>',
    );
    process.exit(2);
  }
  let dependencias;
  let nombres;
  let lockBase;
  let lockPr;
  try {
    nombres = leerLista(readFileSync(lista, 'utf8'));
    dependencias = JSON.parse(process.env.DEPENDENCIAS ?? '');
    lockBase = JSON.parse(readFileSync(process.env.LOCK_BASE, 'utf8'));
    lockPr = JSON.parse(readFileSync(process.env.LOCK_PR, 'utf8'));
  } catch (e) {
    console.error(`No se puede decidir: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  const { fusionar, motivos } = decidir(dependencias, nombres, lockBase, lockPr);
  console.log(`decision=${fusionar ? 'fusionar' : 'esperar'}`);
  if (fusionar) return;
  for (const m of motivos) console.error(m);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        '### Dependabot: este PR espera a una revisión (RV-204, RV-410)',
        '',
        ...motivos.map((m) => `- ${m}`),
        '',
        'Lo revisa una sesión de Claude Code con pr-review-toolkit, mirando el changelog del paquete.',
        '',
      ].join('\n'),
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
