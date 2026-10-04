// La ficha de un punto (06 §5). Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server.

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Punto } from '@/tipos/punto';

// La hoja se pinta en <body> con un portal; sin DOM, se pinta en su sitio.
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (n: ReactNode) => n,
}));
vi.stubGlobal('document', { body: {} });
vi.mock('@/hooks/estado', () => ({ useConexion: () => 'bien' }));

const { Ficha } = await import('./Ficha');
const { T } = await import('@/lib/textos');

const BOCA: Punto = {
  id: 'p2',
  codigo: 'BOC-0031',
  tipo: 'boca_riego',
  diametro_mm: 45,
  caudal: 'bueno',
  racor: 'granada',
  descripcion_fallo: null,
  descripcion: null,
  direccion: 'Calle Real 5',
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-01',
  actualizado_en: '2026-08-01T00:00:00Z',
  lat: 37.2305,
  lng: -3.656,
  radio_px: 11,
  revision_caducada: false,
};

const pintar = (p: Punto) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <Ficha punto={p} posicion={null} guardadoEn={null} alCerrar={() => {}} />
    </MemoryRouter>,
  );

/** El texto que se lee, sin etiquetas. */
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// docs/25 RV-112 (DEC-163): en una boca, el tipo de enganche; nunca «racor».
describe('tipo de enganche en la ficha (RV-112)', () => {
  it('una boca enseña "Enganche Granada" y no dice racor', () => {
    const t = texto(pintar(BOCA));
    expect(t).toContain(T.ficha.racor('Granada'));
    expect(t).toContain('Enganche Granada');
    expect(t).not.toMatch(/racor/i);
  });

  it('un hidrante no enseña enganche', () => {
    const t = texto(pintar({ ...BOCA, codigo: 'HID-0001', tipo: 'hidrante', diametro_mm: 100, racor: null }));
    expect(t).not.toMatch(/enganche/i);
  });
});
