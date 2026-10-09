// docs/31 RV-157: el estado de la sincronización no anuncia el «hace N min» cada minuto; solo los
// cambios de estado. Desde docs/33 RV-311 va como una píldora en la cabecera (EstadoSincro) y debajo
// solo queda, si hace falta, «N sin enviar» (con su objetivo de 44 px, UI-15, y sin colgar sobre el
// buscador, RV-324) y el aviso de lo atascado.
// Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server.

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  conexion: 'bien' as 'bien' | 'sin_cobertura' | 'sin_servidor',
  guardadoEn: Date.now() as number | null,
  sincronizando: false,
  cola: [] as {
    creada_en: number;
    fallo: string | null;
    proximo?: number;
    en_espera?: { motivo: string; maximo: number | null } | null;
  }[],
}));

vi.mock('@/hooks/estado', () => ({
  useConexion: () => estado.conexion,
  usePuntos: () => ({ puntos: [], guardadoEn: estado.guardadoEn, sincronizando: estado.sincronizando }),
}));
vi.mock('@/hooks/cola', () => ({ useCola: () => estado.cola }));
vi.mock('@/hooks/reloj', () => ({ useReloj: () => Date.now() }));

const { BarraEstado, EstadoSincro } = await import('./BarraEstado');
const { T } = await import('@/lib/textos');

const pintar = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <BarraEstado />
    </MemoryRouter>,
  );
const pintarEstado = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <EstadoSincro />
    </MemoryRouter>,
  );

/** El contenido de las regiones de estado, sin etiquetas. */
const regiones = (html: string) =>
  [...html.matchAll(/<(\w+)[^>]*role="status"[^>]*>(.*?)<\/\1>/gs)].map(([, , dentro]) =>
    dentro.replace(/<[^>]+>/g, '').trim(),
  );

describe('EstadoSincro (docs/31 RV-157, docs/33 RV-311)', () => {
  beforeEach(() => {
    estado.conexion = 'bien';
    estado.guardadoEn = Date.now() - 60_000;
    estado.sincronizando = false;
    estado.cola = [];
  });

  it('la región de estado dice el estado, sin el «hace N min» que cambia cada minuto', () => {
    expect(regiones(pintarEstado())).toEqual([T.mapa.sincronizadoSolo]);
    estado.conexion = 'sin_cobertura';
    expect(regiones(pintarEstado())).toEqual([T.mapa.sinCoberturaSolo]);
    estado.guardadoEn = null;
    estado.sincronizando = true;
    expect(regiones(pintarEstado())).toEqual([T.mapa.sincronizando]);
  });

  it('al día: punto verde; sin cobertura: gris; con más de una hora: ámbar', () => {
    expect(pintarEstado()).toMatch(/data-punto="verde"/);
    expect(pintarEstado()).toContain(T.mapa.alDia(0));
    estado.guardadoEn = Date.now() - 2 * 3600_000 - 60_000;
    expect(pintarEstado()).toMatch(/data-punto="ambar"/);
    expect(pintarEstado()).toContain('hace 2 h');
    estado.conexion = 'sin_cobertura';
    expect(pintarEstado()).toMatch(/data-punto="gris"/);
    expect(pintarEstado()).toContain(T.mapa.sinConexion);
  });

  it('sin servidor: la píldora lleva «Reintentar» dentro; nunca otra franja', () => {
    estado.conexion = 'sin_servidor';
    const html = pintarEstado();
    expect(html).toContain(T.mapa.sinServidor);
    expect(html).toMatch(new RegExp(`<button[^>]*>${T.mapa.reintentar}</button>`));
  });

  it('el estado se toca: abre el detalle (un diálogo) y mide 44 px', () => {
    const boton = pintarEstado().match(/<button [^>]*aria-haspopup="dialog"[^>]*>/)?.[0] ?? '';
    expect(boton).toMatch(/\bmin-h-11\b/);
  });
});

describe('BarraEstado: «N sin enviar» (RV-243, RV-324)', () => {
  beforeEach(() => {
    estado.cola = [];
  });

  it('sin nada en la cola, no ocupa nada', () => {
    expect(pintar()).toBe('');
  });

  it('«N sin enviar» tiene un objetivo táctil de 44 px y no cuelga por debajo de su línea', () => {
    estado.cola = [{ creada_en: Date.now(), fallo: null }];
    const enlace = pintar().match(/<a [^>]*href="\/mis-propuestas"[^>]*>/)?.[0] ?? '';
    expect(enlace).toMatch(/\bmin-h-11\b/);
    expect(enlace).toMatch(/\bmin-w-11\b/);
    // El margen negativo de abajo lo hacía tapar los 8 px de arriba del buscador (N3).
    expect(enlace).not.toMatch(/-mb-/);
  });
});

describe('BarraEstado: la espera por un tope no es falta de cobertura (docs/32 RV-233)', () => {
  const haceUnDia = () => Date.now() - 25 * 3600_000;

  it('más de 24 h sin enviar y sin tope: avisa de que espera cobertura', () => {
    estado.cola = [{ creada_en: haceUnDia(), fallo: null, proximo: 0, en_espera: null }];
    expect(pintar()).toContain(T.misPropuestas.esperando24h);
  });

  it('si lo que espera es un tope, no dice que espera cobertura', () => {
    estado.cola = [
      {
        creada_en: haceUnDia(),
        fallo: null,
        proximo: Date.now() + 3600_000,
        en_espera: { motivo: 'cuota_fotos_grupo', maximo: null },
      },
    ];
    expect(pintar()).not.toContain(T.misPropuestas.esperando24h);
  });
});
