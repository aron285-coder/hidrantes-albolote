// docs/29 RV-124 (DEC-169): Editar con los controles del alta y los cambios marcados. Vitest corre en
// Node, sin DOM: se pinta a HTML con react-dom/server los campos con unos valores dados (los efectos,
// y con ellos Leaflet, no corren). Abrir, cerrar, preguntar y el "atrás" los cubre
// e2e/inventario-editar.spec.ts.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('../mapa/capas-leaflet', () => ({ capasDe: () => [] }));
vi.mock('../mapa/iconos-leaflet', () => ({ ICONO_PIN: null, iconoPunto: () => null }));
vi.mock('@/hooks/estado', () => ({
  useModo: () => 'claro',
  usePosicion: () => ({ tipo: 'inactiva' }),
  // SelectorPin pinta el mapa base debajo sin cobertura (docs/31 RV-150).
  useConexion: () => 'bien',
  useMapabase: () => ({ descargado: null }),
}));
vi.mock('./usar-panel', () => ({ usePanel: () => ({ avisar: () => undefined }) }));

const { CamposEditar, ResumenCambios } = await import('./EditarPunto');
const { cambiosDe, camposCambiados, formularioDe, valoresDe } = await import('@/lib/panel/inventario');
const { T } = await import('@/lib/textos');
type Punto = import('@/lib/puntos').Punto;
type Valores = import('@/lib/panel/inventario').Valores;

const BOCA: Punto = {
  id: 'b1',
  codigo: 'BOC-9001',
  tipo: 'boca_riego',
  diametro_mm: 45,
  caudal: 'bueno',
  racor: 'granada',
  descripcion_fallo: null,
  descripcion: '[PRUEBA] Junto a la fuente',
  direccion: 'Calle Real 14',
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-20',
  actualizado_en: '2026-09-01T00:00:00Z',
  lat: 37.2308,
  lng: -3.6569,
  radio_px: 7,
  revision_caducada: false,
};

const pintar = (v: Partial<Valores> = {}, p: Punto = BOCA) => {
  const valores = { ...valoresDe(p), ...v };
  return renderToStaticMarkup(<CamposEditar punto={p} v={valores} cambiar={() => undefined} gps={null} />);
};
const pie = (v: Partial<Valores> = {}, p: Punto = BOCA) =>
  renderToStaticMarkup(
    <ResumenCambios campos={camposCambiados(cambiosDe(p, formularioDe({ ...valoresDe(p), ...v })))} />,
  ).replace(/<[^>]+>/g, '');
/** El trozo de HTML de un campo, del data-campo al siguiente. */
const campo = (html: string, nombre: string) => html.split(`data-campo="${nombre}"`)[1]?.split('data-campo=')[0] ?? '';
/** ¿Está elegida la opción con ese texto? (radio con aria-checked="true"). */
const elegido = (html: string, texto: string) => new RegExp(`aria-checked="true"[^>]*>(?:<[^>]*>)*${texto}`).test(html);
// ~1 m de latitud son 0,000009°.
const movidoA = (m: number) => ({ pin: { lat: BOCA.lat + m * 0.000009, lng: BOCA.lng } });

describe('EditarPunto (docs/29 RV-124)', () => {
  it('abre con los valores guardados, nada marcado y "No has cambiado nada"', () => {
    const html = pintar();
    expect(html).not.toContain('data-cambia="true"');
    expect(elegido(html, 'Granada')).toBe(true);
    expect(html).toContain('value="Calle Real 14"');
    expect(pie()).toBe(T.avisosFormulario.sinCambios);
  });

  it('cambiar el enganche a Directo marca el campo, con "antes: Granada", y el pie dice "1 cambio"', () => {
    const html = pintar({ racor: 'directo' });
    const enganche = campo(html, 'enganche');
    expect(enganche).toContain('data-cambia="true"');
    expect(enganche).toContain(T.panelEditar.conCambio(T.formulario.racor));
    expect(enganche).toContain(`${T.panelEditar.antes} <del class="text-rojo-texto">${T.formulario.granada}</del>`);
    expect(campo(html, 'estado')).toContain('data-cambia="false"');
    expect(pie({ racor: 'directo' })).toBe(
      T.panelEditar.resumen(T.panelCola.cambios(1), T.panelEditar.campoEnganche).replace(/^ /, ''),
    );
  });

  it('volver a Granada lo desmarca y deja de contar', () => {
    expect(campo(pintar({ racor: 'granada' }), 'enganche')).toContain('data-cambia="false"');
    expect(pie({ racor: 'granada' })).toBe(T.avisosFormulario.sinCambios);
  });

  it('el tipo no se puede cambiar: el segmentado del alta, bloqueado, con el motivo', () => {
    const tipo = campo(pintar(), 'tipo');
    expect(tipo).toContain('<fieldset disabled=""');
    expect(elegido(tipo, 'Boca de riego')).toBe(true);
    expect(tipo).toContain(T.panelErrores.tipoNoModificable);
  });

  it('la descripción del fallo solo aparece con No funciona', () => {
    expect(pintar()).not.toContain('data-campo="fallo"');
    expect(pintar({ caudal: 'malo' })).not.toContain('data-campo="fallo"');
    const html = pintar({ caudal: 'no_funciona' });
    expect(html).toContain('data-campo="fallo"');
    expect(campo(html, 'fallo')).toContain(T.formulario.descripcionFallo);
  });

  it('mover el pin marca la ubicación y envía lat/lng; sin moverlo, no', () => {
    const v = { ...valoresDe(BOCA), ...movidoA(10) };
    expect(campo(pintar(movidoA(10)), 'ubicacion')).toContain('data-cambia="true"');
    expect(cambiosDe(BOCA, formularioDe(v))).toEqual({ lat: v.pin.lat, lng: v.pin.lng });
    expect(pie(movidoA(10))).toContain(T.panelEditar.campoUbicacion);
    expect(cambiosDe(BOCA, formularioDe(valoresDe(BOCA)))).toEqual({});
    expect(campo(pintar(movidoA(0.3)), 'ubicacion')).toContain('data-cambia="false"');
  });

  it('más de 25 m saca el aviso de revisar la dirección; menos, no', () => {
    expect(campo(pintar(movidoA(30)), 'direccion')).toContain(T.panelEditar.revisaDireccion('30 m'));
    expect(pintar(movidoA(20))).not.toContain('revisa la dirección');
  });

  it('una boca de otra medida abre "Otra medida" con su número', () => {
    const html = pintar({}, { ...BOCA, diametro_mm: 60 });
    expect(elegido(campo(html, 'diametro'), 'Otra medida')).toBe(true);
    expect(campo(html, 'diametro')).toContain('value="60"');
    expect(campo(pintar({ diametro: 70 }), 'diametro')).toContain(
      `${T.panelEditar.antes} <del class="text-rojo-texto">45 mm</del>`,
    );
  });

  it('un hidrante no lleva enganche y ofrece 70 · 100', () => {
    const hidrante: Punto = { ...BOCA, tipo: 'hidrante', diametro_mm: 100, racor: null, codigo: 'HID-9001' };
    const html = pintar({}, hidrante);
    expect(html).not.toContain('data-campo="enganche"');
    expect(elegido(campo(html, 'diametro'), '100 mm')).toBe(true);
    expect(campo(html, 'diametro')).not.toContain(T.formulario.otraMedida);
  });
});
