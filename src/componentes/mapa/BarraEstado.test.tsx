// docs/31 RV-157: la barra de estado no anuncia el «hace N min» cada minuto; solo los cambios de
// estado (sin cobertura, sincronizado). Y «N sin enviar» tiene su objetivo táctil de 44 px (UI-15).
// Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server.

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  conexion: 'bien' as 'bien' | 'sin_cobertura' | 'sin_servidor',
  guardadoEn: '2026-10-07T10:00:00Z' as string | null,
  sincronizando: false,
  cola: [] as { creada_en: number; fallo: string | null }[],
}));

vi.mock('@/hooks/estado', () => ({
  useConexion: () => estado.conexion,
  usePuntos: () => ({ puntos: [], guardadoEn: estado.guardadoEn, sincronizando: estado.sincronizando }),
}));
vi.mock('@/hooks/cola', () => ({ useCola: () => estado.cola }));
vi.mock('@/hooks/reloj', () => ({ useReloj: () => Date.now() }));

const { BarraEstado } = await import('./BarraEstado');
const { T } = await import('@/lib/textos');

const pintar = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <BarraEstado />
    </MemoryRouter>,
  );

/** El contenido de las regiones de estado, sin etiquetas. */
const regiones = (html: string) =>
  [...html.matchAll(/<(\w+)[^>]*role="status"[^>]*>(.*?)<\/\1>/gs)].map(([, , dentro]) =>
    dentro.replace(/<[^>]+>/g, '').trim(),
  );

describe('BarraEstado (docs/31 RV-157)', () => {
  beforeEach(() => {
    estado.conexion = 'bien';
    estado.guardadoEn = '2026-10-07T10:00:00Z';
    estado.sincronizando = false;
    estado.cola = [];
  });

  it('la región de estado dice el estado, sin el «hace N min» que cambia cada minuto', () => {
    expect(regiones(pintar())).toEqual([T.mapa.sincronizadoSolo]);
    estado.conexion = 'sin_cobertura';
    expect(regiones(pintar())).toEqual([T.mapa.sinCoberturaSolo]);
    estado.guardadoEn = null;
    estado.sincronizando = true;
    expect(regiones(pintar())).toEqual([T.mapa.sincronizando]);
  });

  it('el sello con la hora sigue a la vista', () => {
    expect(pintar()).toContain('Sincronizado hace');
  });

  it('«N sin enviar» tiene un objetivo táctil de 44 px', () => {
    estado.cola = [{ creada_en: Date.now(), fallo: null }];
    const enlace = pintar().match(/<a [^>]*href="\/mis-propuestas"[^>]*>/)?.[0] ?? '';
    expect(enlace).toMatch(/\bmin-h-11\b/);
    expect(enlace).toMatch(/\bmin-w-11\b/);
  });
});
