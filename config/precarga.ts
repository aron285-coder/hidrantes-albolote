// Precarga de las pantallas con sesión (TR-10, TR-103). La pantalla de entrada no las descarga: van
// en la porción de src/paginas/RutasDentro.tsx. Pero quien ya tiene sesión las necesita al momento,
// y pedirlas cuando termina el JavaScript inicial añade idas y vueltas enteras (300 ms cada una en
// 3G): la del JavaScript de la porción y, después, la de su CSS (el de Leaflet), que Vite espera
// antes de pintar. Por eso index.html lleva un script clásico diminuto, antes del de entrada, que
// solo si hay una sesión guardada añade un `modulepreload` por cada archivo de la porción y su hoja
// de estilos: todo se descarga en paralelo con lo demás. Vite ve esos <link> y no los repite.
// Es un archivo propio y no un script en línea, para que la CSP siga siendo `script-src 'self'`.
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** Lo que se usa de cada archivo del bundle: los chunks con sus imports estáticos y su CSS. */
export interface ArchivoBundle {
  type: 'chunk' | 'asset';
  fileName: string;
  isEntry?: boolean;
  facadeModuleId?: string | null;
  imports?: string[];
  viteMetadata?: { importedCss?: Set<string> };
  source?: string | Uint8Array;
}

export interface Porcion {
  js: string[];
  css: string[];
}

function cierre(bundle: Record<string, ArchivoBundle>, desde: string): string[] {
  const vistos: string[] = [];
  const pendientes = [desde];
  while (pendientes.length) {
    const actual = pendientes.shift()!;
    if (vistos.includes(actual)) continue;
    vistos.push(actual);
    pendientes.push(...(bundle[actual]?.imports ?? []));
  }
  return vistos;
}

const cssDe = (bundle: Record<string, ArchivoBundle>, chunks: string[]) =>
  chunks.flatMap((f) => [...(bundle[f]?.viteMetadata?.importedCss ?? [])]);

/**
 * Lo que hay que precargar para `modulo`: su chunk, lo que importa y sus hojas de estilos, menos lo
 * que ya trae el script de entrada. Vacío si el módulo no tiene porción propia.
 */
export function archivosDePorcion(bundle: Record<string, ArchivoBundle>, modulo: string): Porcion {
  const chunks = Object.values(bundle).filter((a) => a.type === 'chunk');
  const entrada = chunks.find((a) => a.isEntry);
  const porcion = chunks.find((a) => a.facadeModuleId?.replace(/\\/g, '/').endsWith(modulo));
  if (!entrada || !porcion || porcion === entrada) return { js: [], css: [] };
  const inicial = cierre(bundle, entrada.fileName);
  const cssInicial = new Set(cssDe(bundle, inicial));
  const js = cierre(bundle, porcion.fileName).filter((f) => !inicial.includes(f));
  const css = [...new Set(cssDe(bundle, js))].filter((f) => !cssInicial.has(f));
  return { js, css };
}

/**
 * El script clásico. Mira lo mismo que `inicial()` en src/lib/acceso.ts, por encima: el token del
 * voluntario, la sesión de Google o la vuelta de Google (`?code=`). Equivocarse aquí no rompe nada:
 * de más, se descarga antes lo que se iba a descargar igual; de menos, se pierde el paralelismo.
 */
export function scriptPrecarga({ js, css }: Porcion): string {
  const enlaces = JSON.stringify([
    ...js.map((f) => ['modulepreload', `/${f}`]),
    ...css.map((f) => ['stylesheet', `/${f}`]),
  ]);
  return (
    '(function(){try{var l=localStorage;' +
    'if(!(l.getItem("hidrantes.token")||l.getItem("hidrantes.auth")||/[?&]code=/.test(location.search)))return;' +
    `${enlaces}.forEach(function(a){var e=document.createElement("link");` +
    'e.rel=a[0];e.crossOrigin="";e.href=a[1];document.head.appendChild(e)})}catch(e){}})();\n'
  );
}

/** Mete la etiqueta justo antes del script de entrada: así corre antes de que este empiece. */
export function conScriptPrecarga(html: string, ruta: string): string {
  const entrada = html.match(/<script type="module"[^>]*><\/script>/);
  if (!entrada) throw new Error('precarga: no encuentro el script de entrada en index.html');
  return html.replace(entrada[0], `<script src="/${ruta}"></script>\n    ${entrada[0]}`);
}

export function precargaPlugin(modulo = 'src/paginas/RutasDentro.tsx'): Plugin {
  return {
    name: 'hidrantes-precarga',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opciones, bundle) {
      const porcion = archivosDePorcion(bundle as unknown as Record<string, ArchivoBundle>, modulo);
      if (porcion.js.length === 0) this.error(`precarga: ${modulo} no tiene porción propia en el build`);
      const html = bundle['index.html'] as unknown as ArchivoBundle | undefined;
      if (!html || typeof html.source !== 'string') this.error('precarga: falta index.html en el build');
      const fuente = scriptPrecarga(porcion);
      const hash = createHash('sha256').update(fuente).digest('hex').slice(0, 8);
      const ruta = `assets/precarga-${hash}.js`;
      this.emitFile({ type: 'asset', fileName: ruta, source: fuente });
      html.source = conScriptPrecarga(html.source, ruta);
    },
  };
}
