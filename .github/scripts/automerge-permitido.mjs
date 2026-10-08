// docs/32 RV-204 (DEC-181): ¿puede Dependabot fusionar solo este PR? Solo si cada dependencia que
// cambia es de desarrollo, de parche y está en la lista de permitidos. Sin dependencias del proyecto:
// corre con el Node del runner, antes de cualquier `npm ci`.
//
//   DEPENDENCIAS='<updated-dependencies-json>' node .github/scripts/automerge-permitido.mjs <lista>
//
// Escribe `decision=fusionar` o `decision=esperar` (para $GITHUB_OUTPUT) y, si espera, el motivo de
// cada dependencia en la salida de errores y en el resumen del job. Sale con 2 si no puede decidir.
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Los patrones de la lista: uno por línea, sin comentarios ni líneas en blanco. */
export function leerLista(texto) {
  return texto
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

/** `*` vale por cualquier texto (también `/`); lo demás, literal. */
export function encaja(nombre, patron) {
  const re = patron.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${re}$`).test(nombre);
}

/** @returns {{ fusionar: boolean, motivos: string[] }} */
export function decidir(dependencias, patrones) {
  if (!patrones.length) return { fusionar: false, motivos: ['la lista de permitidos está vacía'] };
  if (!Array.isArray(dependencias) || !dependencias.length)
    return { fusionar: false, motivos: ['Dependabot no ha dicho qué dependencias cambian'] };
  const motivos = [];
  for (const d of dependencias) {
    const nombre = String(d?.dependencyName ?? '?');
    if (d?.dependencyType !== 'direct:development')
      motivos.push(`${nombre}: no es una dependencia de desarrollo (${d?.dependencyType ?? '?'})`);
    else if (d?.updateType !== 'version-update:semver-patch')
      motivos.push(`${nombre}: no es un parche (${d?.updateType ?? '?'})`);
    else if (!patrones.some((p) => encaja(nombre, p))) motivos.push(`${nombre}: no está en la lista de permitidos`);
  }
  return { fusionar: motivos.length === 0, motivos };
}

function principal() {
  const lista = process.argv[2];
  if (!lista) {
    console.error('Uso: DEPENDENCIAS=<json> node automerge-permitido.mjs <lista>');
    process.exit(2);
  }
  let dependencias;
  let patrones;
  try {
    patrones = leerLista(readFileSync(lista, 'utf8'));
    dependencias = JSON.parse(process.env.DEPENDENCIAS ?? '');
  } catch (e) {
    console.error(`No se puede decidir: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  const { fusionar, motivos } = decidir(dependencias, patrones);
  console.log(`decision=${fusionar ? 'fusionar' : 'esperar'}`);
  if (fusionar) return;
  for (const m of motivos) console.error(m);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        '### Dependabot: este PR espera a una revisión (RV-204)',
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
