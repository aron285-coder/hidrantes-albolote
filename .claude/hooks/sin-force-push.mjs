// CLAUDE.md §6: nunca `git push --force` (ni -f, ni un refspec con +) a develop o main.
import { execFileSync } from 'node:child_process';
import { bloquear, comandoDe, leerEntrada, palabras, trozos } from './comun.mjs';

const PROTEGIDAS = /^(?:refs\/heads\/)?(develop|main)$/;
const entrada = await leerEntrada();
const comando = comandoDe(entrada);

function ramaActual() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: entrada.cwd ?? process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

if (comando) {
  for (const t of trozos(comando)) {
    const p = palabras(t);
    const i = p.indexOf('push');
    if (p[0] !== 'git' || i === -1) continue;
    const args = p.slice(i + 1);
    const opciones = args.filter((a) => a.startsWith('-'));
    const posicionales = args.filter((a) => !a.startsWith('-'));
    const forzado = opciones.some((o) => /^--force(-with-lease|-if-includes)?(=|$)/.test(o) || /^-[a-zA-Z]*f/.test(o));
    // `git push origin +develop` o `+HEAD:main` también fuerzan.
    const refspecs = posicionales.slice(1);
    const destino = (r) => r.replace(/^\+/, '').split(':').pop();
    const aProtegida = refspecs.some((r) => PROTEGIDAS.test(destino(r)));
    const conMas = refspecs.some((r) => r.startsWith('+') && PROTEGIDAS.test(destino(r)));
    const sinRefspec = refspecs.length === 0 && PROTEGIDAS.test(ramaActual());
    if (conMas || (forzado && (aProtegida || sinRefspec))) {
      bloquear('nunca `git push --force` a develop ni a main (CLAUDE.md §6). Solo en tu propia rama.');
    }
  }
}
