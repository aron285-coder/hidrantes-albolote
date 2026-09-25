// CLAUDE.md §3 y docs/18 RV-37: nunca secretos, `.env`, respaldos ni el mapa base fuera de su sitio en
// Git. Con `git add --dry-run` se sabe qué entraría de verdad, también con `git add -A` o `git add .`.
import { execFileSync } from 'node:child_process';
import { bloquear, comandoDe, leerEntrada, normal, palabras, trozos } from './comun.mjs';

/** Por qué no puede entrar esa ruta, o null. Rutas relativas a la raíz del repositorio. */
export function motivoProhibido(ruta) {
  const r = normal(ruta);
  const nombre = r.split('/').pop() ?? '';
  if (/^\.env(\..+)?$/.test(nombre) && nombre !== '.env.example') return 'un .env (secretos)';
  if (nombre === '.dev.vars') return '.dev.vars (secretos de las Functions en local)';
  if (!r.includes('/') && r.endsWith('.sql')) return 'un .sql en la raíz (¿un volcado o un respaldo?)';
  if (r.endsWith('.pmtiles') && !r.startsWith('public/mapabase/')) return 'un .pmtiles fuera de public/mapabase/';
  return null;
}

const entrada = await leerEntrada();
const comando = comandoDe(entrada);
const cwd = entrada.cwd ?? process.cwd();

if (comando) {
  for (const t of trozos(comando)) {
    const p = palabras(t);
    if (p[0] !== 'git' || p[1] !== 'add') continue;
    const args = p.slice(2).filter((a) => a !== '-n' && a !== '--dry-run');
    let salida = '';
    try {
      const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
      salida = execFileSync('git', ['add', '--dry-run', ...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      for (const linea of salida.split(/\r?\n/)) {
        const m = /^add '(.+)'$/.exec(linea.trim());
        if (!m) continue;
        const motivo = motivoProhibido(m[1]);
        if (motivo) {
          bloquear(
            `\`git add\` metería ${m[1]}: ${motivo}. Nunca secretos, .env, respaldos ni fotos en Git (CLAUDE.md §3); el repositorio es público (DEC-053). Raíz: ${normal(raiz)}`,
          );
        }
      }
    } catch {
      // Si git no puede ni simularlo, el `git add` de verdad también fallará: nada que bloquear.
    }
  }
}
