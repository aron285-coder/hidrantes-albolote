// docs/38 RV-504 (UI-19, DEC-214): el botón de filtros dice lo que está puesto. Vitest corre en Node, sin DOM: se
// pinta con react-dom/server. Abrir, Esc, Tab y el cruce de 768 px se prueban con Playwright (RV-505).

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/ancho', () => ({ usePanelMovil: () => true }));

const { Filtros, GrupoFiltro } = await import('./Filtros');
const { EtiquetaOperacion } = await import('./piezas');
const { T } = await import('@/lib/textos');

const grupo = {
  titulo: 'Operación',
  valor: 'alta',
  alCambiar: () => {},
  opciones: [
    { valor: '', nombre: 'Todas' },
    { valor: 'alta', nombre: 'Alta', adorno: <EtiquetaOperacion operacion="alta" /> },
    { valor: 'estado', nombre: 'Estado', adorno: <EtiquetaOperacion operacion="estado" />, cuenta: 3 },
  ],
};

describe('Filtros (botón)', () => {
  it('dice el resumen y se llama «Filtros: …»', () => {
    const html = renderToStaticMarkup(
      <Filtros titulo="Filtrar la cola" resumen="Pendientes · Alta" activo={false} grupos={[grupo]} />,
    );
    expect(html).toContain(`aria-label="${T.panel.filtrosDe('Pendientes · Alta')}"`);
    expect(html).toContain('>Pendientes · Alta<');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('anillo-seleccion');
  });

  it('activo: borde de 2 px con el anillo de selección y negrita', () => {
    const html = renderToStaticMarkup(<Filtros titulo="t" resumen="Malo" activo grupos={[grupo]} />);
    expect(html).toContain('border-[var(--anillo-seleccion)]');
    expect(html).toContain('font-bold');
  });
});

describe('GrupoFiltro', () => {
  it('un radiogroup con su título; la elegida marcada; con adorno, el chip no repite el nombre', () => {
    const html = renderToStaticMarkup(<GrupoFiltro grupo={grupo} />);
    expect(html).toContain('role="radiogroup" aria-label="Operación"');
    // «Alta» elegida, con el nombre accesible y una sola vez a la vista (dentro de la etiqueta).
    expect(html).toMatch(/role="radio" aria-checked="true" aria-label="Alta"/);
    expect(html.match(/>Alta</g)).toHaveLength(1);
    // Con cuenta, el número detrás y en el nombre accesible.
    expect(html).toContain('aria-label="Estado 3"');
    expect(html).toMatch(/text-texto-suave">3</);
  });

  it('en forma de lista, filas con círculo de radio', () => {
    const html = renderToStaticMarkup(<GrupoFiltro grupo={{ ...grupo, forma: 'lista' }} />);
    expect(html).toContain('rounded-full border-2');
    expect(html).toContain('role="radio" aria-checked="true"');
  });
});
