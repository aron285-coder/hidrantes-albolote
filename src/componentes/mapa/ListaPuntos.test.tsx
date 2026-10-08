// docs/25 RV-106: la fila de la Lista sin la dirección (solo en la ficha), con la distancia a la
// derecha cuando hay posición, y "sin revisar desde hace N" en el naranja de aviso, no en el rojo de
// malo. Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server.

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  posicion: null as { lat: number; lng: number; precision: number } | null,
}));

vi.mock('@/hooks/estado', () => ({
  usePuntos: () => ({ puntos: PUNTOS, cargado: true }),
  usePosicion: () => {},
}));
vi.mock('@/hooks/busqueda', () => ({
  useBusquedaLugares: () => ({}),
  hayLugares: () => false,
  useIrADestino: () => () => {},
}));
vi.mock('@/lib/almacen', () => ({ leer: () => null, escribir: () => {} }));
vi.mock('@/lib/posicion', () => ({
  posicionActual: () => estado.posicion,
  activarPosicion: () => {},
}));

const { ListaPuntos } = await import('./ListaPuntos');
const { T } = await import('@/lib/textos');
const { hace } = await import('@/lib/formato');

const BASE = {
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion_fallo: null,
  descripcion: null,
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-01',
  actualizado_en: '2026-08-01T00:00:00Z',
  radio_px: 11,
  revision_caducada: false,
} as const;

// A unos 120 m y a unos 1,1 km al norte de la posición de prueba.
const PUNTOS = [
  { ...BASE, id: 'p1', codigo: 'HID-0147', direccion: 'Calle Real 5', lat: 37.23158, lng: -3.656 },
  { ...BASE, id: 'p2', codigo: 'HID-0148', direccion: null, lat: 37.2404, lng: -3.656 },
  {
    ...BASE,
    id: 'p3',
    codigo: 'BOC-0088',
    tipo: 'boca_riego',
    diametro_mm: 45,
    caudal: 'regular',
    direccion: 'Calle Ancha 3',
    fecha_ultima_revision: '2025-08-01',
    revision_caducada: true,
    lat: 37.2404,
    lng: -3.656,
  },
];

const AQUI = { lat: 37.2305, lng: -3.656, precision: 8 };

const pintar = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ListaPuntos alElegir={() => {}} />
    </MemoryRouter>,
  );

/** El texto que se ve en cada fila de la lista: sin etiquetas ni lo que es solo para el lector de pantalla. */
const filas = (html: string) =>
  [...html.matchAll(/<li>(.*?)<\/li>/gs)].map(([, f]) =>
    f
      .replace(/<span class="sr-only">.*?<\/span>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );

describe('Lista de puntos (docs/25 RV-106)', () => {
  beforeEach(() => {
    estado.posicion = null;
  });

  it('la fila no enseña la dirección ni "sin dirección"', () => {
    estado.posicion = AQUI;
    const html = pintar();
    expect(filas(html)).toHaveLength(3);
    expect(html).not.toContain('Calle Real');
    expect(html).not.toContain('Calle Ancha');
    expect(html).not.toContain(T.ficha.sinDireccion);
  });

  it('la segunda línea es estado y revisión', () => {
    const primera = filas(pintar()).find((f) => f.includes('HID-0147'));
    expect(primera).toContain(`Bueno · ${T.mapa.revisado(hace(BASE.fecha_ultima_revision))}`);
  });

  it('con posición, cada fila lleva la distancia con el formato de Cercanos', () => {
    estado.posicion = AQUI;
    const [cerca, lejos] = filas(pintar());
    expect(cerca).toMatch(/\b120 m$/);
    expect(lejos).toMatch(/\b1,1 km$/);
    // A la vista, solo la distancia; "desde ti" lo oye el lector de pantalla, no se ve.
    expect(cerca).not.toContain(T.mapa.desdeTi);
    expect(pintar()).toContain(`<span class="sr-only"> ${T.mapa.desdeTi}</span>`);
  });

  it('sin posición no hay distancia, ni un guion en su lugar', () => {
    for (const fila of filas(pintar())) {
      expect(fila).not.toMatch(/\d m$|km$/);
      expect(fila).not.toMatch(/[—-]$/);
    }
  });

  it('caducada: "sin revisar desde hace N" en el naranja de aviso, no en el rojo de malo', () => {
    const html = pintar();
    const caducada = filas(html).find((f) => f.includes('BOC-0088'));
    expect(caducada).toContain(`Regular · ${T.mapa.sinRevisarPalabra} ${T.mapa.sinRevisarFecha(hace('2025-08-01'))}`);
    expect(caducada).not.toContain(`${T.mapa.sinRevisar} ·`);
    const fila = html.match(/<li>((?:(?!<\/li>).)*BOC-0088.*?)<\/li>/s)?.[1] ?? '';
    expect(fila).toContain('text-naranja-texto');
    expect(fila).not.toContain('text-rojo-700');
    // Si no cabe, se recorta solo la fecha: "sin revisar" y el estado no se encogen.
    expect(fila).toMatch(new RegExp(`<span class="shrink-0">${T.mapa.sinRevisarPalabra} </span>`));
    expect(fila).toMatch(/<span class="truncate">desde hace/);
  });
});

describe('Lista y lector de pantalla (docs/31 RV-157)', () => {
  it('la lista no es una región viva: no se lee entera cada vez que cambia', () => {
    estado.posicion = AQUI;
    expect(pintar()).not.toMatch(/<ul[^>]*aria-live/);
  });

  it('hay una región de estado para el número de resultados, vacía sin filtro', () => {
    const html = pintar();
    const region = html.match(/<p role="status"[^>]*>(.*?)<\/p>/s);
    expect(region).not.toBeNull();
    expect(region![1]).toBe('');
  });

  it('el orden por distancia no cambia por moverse 10 m o menos', async () => {
    const { posicionParaOrden } = await import('@/lib/puntos');
    const a = { lat: 37.2305, lng: -3.656 };
    const cerca = { lat: 37.23058, lng: -3.656 }; // unos 9 m al norte
    const lejos = { lat: 37.2306, lng: -3.656 }; // unos 11 m
    expect(posicionParaOrden(a, cerca)).toBe(a);
    expect(posicionParaOrden(a, lejos)).toBe(lejos);
    expect(posicionParaOrden(null, a)).toBe(a);
    expect(posicionParaOrden(a, null)).toBeNull();
  });
});
