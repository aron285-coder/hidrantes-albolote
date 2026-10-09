// docs/33 RV-312 (U3): si lo escrito lleva un número, las direcciones van antes que las calles; si no,
// como siempre. En el orden del documento, también para el lector de pantalla. Vitest corre en Node,
// sin DOM: se pinta a HTML con react-dom/server.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Lugares } from '@/hooks/busqueda';
import { ResultadosCallesYDirecciones } from './ResultadosLugares';
import { T } from '@/lib/textos';

const LUGARES: Lugares = {
  coordenadas: null,
  fueraDeZona: false,
  enlaceCorto: false,
  calles: [{ n: 'Calle Real', t: 'calle', m: 'albolote', g: [] }],
  direcciones: {
    estado: 'ok',
    resultados: [{ etiqueta: 'Calle Real, 10, Albolote', tipo: 'portal', lat: 37.23, lng: -3.65 } as never],
  },
};

/** Los nombres de los grupos, en el orden del documento. */
const grupos = (direccionesPrimero: boolean) =>
  [
    ...renderToStaticMarkup(
      <ResultadosCallesYDirecciones lugares={LUGARES} alElegir={() => {}} direccionesPrimero={direccionesPrimero} />,
    ).matchAll(/role="group" aria-label="([^"]+)"/g),
  ].map(([, nombre]) => nombre);

describe('ResultadosCallesYDirecciones · orden (RV-312)', () => {
  it('con un número, las direcciones primero', () => {
    expect(grupos(true)).toEqual([T.busqueda.direcciones, T.busqueda.calles]);
  });

  it('sin número, las calles primero', () => {
    expect(grupos(false)).toEqual([T.busqueda.calles, T.busqueda.direcciones]);
  });
});
