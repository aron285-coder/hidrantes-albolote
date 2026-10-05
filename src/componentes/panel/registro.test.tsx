// docs/30 RV-127 (DEC-171): el Registro y el Historial del punto dicen qué cambió, con palabras.
// Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server, con la carga, el ancho y el
// diálogo simulados. La búsqueda y la paginación las cubre e2e.

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntradaRegistro } from '@/lib/panel/inventario';

const estado = vi.hoisted(() => ({ ancho: 'escritorio', datos: null as unknown }));

vi.mock('@/hooks/ancho', () => ({ useAncho: () => estado.ancho }));
vi.mock('@/hooks/carga', () => ({
  useCarga: () => ({
    estado: 'listo',
    datos: estado.datos,
    recargar: async () => undefined,
  }),
}));
vi.mock('./usar-panel', () => ({ usePanel: () => ({ busqueda: '', avisar: () => undefined }) }));
vi.mock('./Dialogo', () => ({
  Dialogo: ({ children }: { children: unknown }) => <div role="dialog">{children as never}</div>,
}));

const { default: Registro } = await import('./Registro');
const { DialogoHistorial } = await import('./dialogos');
type Punto = import('@/lib/puntos').Punto;

const ANTES = {
  id: 'b1',
  codigo: 'BOC-0001',
  tipo: 'boca_riego',
  diametro_mm: 45,
  caudal: 'no_funciona',
  racor: 'granada',
  descripcion_fallo: 'Tapa soldada',
  municipio: 'albolote',
  nucleo: 'Barrio Seco',
  actualizado_en: '2026-09-01T00:00:00Z',
  lat: 37.23,
  lng: -3.65,
};

const EDICION: EntradaRegistro = {
  id: 7,
  momento: '2026-10-05T10:00:00Z',
  actor: 'jefe@example.org',
  es_admin: true,
  accion: 'edicion_admin',
  codigo: 'BOC-0001',
  resumen:
    'edicion_admin · BOC-0001 · actualizado_en, caudal, codigo, desplazamiento_m, dispositivo_id, lat, lng, racor',
  antes: ANTES,
  despues: {
    ...ANTES,
    caudal: 'regular',
    racor: 'directo',
    descripcion_fallo: 'Tapa soldada',
    actualizado_en: '2026-10-05T10:00:00Z',
    lat: 37.23005,
    desplazamiento_m: 6.2,
    dispositivo_id: 'abcd-1234',
  },
};

const LEGIBLE = 'Estado: No funciona → Regular · Enganche: Granada → Directo · Movido 6,2 m';
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  // Registro carga una página; el Historial, la lista de entradas del punto.
  estado.datos = { filas: [EDICION], total: 1 };
});

describe('Registro · columna Detalle (docs/30 RV-127)', () => {
  it('en la tabla, el detalle en palabras y sin claves técnicas', () => {
    estado.ancho = 'escritorio';
    const html = renderToStaticMarkup(<Registro />);
    expect(html).toContain('<table');
    expect(html).toContain(LEGIBLE);
    expect(texto(html)).not.toMatch(/actualizado_en|desplazamiento_m|dispositivo_id|abcd-1234|edicion_admin/);
  });

  it('en las filas apiladas del móvil, lo mismo', () => {
    estado.ancho = 'movil';
    const html = renderToStaticMarkup(<Registro />);
    expect(html).not.toContain('<table');
    expect(html).toContain(LEGIBLE);
    expect(texto(html)).not.toMatch(/actualizado_en|desplazamiento_m|dispositivo_id|abcd-1234|edicion_admin/);
  });
});

describe('Historial del punto (docs/30 RV-127)', () => {
  it('cada entrada lleva una segunda línea con el detalle legible', () => {
    estado.datos = [EDICION];
    const punto = { id: 'b1', codigo: 'BOC-0001' } as Punto;
    const html = renderToStaticMarkup(<DialogoHistorial punto={punto} alCerrar={() => undefined} />);
    expect(html).toMatch(new RegExp(`<p class="text-texto-suave[^"]*">${LEGIBLE}</p>`));
    expect(texto(html)).not.toMatch(/dispositivo_id|abcd-1234|actualizado_en/);
  });
});
