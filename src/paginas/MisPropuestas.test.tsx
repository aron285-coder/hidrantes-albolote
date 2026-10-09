// docs/33 RV-315 (U6, D10): cada tarjeta de Mis propuestas dice qué se propuso, en una línea, y
// «Retirar» mide 44 × 44 px. Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server y lo
// que lee el estado de la app se simula.

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const AHORA = Date.parse('2026-10-09T10:00:00Z');
let propias: Record<string, unknown>[] = [];
let cola: Record<string, unknown>[] = [];
let puntos: Record<string, unknown>[] = [];

vi.mock('@/hooks/estado', () => ({
  useConexion: () => 'bien',
  usePuntos: () => ({ puntos, guardadoEn: null, sincronizando: false }),
}));
vi.mock('@/hooks/cola', () => ({ useCola: () => cola, useMisPropuestas: () => propias }));
vi.mock('@/hooks/reloj', () => ({ useReloj: () => AHORA }));
vi.mock('@/lib/cola', () => ({
  ATASCADO_MS: 86_400_000,
  descartar: vi.fn(),
  reintentarFallido: vi.fn(),
  esperaTope: () => false,
}));
vi.mock('@/lib/mis-propuestas', () => ({
  SESION_CAMBIADA: 'SESION_CAMBIADA',
  cargarMisPropuestas: vi.fn(),
  cargarYMarcarVistas: vi.fn(async () => ({ ok: true, datos: [] })),
  retirarPropuesta: vi.fn(),
  textoErrorRetirar: () => '',
}));

const { MisPropuestas } = await import('./MisPropuestas');
const { T } = await import('@/lib/textos');

const pintar = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <MisPropuestas />
    </MemoryRouter>,
  );

const propia = (extra: Record<string, unknown>) => ({
  id: 'p1',
  clave_local: 'k1',
  operacion: 'estado',
  punto_id: 'pt1',
  codigo: 'HID-9002',
  datos: { caudal: 'no_funciona', descripcion_fallo: 'Tapa soldada' },
  estado: 'pendiente',
  motivo_rechazo: null,
  correcciones: null,
  creada_en: new Date(AHORA - 60_000).toISOString(),
  revisada_en: null,
  ...extra,
});

/** Las tarjetas, con su HTML y su texto. */
const tarjetas = (html: string) =>
  [...html.matchAll(/<li\b[^>]*>(.*?)<\/li>/gs)].map(([entera]) => ({
    html: entera,
    texto: entera.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|'),
  }));

describe('Mis propuestas · qué se propuso (docs/33 RV-315)', () => {
  beforeEach(() => {
    cola = [];
    puntos = [{ id: 'pt1', codigo: 'HID-9002', caudal: 'regular', racor: null, diametro_mm: 100, descripcion: null }];
  });

  it('arriba el código, el tipo de cambio y el estado; debajo, una línea con lo propuesto', () => {
    propias = [propia({})];
    const [t] = tarjetas(pintar());
    expect(t!.texto).toContain('|HID-9002|Estado|Pendiente|');
    expect(t!.texto).toContain('|Regular → No funciona|');
    expect(t!.texto).toContain('|hace 1 min|');
    // El tipo de cambio en texto suave, no en mayúsculas.
    expect(t!.html).not.toMatch(/uppercase/);
  });

  it('un alta: «Punto nuevo», sin monoespaciada, y tipo y medida', () => {
    propias = [
      propia({
        operacion: 'alta',
        punto_id: null,
        codigo: null,
        datos: { tipo: 'hidrante', diametro_mm: 100, caudal: 'bueno' },
        estado: 'aprobada',
      }),
    ];
    const [t] = tarjetas(pintar());
    expect(t!.texto).toContain(`|${T.misPropuestas.puntoNuevo}|Alta|Aprobada|`);
    expect(t!.texto).toContain('|Hidrante 100 mm|');
    expect(t!.html).not.toMatch(/font-datos[^>]*>Punto nuevo/);
  });

  it('rechazada: «Motivo: …» en una línea de texto suave, sin recuadro', () => {
    propias = [
      propia({
        operacion: 'datos',
        codigo: 'BOC-9001',
        datos: { racor: 'directo' },
        estado: 'rechazada',
        motivo_rechazo: 'la foto es de la boca de al lado',
      }),
    ];
    const [t] = tarjetas(pintar());
    expect(t!.texto).toContain('|Tipo de enganche: Directo|');
    const motivo = t!.html.match(/<p[^>]*>Motivo: la foto es de la boca de al lado<\/p>/);
    expect(motivo).not.toBeNull();
    expect(motivo![0]).toMatch(/text-texto-suave/);
    expect(motivo![0]).not.toMatch(/bg-rojo-100/);
  });

  it('una resuelta no pone la flecha con lo de hoy (el punto ya cambió)', () => {
    propias = [propia({ estado: 'aprobada' })];
    puntos = [{ id: 'pt1', caudal: 'no_funciona' }];
    const [t] = tarjetas(pintar());
    expect(t!.texto).toContain('|No funciona|');
    expect(t!.texto).not.toContain('→');
  });

  it('lo que falta por enviar también dice qué se propuso', () => {
    propias = [];
    cola = [
      {
        clave_local: 'c1',
        creada_en: AHORA - 60_000,
        args: { operacion: 'retirada', punto_id: 'pt1', datos: { motivo_rapido: 'obras', motivo: '' } },
        codigo: 'HID-9002',
        fallo: null,
        intentos: 0,
        proximo: 0,
      },
    ];
    const [t] = tarjetas(pintar());
    expect(t!.texto).toContain('|Retirada: Obras|');
  });

  it('lo que falta por enviar lleva la flecha con lo que tiene el punto guardado', () => {
    propias = [];
    cola = [
      {
        clave_local: 'c2',
        creada_en: AHORA - 60_000,
        args: { operacion: 'estado', punto_id: 'pt1', datos: { caudal: 'malo' } },
        codigo: 'HID-9002',
        fallo: null,
        intentos: 0,
        proximo: 0,
      },
    ];
    const [t] = tarjetas(pintar());
    expect(t!.texto).toContain('|Regular → Malo|');
  });

  it('pendiente de un punto que ya no está en el móvil: solo lo nuevo', () => {
    propias = [propia({})];
    puntos = [];
    const [t] = tarjetas(pintar());
    expect(t!.texto).toContain('|No funciona|');
    expect(t!.texto).not.toContain('→');
  });

  it('«Retirar» es un botón de 44 × 44 px como mínimo (D10)', () => {
    propias = [propia({})];
    const boton = pintar().match(/<button[^>]*>Retirar<\/button>/);
    expect(boton).not.toBeNull();
    expect(boton![0]).toMatch(/\bmin-h-11\b/);
    expect(boton![0]).toMatch(/\bmin-w-11\b/);
  });
});
