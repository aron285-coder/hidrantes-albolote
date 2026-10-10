// docs/34 RV-358 (DEC-195): los enlaces relativos de la documentación llevan a algo que existe. Así,
// archivar una especificación no rompe nada sin avisar.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = path.resolve(import.meta.dirname, '..');
const docs = path.join(raiz, 'docs');

function recorrer(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? recorrer(p) : [p];
  });
}

const enDocs = recorrer(docs);
// Los .md y .html de docs/ y los .md de la raíz (README, CLAUDE.md, CHANGELOG…); el index.html de la raíz
// es la app, no documentación.
const documentos = [
  ...enDocs.filter((p) => /\.(md|html)$/i.test(p)),
  ...readdirSync(raiz)
    .filter((n) => /\.md$/i.test(n))
    .map((n) => path.join(raiz, n)),
];

/** Destinos relativos de un documento: enlaces e imágenes de Markdown y `href`/`src` de HTML. */
export function destinos(texto: string): string[] {
  // Sin bloques de código: un ejemplo con `](…)` no es un enlace.
  const limpio = texto.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const crudos = [
    ...[...limpio.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]!),
    ...[...limpio.matchAll(/\b(?:href|src)\s*=\s*"([^"]+)"/gi)].map((m) => m[1]!),
  ];
  return (
    crudos
      // Fuera los externos, las anclas y lo que arma el script de un mockup ('+img+', ${…}).
      .filter((d) => !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(d) && !/['+]|\$\{/.test(d))
      .map((d) => decodeURI(d.split('#')[0]!.split('?')[0]!))
      .filter((d) => d.length > 0)
  );
}

const resueltos = documentos.flatMap((doc) =>
  destinos(readFileSync(doc, 'utf8')).map((d) => ({
    doc: path.relative(raiz, doc).replaceAll('\\', '/'),
    destino: d,
    ruta: d.startsWith('/') ? path.join(raiz, 'public', d) : path.resolve(path.dirname(doc), d),
  })),
);

describe('enlaces de la documentación (docs/34 RV-358)', () => {
  it('extrae enlaces de Markdown y de HTML, y no los de un bloque de código', () => {
    expect(destinos('[a](01-x.md#s) ![i](img/a.png) <a href="b.html">b</a> [w](https://x) `[c](d.md)`')).toEqual([
      '01-x.md',
      'img/a.png',
      'b.html',
    ]);
  });

  it('cada enlace relativo lleva a un archivo que existe', () => {
    const rotos = resueltos.filter((r) => !existsSync(r.ruta)).map((r) => `${r.doc} → ${r.destino}`);
    expect(rotos).toEqual([]);
  });
});
