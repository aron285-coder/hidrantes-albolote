// docs/24 RV-99 y RV-100: «¿Qué hay aquí?» sin título visible ni «Junto a …», con «Añadir un punto
// aquí» como primera acción y único botón primario; como mucho un primario por hoja (06 §5,
// DEC-147). Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server.

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

// La hoja se pinta en <body> con un portal; sin DOM, se pinta en su sitio.
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (n: ReactNode) => n,
}));
// El portal recibe document.body como argumento.
vi.stubGlobal('document', { body: {} });
vi.mock('@/hooks/estado', () => ({ useConexion: () => 'bien' }));
// Con el callejero cargado, la calle más cercana es «Calle Real».
vi.mock('@/lib/callejero', () => ({
  callejeroCargado: { f: { calleCercana: () => 'Calle Real' }, datos: null },
  cargarCallejero: () => Promise.resolve(null),
}));

const { QueHayAqui } = await import('./QueHayAqui');
const { Ficha } = await import('./Ficha');
const { T } = await import('@/lib/textos');
const { textoUbicacion } = await import('@/lib/compartir');

const SITIO = { lat: 37.2305, lng: -3.656 };

const pintar = (n: ReactNode) => renderToStaticMarkup(<MemoryRouter>{n}</MemoryRouter>);

/** Los botones y enlaces, en orden, con su texto y si son primarios. */
function acciones(html: string) {
  return [...html.matchAll(/<(button|a)\b([^>]*)>(.*?)<\/\1>/gs)].map(([, , atributos, dentro]) => ({
    texto: dentro.replace(/<[^>]+>/g, '').trim(),
    // Primario: el Boton de 06 §5 o cualquier botón con el relleno naranja del primario.
    primario: /data-variante="primario"|bg-naranja-600/.test(atributos),
  }));
}

const PUNTO = {
  id: 'p1',
  codigo: 'HID-0147',
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion_fallo: null,
  descripcion: null,
  direccion: 'Calle Real 5',
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-01',
  actualizado_en: '2026-08-01T00:00:00Z',
  lat: SITIO.lat,
  lng: SITIO.lng,
  radio_px: 11,
  revision_caducada: false,
} as const;

describe('«¿Qué hay aquí?» (RV-99, RV-100)', () => {
  for (const enHoja of [true, false]) {
    const lugar = enHoja ? 'hoja del móvil' : 'panel flotante';

    it(`${lugar}: diálogo con nombre, sin título visible ni «Junto a»`, () => {
      const html = pintar(<QueHayAqui l={SITIO} alCerrar={() => {}} enHoja={enHoja} />);
      expect(html).toContain(`role="dialog"`);
      expect(html).toContain(`aria-label="${T.aqui.titulo}"`);
      expect(html.replace(/aria-label="[^"]*"/g, '')).not.toContain(T.aqui.titulo);
      expect(html).not.toContain('Junto a');
    });

    it(`${lugar}: «Añadir un punto aquí» es la primera acción y el único primario`, () => {
      const lista = acciones(pintar(<QueHayAqui l={SITIO} alCerrar={() => {}} enHoja={enHoja} />)).filter(
        (a) => a.texto,
      );
      expect(lista[0]).toEqual({ texto: T.aqui.anadirPunto, primario: true });
      expect(lista.filter((a) => a.primario)).toHaveLength(1);
      expect(lista.map((a) => a.texto)).toEqual(
        expect.arrayContaining([T.aqui.cercanosDesdeAqui, T.medir.desdeAqui, T.aqui.compartirUbicacion]),
      );
    });
  }

  it('la calle sigue en el texto de Compartir', () => {
    expect(textoUbicacion(SITIO, 'Calle Real')).toContain('Calle Real');
  });
});

describe('como mucho un primario por hoja (06 §5, DEC-147)', () => {
  it('ficha del punto', () => {
    const html = pintar(<Ficha punto={PUNTO} posicion={null} guardadoEn={null} alCerrar={() => {}} />);
    const lista = acciones(html);
    expect(lista.map((a) => a.texto)).toEqual(expect.arrayContaining([T.ficha.proponerCambio, T.ficha.comoLlegar]));
    expect(lista.filter((a) => a.primario).length).toBeLessThanOrEqual(1);
  });
});
