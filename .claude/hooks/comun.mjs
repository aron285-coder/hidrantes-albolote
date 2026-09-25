// Lo común de los hooks PreToolUse del proyecto (docs/21 SK-02, DEC-115). Node, sin dependencias.
//
// Claude Code pasa por la entrada estándar un JSON con `tool_name`, `tool_input` y `cwd`. Salir con
// 2 bloquea la acción, y lo escrito en stderr es lo que lee Claude. Salir con 0 la deja pasar.

import { execFileSync } from 'node:child_process';
import path from 'node:path';

export async function leerEntrada() {
  let texto = '';
  for await (const trozo of process.stdin) texto += trozo;
  try {
    return JSON.parse(texto || '{}');
  } catch {
    return {};
  }
}

/** Bloquea con el mensaje de la regla, en español. */
export function bloquear(mensaje) {
  process.stderr.write(`Bloqueado por un hook del proyecto: ${mensaje}\n`);
  process.exit(2);
}

/** El comando de Bash o PowerShell, o null si la herramienta es otra. */
export function comandoDe(entrada) {
  const nombre = entrada.tool_name ?? '';
  if (nombre !== 'Bash' && nombre !== 'PowerShell') return null;
  const c = entrada.tool_input?.command;
  return typeof c === 'string' ? c : null;
}

/** Ruta con barras normales, para comparar igual en Windows y en Linux. */
export const normal = (ruta) => ruta.replaceAll('\\', '/');

/** Rutas y textos nuevos de Write, Edit y MultiEdit. */
export function escrituras(entrada) {
  const e = entrada.tool_input ?? {};
  const cwd = entrada.cwd ?? process.cwd();
  const abs = (r) => normal(path.resolve(cwd, r));
  switch (entrada.tool_name) {
    case 'Write':
      return [{ ruta: abs(e.file_path ?? ''), texto: String(e.content ?? e.file_text ?? ''), nuevo: true }];
    case 'Edit':
      return [{ ruta: abs(e.file_path ?? ''), texto: String(e.new_string ?? e.new_file_text ?? ''), nuevo: false }];
    case 'MultiEdit':
      return [
        {
          ruta: abs(e.file_path ?? ''),
          texto: (e.edits ?? []).map((x) => String(x?.new_string ?? '')).join('\n'),
          nuevo: false,
        },
      ];
    default:
      return [];
  }
}

/** Los trozos de un comando compuesto (&&, ||, ;, |, saltos de línea). */
export const trozos = (comando) =>
  comando
    .split(/&&|\|\||[;|\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

/** Palabras de un trozo, respetando comillas simples y dobles. */
export function palabras(trozo) {
  const res = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(trozo))) res.push(m[1] ?? m[2] ?? m[3]);
  return res;
}

/**
 * ¿Está ya esa ruta en origin/develop (o en origin/main)? Una migración que está ahí ya se ha
 * aplicado en staging. Una que solo está en la rama de trabajo aún se puede editar o renumerar
 * (skill nueva-migracion). Sin remoto, cuenta como aplicada si el archivo existe.
 */
export function yaFusionada(rutaAbsoluta, existe) {
  const opciones = { cwd: path.dirname(rutaAbsoluta), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  let raiz;
  try {
    raiz = normal(execFileSync('git', ['rev-parse', '--show-toplevel'], opciones).trim());
  } catch {
    return existe;
  }
  const relativa = path.posix.relative(raiz, normal(rutaAbsoluta));
  let hayRemoto = false;
  for (const rama of ['origin/develop', 'origin/main']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '-q', rama], opciones);
      hayRemoto = true;
      execFileSync('git', ['cat-file', '-e', `${rama}:${relativa}`], opciones);
      return true;
    } catch {
      // no está en esa rama (o la rama no existe)
    }
  }
  return hayRemoto ? false : existe;
}
