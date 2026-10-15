// docs/38 RV-502: las piezas comunes de las listas del panel. Vitest corre en Node, sin DOM: se pintan a
// HTML con react-dom/server. Pulsar, el foco y Esc se prueban con Playwright.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { T } from '@/lib/textos';
import {
  BotonMas,
  EtiquetaAcceso,
  EtiquetaEstado,
  EtiquetaOperacion,
  EtiquetaPedido,
  EtiquetaPequena,
  Fecha,
} from './piezas';

const pintar = (e: React.ReactElement) => renderToStaticMarkup(e);

describe('Fecha (UI-12, DEC-215)', () => {
  const ahora = new Date('2026-10-15T12:00:00Z');

  it('«hace…» con la fecha y la hora exactas en el title', () => {
    const html = pintar(<Fecha f="2026-10-15T10:00:00Z" ahora={ahora} />);
    expect(html).toContain('dateTime="2026-10-15T10:00:00.000Z"');
    expect(html).toContain('>hace 2 h</time>');
    expect(html).toContain('title="15 oct 2026 a las 12:00"');
  });

  it('desde 7 días, la fecha; con soloDia, el title sin hora y sin cambiar de día', () => {
    const html = pintar(<Fecha f="2026-08-20" soloDia ahora={ahora} />);
    expect(html).toContain('>20 ago 2026</time>');
    expect(html).toContain('title="20 ago 2026"');
    expect(html).toContain('dateTime="2026-08-20"');
  });

  it('con soloDia, una fecha de hoy dice «hoy», nunca horas', () => {
    expect(pintar(<Fecha f="2026-10-15" soloDia ahora={new Date('2026-10-15T20:00:00Z')} />)).toContain('>hoy</time>');
  });

  it('una fecha que no se puede leer no rompe la lista', () => {
    expect(pintar(<Fecha f="no es una fecha" ahora={ahora} />)).toContain(`>${T.panelCola.sinDato}<`);
  });
});

describe('etiquetas (06 §5)', () => {
  it('estado del punto, con su texto y su chip', () => {
    const html = pintar(<EtiquetaEstado caudal="malo" />);
    expect(html).toContain('>Malo<');
    expect(html).toContain('rounded-chip');
  });

  it('acceso de un administrador', () => {
    expect(pintar(<EtiquetaAcceso estado="activo" />)).toMatch(/bg-tinte-verde[^"]*">Activo</);
    expect(pintar(<EtiquetaAcceso estado="pendiente" />)).toMatch(
      new RegExp(`bg-tinte-ambar[^"]*">${T.panelAjustes.pendienteVincular}<`),
    );
    expect(pintar(<EtiquetaAcceso estado="sin_acceso" />)).toMatch(/bg-tinte-gris[^"]*">Sin acceso</);
  });

  it('pedido de Mantenimiento', () => {
    expect(pintar(<EtiquetaPedido estado="pedido" />)).toMatch(/bg-tinte-azul[^"]*">pedido</);
    expect(pintar(<EtiquetaPedido estado="lanzado" />)).toMatch(/bg-tinte-verde[^"]*">lanzado</);
    expect(pintar(<EtiquetaPedido estado="error" />)).toMatch(/bg-tinte-rojo[^"]*">error</);
  });

  it('«Tú» y «Jefatura», pequeñas', () => {
    expect(pintar(<EtiquetaPequena tono="gris">{T.panel.tu}</EtiquetaPequena>)).toMatch(/bg-tinte-gris[^"]*">Tú</);
    expect(pintar(<EtiquetaPequena tono="azul">{T.navegacion.jefatura}</EtiquetaPequena>)).toMatch(
      /bg-tinte-azul[^"]*">Jefatura</,
    );
  });

  it('operaciones con los tintes, también en oscuro: revisión azul, datos y ubicación gris', () => {
    expect(pintar(<EtiquetaOperacion operacion="revision" />)).toContain('bg-tinte-azul');
    expect(pintar(<EtiquetaOperacion operacion="datos" />)).toContain('bg-tinte-gris');
    expect(pintar(<EtiquetaOperacion operacion="ubicacion" />)).toContain('bg-tinte-gris');
    expect(pintar(<EtiquetaOperacion operacion="revision" />)).not.toContain('#DCE6F2');
  });
});

describe('BotonMas («⋯» de una fila)', () => {
  it('se llama «Más acciones de …», abre un menú y mide 44 px por debajo de 1.100 y 32 desde ahí', () => {
    const html = pintar(<BotonMas nombre="HID-9001" opciones={[{ nombre: T.panel.historial, alElegir: () => {} }]} />);
    expect(html).toContain('aria-label="Más acciones de HID-9001"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('size-11');
    expect(html).toContain('min-[1100px]:size-8');
  });
});
