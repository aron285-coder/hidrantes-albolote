// docs/25 RV-109 (DEC-157): cada coordenada lleva el nombre de su sistema, WGS84 y ETRS89, en la
// ficha y en «¿Qué hay aquí?», que pintan las dos este bloque. Vitest corre en Node, sin DOM: se
// pinta a HTML con react-dom/server.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BloqueCoordenadas } from './Coordenadas';
import { T } from '@/lib/textos';

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

describe('BloqueCoordenadas (RV-109)', () => {
  const html = renderToStaticMarkup(<BloqueCoordenadas l={{ lat: 37.2305, lng: -3.656 }} />);

  it('las etiquetas dicen el sistema: «WGS84 · grados decimales» y «ETRS89 · UTM huso 30N»', () => {
    expect(T.coordenadas.decimal).toBe('WGS84 · grados decimales');
    expect(T.coordenadas.utm).toBe('ETRS89 · UTM huso 30N');
    expect(texto(html)).toEqual([
      T.coordenadas.titulo,
      'WGS84 · grados decimales',
      '37.230500, -3.656000',
      'ETRS89 · UTM huso 30N',
      '30S 441808 4120645',
    ]);
  });

  it('cada línea tiene su botón de copiar, nombrado con el sistema', () => {
    expect(html).toContain(`aria-label="${T.coordenadas.copiar('WGS84 · grados decimales')}"`);
    expect(html).toContain(`aria-label="${T.coordenadas.copiar('ETRS89 · UTM huso 30N')}"`);
  });

  it('fuera del huso 30 solo sale la línea WGS84', () => {
    const fuera = texto(renderToStaticMarkup(<BloqueCoordenadas l={{ lat: 41.3874, lng: 2.1686 }} />));
    expect(fuera).toEqual([T.coordenadas.titulo, 'WGS84 · grados decimales', '41.387400, 2.168600']);
  });
});
