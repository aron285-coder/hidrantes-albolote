// docs/32 RV-236: durante la descarga del mapa base, el lector de pantalla no lee el porcentaje a
// cada trozo. Solo se anuncian el inicio, la mitad, el final y los errores.
// Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server.

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  mapabase: { descargado: null, progreso: null, fallo: false, parada: false } as {
    descargado: { version: string; bytes: number; fecha: string } | null;
    progreso: number | null;
    fallo: boolean;
    parada: boolean;
  },
}));

vi.mock('@/hooks/estado', () => ({ useMapabase: () => estado.mapabase }));

const { AvisoMapabase, AnuncioDescarga } = await import('./AvisoMapabase');
const { hitoDescarga } = await import('@/lib/anuncio-descarga');
const { T } = await import('@/lib/textos');

/** El contenido de las regiones vivas, sin etiquetas. */
const regiones = (html: string) =>
  [...html.matchAll(/<(\w+)[^>]*(?:role="(?:status|alert)"|aria-live="(?:polite|assertive)")[^>]*>(.*?)<\/\1>/gs)].map(
    ([, , dentro]) => dentro.replace(/<[^>]+>/g, '').trim(),
  );

describe('AvisoMapabase: lo que anuncia la descarga (RV-236)', () => {
  beforeEach(() => {
    estado.mapabase = { descargado: null, progreso: null, fallo: false, parada: false };
  });

  it('el porcentaje se ve, pero no está dentro de ninguna región viva', () => {
    estado.mapabase.progreso = 37;
    const html = renderToStaticMarkup(<AvisoMapabase sinRed={false} />);
    expect(html).toContain(T.ajustes.descargando(37));
    for (const r of regiones(html)) expect(r).not.toMatch(/%/);
  });

  it('el anuncio dice el inicio y la mitad, sin el número', () => {
    estado.mapabase.progreso = 12;
    expect(regiones(renderToStaticMarkup(<AnuncioDescarga />))).toEqual([T.mapa.anuncioDescarga.inicio]);
    estado.mapabase.progreso = 64;
    expect(regiones(renderToStaticMarkup(<AnuncioDescarga />))).toEqual([T.mapa.anuncioDescarga.mitad]);
  });

  it('la descarga parada lo dice y ofrece reintentar (RV-235)', () => {
    estado.mapabase = { ...estado.mapabase, fallo: true, parada: true };
    const html = renderToStaticMarkup(<AvisoMapabase sinRed={false} />);
    expect(html).toContain(T.ajustes.descargaParada);
    expect(html).toContain(T.ajustes.reintentar);
    expect(html).not.toContain(T.ajustes.falloDescarga);
  });

  it('sin descarga en marcha no se anuncia nada', () => {
    expect(regiones(renderToStaticMarkup(<AnuncioDescarga />))).toEqual(['']);
  });
});

describe('hitoDescarga (RV-236)', () => {
  /** Los hitos que se anuncian al pasar por la secuencia de estados: solo los cambios. */
  const anuncios = (estados: { progreso: number | null; fallo: boolean }[]) => {
    const dichos: string[] = [];
    let h: ReturnType<typeof hitoDescarga> = null;
    for (const e of estados) {
      const n = hitoDescarga(h, e);
      if (n && n !== h) dichos.push(n);
      h = n;
    }
    return dichos;
  };
  const p = (progreso: number | null, fallo = false) => ({ progreso, fallo });

  it('una descarga entera: inicio, mitad y final; nada en cada trozo', () => {
    const trozos = Array.from({ length: 100 }, (_, i) => p(i));
    expect(anuncios([p(null), ...trozos, p(null)])).toEqual(['inicio', 'mitad', 'final']);
  });

  it('un fallo a medias se anuncia, y el reintento vuelve a empezar', () => {
    expect(anuncios([p(0), p(30), p(null, true), p(0), p(80), p(null)])).toEqual([
      'inicio',
      'error',
      'inicio',
      'mitad',
      'final',
    ]);
  });

  it('al abrir con el mapa ya descargado no dice nada', () => {
    expect(anuncios([p(null), p(null)])).toEqual([]);
  });

  it('un fallo se anuncia aunque no se viera empezar (se empezó en otra pantalla)', () => {
    expect(anuncios([p(null, true)])).toEqual(['error']);
  });
});
