// CLAUDE.md §3: nunca editar ni borrar una migración aplicada. Solo se crean nuevas.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { bloquear, comandoDe, escrituras, leerEntrada, normal, palabras, trozos, yaFusionada } from './comun.mjs';

const MIGRACION = /(^|\/)supabase\/migrations\/[^/]+\.sql$/;
const REGLA =
  'nunca se edita ni se borra una migración que ya está en develop (CLAUDE.md §3). Se corrige con una migración nueva (skill nueva-migracion).';

/** Órdenes de shell que borran, mueven o escriben un archivo (docs/22 RV-91 añade cp, tee, dd…). */
const ORDENES =
  /^(rm|del|Remove-Item|mv|move|Move-Item|sed|truncate|Set-Content|Clear-Content|cp|copy|Copy-Item|tee|install|dd)$/i;
/** En estas, el destino es solo el último argumento que no es una opción: el primero se lee. */
const COPIAN = new Set(['cp', 'copy', 'copy-item', 'install']);

const entrada = await leerEntrada();
const cwd = entrada.cwd ?? process.cwd();
const aplicada = (ruta) => {
  const abs = path.resolve(cwd, ruta);
  return MIGRACION.test(normal(ruta)) && existsSync(abs) && yaFusionada(abs, true);
};

for (const { ruta } of escrituras(entrada)) {
  // Crear una migración nueva, o tocar una que solo está en la rama de trabajo, se permite.
  if (MIGRACION.test(ruta) && existsSync(ruta) && yaFusionada(ruta, true)) bloquear(`${path.basename(ruta)}: ${REGLA}`);
}

/** Las rutas que un trozo de comando escribiría, borraría o movería. */
function destinos(p) {
  const sinOpciones = (xs) => xs.filter((x) => !x.startsWith('-'));
  if (p[0] === 'git') {
    if (/^(rm|mv|restore)$/.test(p[1] ?? '')) return sinOpciones(p.slice(2));
    // `git checkout <rama> -- <ruta>` reescribe la ruta con otra versión.
    if (p[1] === 'checkout' && p.includes('--')) return p.slice(p.indexOf('--') + 1);
    return [];
  }
  const i = p.findIndex((x) => ORDENES.test(x));
  if (i === -1) return [];
  const orden = p[i].toLowerCase();
  const args = p.slice(i + 1);
  if (COPIAN.has(orden)) return sinOpciones(args).slice(-1);
  if (orden === 'dd') return args.filter((a) => a.startsWith('of=')).map((a) => a.slice(3));
  if (orden === 'sed') return args.some((x) => /^-[a-zA-Z]*i/.test(x) || x === '--in-place') ? sinOpciones(args) : [];
  return sinOpciones(args);
}

const comando = comandoDe(entrada);
if (comando) {
  for (const t of trozos(comando)) {
    for (const d of destinos(palabras(t))) {
      if (aplicada(d)) bloquear(`${path.basename(d)}: ${REGLA}`);
    }
  }
  // >, >> sobre una migración también la reescriben.
  const redireccion = /(?:^|[^>])>{1,2}\s*("?)([^\s"]*supabase[\\/]migrations[\\/][^\s"]+\.sql)\1/.exec(comando);
  if (redireccion && aplicada(redireccion[2])) bloquear(`${path.basename(redireccion[2])}: ${REGLA}`);
}
