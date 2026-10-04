// docs/25 RV-110: el detalle de la cola, de arriba abajo, con el mapa en todas las operaciones, todos
// los datos del punto con lo que cambia marcado y las fotos para comparar. Vitest corre en Node, sin
// DOM: se pinta a HTML con react-dom/server (los efectos, y con ellos Leaflet, no corren).

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('../mapa/capas-leaflet', () => ({ capasDe: () => [] }));
vi.mock('../mapa/iconos-leaflet', () => ({ ICONO_PIN: null, iconoPunto: () => null }));
vi.mock('@/hooks/estado', () => ({ useModo: () => 'claro', usePuntos: () => ({ puntos: [] }) }));
vi.mock('./usar-panel', () => ({ usePanel: () => ({ avisar: () => undefined }) }));

const { DetallePropuesta } = await import('./DetallePropuesta');
const { MinimapaPropuesta } = await import('./MinimapaPropuesta');
const { planMapa } = await import('@/lib/panel/cola');
const { T } = await import('@/lib/textos');
type PropuestaPanel = import('@/lib/panel/cola').PropuestaPanel;
type Operacion = import('@/lib/propuestas').Operacion;

const ACTUAL = {
  codigo: 'HID-9001',
  tipo: 'hidrante' as const,
  diametro_mm: 100,
  caudal: 'bueno' as const,
  racor: null,
  descripcion: '[PRUEBA] Esquina con la plaza',
  descripcion_fallo: null,
  direccion: 'Calle Olivo 2',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-07-01',
  foto_path: 'fotos/actual-conexion.jpg',
  foto_sitio_path: 'fotos/actual-sitio.jpg',
};

function propuesta(operacion: Operacion, extra: Partial<PropuestaPanel> = {}): PropuestaPanel {
  const alta = operacion === 'alta';
  const conPin = alta || operacion === 'ubicacion';
  return {
    id: 'p1',
    operacion,
    estado: 'pendiente',
    creada_en: '2026-09-20T10:00:00Z',
    autor_nombre: 'Prueba',
    autor_apellido: 'Uno',
    punto_id: alta ? null : 'x1',
    codigo: alta ? null : 'HID-9001',
    datos: alta ? { tipo: 'hidrante', diametro_mm: 100, caudal: 'bueno' } : {},
    foto_path: null,
    direccion_sugerida: conPin ? 'Calle Olivo 8' : null,
    direccion_actual: alta ? null : 'Calle Olivo 2',
    lat: conPin ? 37.2704 : null,
    lng: conPin ? -3.6204 : null,
    antes: null,
    origen_ubicacion: conPin ? 'gps' : null,
    precision_gps_m: conPin ? 4 : null,
    distancia_gps_m: null,
    distancia_exif_m: null,
    fuera_de_zona: false,
    meses_desde_revision: null,
    duplicado_de: null,
    distancia_duplicado_m: null,
    codigo_duplicado: null,
    otra_medida: false,
    desactualizada: false,
    nucleo: 'Albolote',
    punto_actualizado_en: null,
    punto: alta ? null : ACTUAL,
    punto_lat: alta ? null : 37.27,
    punto_lng: alta ? null : -3.62,
    ...extra,
  };
}

const pintar = (p: PropuestaPanel) =>
  renderToStaticMarkup(<DetallePropuesta p={p} puntos={[]} radioDuplicado={25} alHecho={() => undefined} />);

/** Los campos de "Datos del punto", en orden: etiqueta y si lleva "CAMBIA". */
function campos(html: string) {
  return [...html.matchAll(/<div[^>]*data-campo="([^"]+)"([^>]*)>/g)].map(([, clave, resto]) => ({
    clave,
    cambia: /data-cambia="true"/.test(resto!),
  }));
}

const figuras = (html: string) => [...html.matchAll(/<figcaption[^>]*>(.*?)<\/figcaption>/g)].map((m) => m[1]);

describe('DetallePropuesta (RV-110)', () => {
  it('corregir datos: se ven todos los campos y solo el diámetro lleva "CAMBIA"', () => {
    const html = pintar(propuesta('datos', { datos: { diametro_mm: 70 }, antes: { diametro_mm: 100 } }));
    const c = campos(html);
    expect(c.length).toBeGreaterThanOrEqual(12);
    expect(c.filter((x) => x.cambia).map((x) => x.clave)).toEqual(['diametro_mm']);
    for (const etiqueta of [
      T.panelCola.campoCodigo,
      T.panelCola.campoTipo,
      T.panelCola.campoDiametro,
      T.panelCola.campoEstado,
      T.panelCola.campoDescripcion,
      T.ficha.direccion,
      T.panelCola.campoNucleo,
      T.coordenadas.decimal,
      T.coordenadas.utm,
      T.panelCola.campoUltimaRevision,
      T.panelCola.campoOrigen,
      T.panelCola.campoPropuestoPor,
    ]) {
      expect(html).toContain(`>${etiqueta}<`);
    }
    expect(html).toContain(T.panelCola.cambia);
    expect(html).toContain(T.panelCola.cambios(1));
    expect(html).toContain(T.panelCola.restoIgual);
  });

  it('en un alta, el código dice "se asigna al aprobar"', () => {
    const html = pintar(propuesta('alta'));
    expect(html).toContain(T.panelCola.seAsignaAlAprobar);
    expect(html).toContain(T.panelCola.datosVoluntario(3));
  });

  it('en una ubicación hay tres fotos y la primera es la actual del punto', () => {
    const html = pintar(
      propuesta('ubicacion', { foto_path: 'fotos/n-conexion.jpg', foto_sitio_path: 'fotos/n-sitio.jpg' }),
    );
    expect(figuras(html)).toEqual([
      T.panelCola.fotoActualPunto,
      T.panelCola.fotoNueva(T.panelCola.conexion),
      T.panelCola.fotoNueva(T.panelCola.sitio),
    ]);
  });

  it('sin fotos nuevas, las actuales y "no trae nuevas"', () => {
    const html = pintar(propuesta('datos', { datos: { descripcion: 'Otra' } }));
    expect(html).toContain(T.panelCola.noTraeNuevas);
    expect(figuras(html)).toHaveLength(2);
  });

  it.each(['alta', 'revision', 'estado', 'datos', 'ubicacion', 'retirada'] as Operacion[])('hay mapa en %s', (op) => {
    expect(pintar(propuesta(op))).toContain('data-testid="minimapa-propuesta"');
  });

  it('los tres botones, fijos abajo; en el móvil "Corregir" con el nombre largo para el lector', () => {
    const html = pintar(propuesta('estado', { datos: { caudal: 'regular' }, antes: { caudal: 'bueno' } }));
    const barra = html.slice(html.indexOf('data-testid="acciones-propuesta"'));
    expect(barra).toContain(T.panelCola.aprobar);
    expect(barra).toContain(`aria-label="${T.panelCola.aprobarConCorrecciones}"`);
    expect(barra).toContain(T.panelCola.corregirCorto);
    expect(barra).toContain(T.panelCola.rechazar);
  });

  it('el historial es el mismo detalle en solo lectura, sin botones', () => {
    const html = pintar(
      propuesta('datos', { estado: 'rechazada', motivo_rechazo: 'No', revisada_por: 'x', revisada_en: '2026-09-21' }),
    );
    expect(html).not.toContain('data-testid="acciones-propuesta"');
    expect(html).toContain('data-testid="minimapa-propuesta"');
    expect(campos(html).length).toBeGreaterThanOrEqual(12);
  });
});

describe('MinimapaPropuesta (RV-110)', () => {
  const pintarMapa = (p: PropuestaPanel) =>
    renderToStaticMarkup(<MinimapaPropuesta plan={planMapa(p)} radioDuplicado={25} />);

  it('una ubicación se abre en Satélite y su leyenda dice las dos posiciones', () => {
    const html = pintarMapa(propuesta('ubicacion'));
    expect(html).toContain('data-capa="satelite"');
    expect(html).toContain(T.panelCola.leyendaAhora);
    expect(html).toContain(T.panelCola.leyendaPropuesta);
    expect(html).toContain(T.panelCola.abrirEnGrande);
  });

  it('un alta, en el Mapa, con el círculo de duplicado en la leyenda', () => {
    const html = pintarMapa(propuesta('alta'));
    expect(html).toContain('data-capa="base"');
    expect(html).toContain(T.panelCola.leyendaRadio(25));
  });

  it('sin posición, lo dice en vez de un mapa vacío', () => {
    const html = pintarMapa(propuesta('datos', { punto_lat: null, punto_lng: null }));
    expect(html).toContain(T.panelCola.sinPosicion);
  });
});
