import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { type ArchivoBundle, archivosDePorcion, conScriptPrecarga, scriptPrecarga } from './precarga.ts';

const chunk = (fileName: string, imports: string[], extra: Partial<ArchivoBundle> = {}): ArchivoBundle => ({
  type: 'chunk',
  fileName,
  imports,
  facadeModuleId: null,
  ...extra,
});

function bundle(...archivos: ArchivoBundle[]): Record<string, ArchivoBundle> {
  return Object.fromEntries(archivos.map((a) => [a.fileName, a]));
}

describe('precarga de las pantallas con sesión (TR-10, TR-103)', () => {
  const b = bundle(
    chunk('assets/index.js', ['assets/react.js', 'assets/estado.js'], {
      isEntry: true,
      facadeModuleId: '/r/src/main.tsx',
      viteMetadata: { importedCss: new Set(['assets/index.css']) },
    }),
    chunk('assets/react.js', []),
    chunk('assets/estado.js', ['assets/react.js']),
    chunk('assets/RutasDentro.js', ['assets/leaflet.js', 'assets/estado.js'], {
      facadeModuleId: 'C:\\r\\src\\paginas\\RutasDentro.tsx',
    }),
    chunk('assets/leaflet.js', ['assets/geometria.js', 'assets/react.js'], {
      viteMetadata: { importedCss: new Set(['assets/leaflet.css', 'assets/index.css']) },
    }),
    chunk('assets/geometria.js', []),
    chunk('assets/PanelJefatura.js', ['assets/react.js'], { facadeModuleId: '/r/src/paginas/PanelJefatura.tsx' }),
    { type: 'asset', fileName: 'index.html', source: '' },
  );

  it('precarga la porción, lo que importa y su CSS, sin repetir lo que ya trae la entrada', () => {
    expect(archivosDePorcion(b, 'src/paginas/RutasDentro.tsx')).toEqual({
      js: ['assets/RutasDentro.js', 'assets/leaflet.js', 'assets/geometria.js'],
      css: ['assets/leaflet.css'],
    });
  });

  it('sin porción propia no hay nada que precargar', () => {
    expect(archivosDePorcion(b, 'src/paginas/NoExiste.tsx')).toEqual({ js: [], css: [] });
    expect(archivosDePorcion(b, 'src/main.tsx')).toEqual({ js: [], css: [] });
  });

  function ejecutar(guardado: Record<string, string>, search = '') {
    const enlaces: Record<string, string>[] = [];
    const contexto = {
      localStorage: { getItem: (k: string) => guardado[k] ?? null },
      location: { search },
      document: {
        createElement: () => ({}) as Record<string, string>,
        head: { appendChild: (e: Record<string, string>) => enlaces.push(e) },
      },
    };
    runInNewContext(
      scriptPrecarga({ js: ['assets/RutasDentro.js', 'assets/leaflet.js'], css: ['assets/leaflet.css'] }),
      contexto,
    );
    return enlaces;
  }

  it('con el token del voluntario, un modulepreload por archivo y la hoja de estilos', () => {
    expect(ejecutar({ 'hidrantes.token': '"t"' })).toEqual([
      { rel: 'modulepreload', crossOrigin: '', href: '/assets/RutasDentro.js' },
      { rel: 'modulepreload', crossOrigin: '', href: '/assets/leaflet.js' },
      { rel: 'stylesheet', crossOrigin: '', href: '/assets/leaflet.css' },
    ]);
  });

  it('con la sesión de Google o al volver de Google, también', () => {
    expect(ejecutar({ 'hidrantes.auth': '{}' })).toHaveLength(3);
    expect(ejecutar({}, '?code=abc')).toHaveLength(3);
  });

  it('sin sesión no precarga nada: la pantalla de entrada no descarga el mapa', () => {
    expect(ejecutar({})).toEqual([]);
    expect(ejecutar({ 'hidrantes.firma': '{}' }, '?codigo=1')).toEqual([]);
  });

  it('si localStorage falla (modo privado), no rompe la página', () => {
    const contexto = {
      localStorage: {
        getItem: () => {
          throw new Error('bloqueado');
        },
      },
      location: { search: '' },
      document: {},
    };
    expect(() => runInNewContext(scriptPrecarga({ js: ['assets/a.js'], css: [] }), contexto)).not.toThrow();
  });

  it('la etiqueta va justo antes del script de entrada', () => {
    const html =
      '<head>\n    <script type="module" crossorigin src="/assets/index.js"></script>\n' +
      '    <link rel="modulepreload" crossorigin href="/assets/estado.js">\n</head>';
    expect(conScriptPrecarga(html, 'assets/precarga-1.js')).toBe(
      '<head>\n    <script src="/assets/precarga-1.js"></script>\n' +
        '    <script type="module" crossorigin src="/assets/index.js"></script>\n' +
        '    <link rel="modulepreload" crossorigin href="/assets/estado.js">\n</head>',
    );
    expect(() => conScriptPrecarga('<head></head>', 'x.js')).toThrow(/script de entrada/);
  });
});
