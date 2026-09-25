// CLAUDE.md §3: nunca editar ni borrar una migración aplicada. Solo se crean nuevas.
import path from 'node:path';
import { existsSync } from 'node:fs';
import { bloquear, comandoDe, escrituras, leerEntrada, normal, palabras, trozos, yaFusionada } from './comun.mjs';

const MIGRACION = /(^|\/)supabase\/migrations\/[^/]+\.sql$/;
const REGLA =
  'nunca se edita ni se borra una migración que ya está en develop (CLAUDE.md §3). Se corrige con una migración nueva (skill nueva-migracion).';

const entrada = await leerEntrada();
const cwd = entrada.cwd ?? process.cwd();

for (const { ruta } of escrituras(entrada)) {
  // Crear una migración nueva, o tocar una que solo está en la rama de trabajo, se permite.
  if (MIGRACION.test(ruta) && existsSync(ruta) && yaFusionada(ruta, true)) bloquear(`${path.basename(ruta)}: ${REGLA}`);
}

const comando = comandoDe(entrada);
if (comando) {
  for (const t of trozos(comando)) {
    const p = palabras(t);
    const i = p.findIndex((x) =>
      /^(rm|del|Remove-Item|mv|move|Move-Item|sed|truncate|Set-Content|Clear-Content)$/i.test(x),
    );
    const git = p[0] === 'git' && /^(rm|mv)$/.test(p[1] ?? '');
    const sedSinI = p[i] === 'sed' && !p.some((x) => /^-[a-zA-Z]*i/.test(x) || x === '--in-place');
    if ((i === -1 || sedSinI) && !git) continue;
    // >, >> sobre una migración también la reescriben.
    const destinos = p.filter((x) => MIGRACION.test(normal(x)));
    for (const d of destinos) {
      const abs = path.resolve(cwd, d);
      if (existsSync(abs) && yaFusionada(abs, true)) bloquear(`${path.basename(d)}: ${REGLA}`);
    }
  }
  const redireccion = /(?:^|[^>])>{1,2}\s*("?)([^\s"]*supabase[\\/]migrations[\\/][^\s"]+\.sql)\1/.exec(comando);
  const absR = redireccion && path.resolve(cwd, redireccion[2]);
  if (absR && existsSync(absR) && yaFusionada(absR, true)) {
    bloquear(`${path.basename(redireccion[2])}: ${REGLA}`);
  }
}
