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
  renderToStaticMarkup(
    <DetallePropuesta p={p} puntos={[]} radioDuplicado={25} alHecho={() => undefined} alRecargar={async () => true} />,
  );

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

// docs/28 RV-115 (DEC-166): fuera los chips de señales y, en un alta, la línea "N datos del voluntario".
describe('DetallePropuesta sin señales (RV-115)', () => {
  // Todo lo que antes salía como chip: pin a mano lejos del GPS, foto lejos, revisión anterior, con
  // foto y sin foto del sitio.
  const conTodo: Partial<PropuestaPanel> = {
    origen_ubicacion: 'manual',
    precision_gps_m: 35,
    distancia_gps_m: 40,
    distancia_exif_m: 120,
    meses_desde_revision: 14,
    foto_path: 'fotos/n-conexion.jpg',
    sin_foto_sitio: true,
  };

  /** El trozo de HTML de la fila `clave` de "Datos del punto". */
  const fila = (html: string, clave: string) => {
    const i = html.indexOf(`data-campo="${clave}"`);
    return html.slice(i, html.indexOf('data-campo=', i + 1));
  };

  it.each(['alta', 'revision', 'ubicacion'] as Operacion[])('%s: sin la lista de señales ni sus textos', (op) => {
    const html = pintar(propuesta(op, conTodo));
    expect(html).not.toContain('aria-label="Señales de fiabilidad"');
    for (const t of [
      'Con foto',
      'La foto se hizo',
      'Pin puesto a mano ·',
      'Revisión anterior',
      '⚠ sin foto del sitio',
    ]) {
      expect(html).not.toContain(t);
    }
  });

  // Lo que decían los chips sigue en otro sitio del detalle (la tabla de docs/28 §1).
  it('sin foto del sitio: una línea en el título de "Fotos", no un chip', () => {
    const html = pintar(propuesta('alta', conTodo));
    const i = html.indexOf('id="fotos-propuesta"');
    expect(html.slice(i, html.indexOf('</h3>', i))).toContain(T.panelCola.sinFotoSitio);
    expect(pintar(propuesta('alta'))).not.toContain(T.panelCola.sinFotoSitio);
  });

  it('fuera de zona se ve en la cabecera aunque la propuesta tenga núcleo', () => {
    const html = pintar(propuesta('ubicacion', { fuera_de_zona: true, nucleo: 'Albolote' }));
    expect(html).toContain(`Albolote · ${T.panelCola.fueraDeZona}`);
    expect(pintar(propuesta('ubicacion', { fuera_de_zona: true, nucleo: null }))).toContain(
      ` · ${T.panelCola.fueraDeZona}</span>`,
    );
    expect(pintar(propuesta('ubicacion'))).not.toContain(T.panelCola.fueraDeZona);
  });

  it('un duplicado que no está en el inventario cargado se dice con su código y distancia', () => {
    const html = pintar(
      propuesta('alta', { duplicado_de: 'no-cargado', codigo_duplicado: 'BOC-0088', distancia_duplicado_m: 8 }),
    );
    expect(html).toContain(T.panelCola.duplicadoSinComparar('BOC-0088', '8 m'));
    expect(html).not.toContain(T.panelCola.posibleDuplicado);
  });

  it('en un alta, solo el título "Datos del punto", sin "datos del voluntario" ni "deduce el sistema"', () => {
    const html = pintar(propuesta('alta'));
    const i = html.indexOf('id="datos-del-punto"');
    const titulo = html.slice(i, html.indexOf('</h3>', i));
    expect(titulo).toContain(T.panelCola.datosDelPunto);
    expect(titulo).not.toContain('<small');
    expect(html).not.toContain('datos del voluntario');
    expect(html).not.toContain('deduce el sistema');
  });

  it('en una revisión sigue "1 cambio · el resto se queda igual"', () => {
    const html = pintar(propuesta('revision', { datos: { caudal: 'regular' }, antes: { caudal: 'bueno' } }));
    expect(html).toContain(`${T.panelCola.cambios(1)}</b> · ${T.panelCola.restoIgual}`);
  });

  it('la fila "Origen de la ubicación" sigue diciendo GPS o pin a mano', () => {
    expect(fila(pintar(propuesta('alta')), 'origen')).toContain(T.panelCola.origenGps(4));
    expect(fila(pintar(propuesta('ubicacion', conTodo)), 'origen')).toContain(T.panelCola.origenManual);
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

  it('sin el radio de config, ni círculo ni leyenda de un radio supuesto', () => {
    const html = renderToStaticMarkup(<MinimapaPropuesta plan={planMapa(propuesta('alta'))} radioDuplicado={null} />);
    expect(html).not.toContain(T.panelCola.leyendaRadio(25));
  });

  it('sin posición, lo dice en vez de un mapa vacío', () => {
    const html = pintarMapa(propuesta('datos', { punto_lat: null, punto_lng: null }));
    expect(html).toContain(T.panelCola.sinPosicion);
  });
});

describe('historial de la propuesta (docs/32 RV-255)', () => {
  it('las correcciones, en palabras: sin "null" ni la clave del enganche', () => {
    const html = pintar(
      propuesta('datos', {
        estado: 'aprobada',
        revisada_por: 'jefatura',
        revisada_en: '2026-09-21T10:00:00Z',
        correcciones: { direccion: null, racor: 'barcelona', diametro_mm: 70 },
      }),
    );
    expect(html).toContain(
      T.panelCola.conCorrecciones('Dirección → —, Tipo de enganche → Barcelona, Diámetro → 70 mm'),
    );
    expect(html).not.toContain('null');
  });
});

// docs/33 RV-330 (U15, D4): un punto que ya no está activo se dice arriba y solo se puede rechazar.
describe('punto que ya no está activo (RV-330)', () => {
  const inactivo = (op: Operacion, situacion: 'retirado' | 'borrado') =>
    propuesta(op, {
      datos: op === 'estado' ? { caudal: 'regular' } : {},
      punto_actualizado_en: '2026-10-07T09:00:00Z',
      desactualizada: true,
      punto: { ...ACTUAL, situacion, borrado_en: situacion === 'borrado' ? '2026-10-05T08:00:00Z' : null },
    });
  /** El `<button …>…</button>` que contiene `texto`. */
  const boton = (html: string, texto: string) => {
    const en = html.indexOf(texto);
    expect(en, `no hay botón con «${texto}»`).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf('<button', en), html.indexOf('</button>', en));
  };

  it.each(['revision', 'estado', 'datos', 'ubicacion'] as Operacion[])(
    '%s: aviso rojo arriba con la fecha, aprobar y corregir desactivados con su motivo',
    (op) => {
      const html = pintar(inactivo(op, 'retirado'));
      const aviso = T.panelCola.avisoRetirado('7 oct 2026');
      expect(html).toContain(aviso);
      // Arriba: antes de los datos del punto, no abajo con los botones.
      expect(html.indexOf(aviso)).toBeLessThan(html.indexOf(T.panelCola.datosDelPunto));
      const barra = html.slice(html.indexOf('data-testid="acciones-propuesta"'));
      expect(barra).toContain(T.panelCola.soloRechazar);
      expect(boton(barra, `>${T.panelCola.aprobar}<`)).toContain('disabled=""');
      expect(boton(barra, `aria-label="${T.panelCola.aprobarConCorrecciones}"`)).toContain('disabled=""');
      // La acción principal es rechazar, con su nombre largo, y está activa.
      expect(boton(barra, T.panelCola.rechazarNoExiste)).not.toContain('disabled=""');
      // El punto cambió porque se retiró: no se pide "Confirmar y aprobar".
      expect(html).not.toContain(T.panelCola.confirmarYAprobar);
    },
  );

  it('en la papelera, la fecha de borrado', () => {
    expect(pintar(inactivo('datos', 'borrado'))).toContain(T.panelCola.avisoEnPapelera('5 oct 2026'));
  });

  it('un punto activo sigue con sus botones de siempre', () => {
    const html = pintar(propuesta('estado', { datos: { caudal: 'regular' } }));
    expect(html).not.toContain(T.panelCola.avisoNoActivo);
    expect(html).not.toContain(T.panelCola.rechazarNoExiste);
    expect(boton(html, `>${T.panelCola.aprobar}<`)).not.toContain('disabled=""');
  });

  it('una propuesta ya decidida sobre un punto retirado no lleva el aviso (historial)', () => {
    const html = pintar({ ...inactivo('estado', 'retirado'), estado: 'rechazada', revisada_en: '2026-10-08' });
    expect(html).not.toContain(T.panelCola.avisoRetirado('7 oct 2026'));
    expect(html).not.toContain(T.panelCola.rechazarNoExiste);
  });

  it('una retirada no se bloquea por la situación', () => {
    const html = pintar(propuesta('retirada', { punto: { ...ACTUAL, situacion: 'retirado', borrado_en: null } }));
    expect(html).not.toContain(T.panelCola.rechazarNoExiste);
  });
});
