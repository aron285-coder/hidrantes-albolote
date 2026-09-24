import { describe, expect, it } from 'vitest';
import { fuentesFueraDeSitio, scriptsIniciales } from './presupuesto.ts';

describe('presupuesto: lo que carga la pantalla de entrada (TR-11, TR-103)', () => {
  it('toma el script de entrada y sus modulepreload, sin repetir', () => {
    const html =
      '<script type="module" crossorigin src="/assets/index-a.js"></script>' +
      '<link rel="modulepreload" crossorigin href="/assets/estado-b.js">' +
      '<link rel="modulepreload" crossorigin href="/assets/estado-b.js">' +
      '<link rel="stylesheet" crossorigin href="/assets/index-c.css">';
    expect(scriptsIniciales(html)).toEqual(['/assets/index-a.js', '/assets/estado-b.js']);
  });

  it('acepta React, Supabase, las librerías propias y las pantallas sin sesión', () => {
    expect(
      fuentesFueraDeSitio([
        '../../node_modules/react-dom/cjs/react-dom-client.production.js',
        '../../node_modules/@supabase/auth-js/dist/module/GoTrueClient.js',
        '../../node_modules/pmtiles/dist/esm/index.js',
        '../../src/lib/mapabase.ts',
        '../../src/paginas/Entrada.tsx',
        '../../src/paginas/Legal.tsx',
        '../../src/paginas/NoAutorizado.tsx',
        '../../src/App.tsx',
      ]),
    ).toEqual([]);
  });

  it('señala Leaflet, protomaps y las pantallas con sesión, también con rutas de Windows', () => {
    expect(
      fuentesFueraDeSitio([
        '../../node_modules/leaflet/dist/leaflet-src.js',
        '../../node_modules/protomaps-leaflet/dist/esm/index.js',
        '..\\..\\node_modules\\@protomaps\\basemaps\\dist\\index.js',
        '../../src/paginas/Mapa.tsx',
        '../../src/paginas/RutasDentro.tsx',
        '../../src/paginas/PanelJefatura.tsx',
        '../../src/paginas/Mapa.tsx',
      ]),
    ).toEqual([
      '../../node_modules/leaflet/dist/leaflet-src.js',
      '../../node_modules/protomaps-leaflet/dist/esm/index.js',
      '../../src/paginas/Mapa.tsx',
      '../../src/paginas/PanelJefatura.tsx',
      '../../src/paginas/RutasDentro.tsx',
      '..\\..\\node_modules\\@protomaps\\basemaps\\dist\\index.js',
    ]);
  });

  it('no confunde una librería que solo se llama parecido', () => {
    expect(
      fuentesFueraDeSitio([
        '../../node_modules/leaflet-extra/index.js',
        '../../node_modules/@types/leaflet/index.d.ts',
      ]),
    ).toEqual([]);
  });
});
