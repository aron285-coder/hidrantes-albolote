// El formulario de las operaciones sin su punto (docs/31 RV-152) y el botón de jefatura sin
// conexión (docs/31 RV-151). Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server.

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Punto } from '@/tipos/punto';

const estado = vi.hoisted(() => ({
  puntos: [] as unknown[],
  cargado: false,
  sincronizadoEn: '2026-10-01T00:00:00Z' as string | null,
  sincronizando: false,
  conexion: 'bien' as 'bien' | 'sin_cobertura' | 'sin_servidor',
  acceso: { tipo: 'voluntario', sesion: { nombre: 'A', apellido: 'B' } } as unknown,
}));

vi.mock('@/hooks/estado', () => ({
  usePuntos: () => ({
    puntos: estado.puntos,
    cargado: estado.cargado,
    sincronizadoEn: estado.sincronizadoEn,
    sincronizando: estado.sincronizando,
  }),
  useConexion: () => estado.conexion,
  useAcceso: () => estado.acceso,
  usePosicion: () => ({ tipo: 'inactiva' }),
}));
// El mapa del pin necesita Leaflet y un DOM: aquí no hace falta.
vi.mock('@/componentes/operaciones/SelectorPin', () => ({ SelectorPin: () => null }));
vi.mock('@/lib/posicion', () => ({
  activarPosicion: () => () => {},
  posicionActual: () => null,
  esAntigua: () => false,
}));

const { Proponer } = await import('./Proponer');
const { T } = await import('@/lib/textos');

const HID: Punto = {
  id: 'p1',
  codigo: 'HID-0007',
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion_fallo: null,
  descripcion: null,
  direccion: null,
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-01',
  actualizado_en: '2026-08-01T00:00:00Z',
  lat: 37.2305,
  lng: -3.656,
  radio_px: 11,
  revision_caducada: false,
};

const pintar = (ruta: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/proponer/:operacion" element={<Proponer />} />
        <Route path="/" element={<hr />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  estado.puntos = [];
  estado.cargado = false;
  estado.sincronizadoEn = '2026-10-01T00:00:00Z';
  estado.sincronizando = false;
  estado.conexion = 'bien';
  estado.acceso = { tipo: 'voluntario', sesion: { nombre: 'A', apellido: 'B' } };
});

describe('el formulario de un punto que no está (docs/31 RV-152)', () => {
  it('mientras no han cargado los puntos, "Cargando…" y no manda al mapa', () => {
    const html = pintar('/proponer/revision?p=p1');
    expect(html).toContain(T.app.cargando);
    expect(html).not.toContain(T.operaciones.puntoYaNoEsta);
  });

  it('con los puntos cargados y el punto, el formulario', () => {
    estado.cargado = true;
    estado.puntos = [HID];
    const html = pintar('/proponer/revision?p=p1');
    expect(html).toContain('HID-0007');
    expect(html).not.toContain(T.app.cargando);
  });

  it('cargados y sin el punto: lo dice, sin redirigir, con la salida al mapa', () => {
    estado.cargado = true;
    estado.puntos = [];
    const html = pintar('/proponer/estado?p=p1');
    expect(html).toContain(T.operaciones.puntoYaNoEsta);
    expect(html).toContain('role="alert"');
    expect(html).toContain(T.envio.volverAlMapa);
  });

  it('sin nada guardado y con la primera sincronización en marcha, "Cargando…" y no "ya no está"', () => {
    estado.cargado = true;
    estado.sincronizadoEn = null;
    estado.sincronizando = true;
    const html = pintar('/proponer/revision?p=p1');
    expect(html).toContain(T.app.cargando);
    expect(html).not.toContain(T.operaciones.puntoYaNoEsta);
  });

  it('un alta no necesita punto', () => {
    estado.cargado = false;
    const html = pintar('/proponer/alta');
    expect(html).not.toContain(T.app.cargando);
    expect(html).toContain(T.formulario.tipoElemento);
  });
});

describe('Corregir datos: foto opcional y textos enteros (docs/33 RV-316)', () => {
  const BOC: Punto = { ...HID, id: 'b1', codigo: 'BOC-0003', tipo: 'boca_riego', diametro_mm: 32, racor: 'granada' };
  beforeEach(() => {
    estado.cargado = true;
    estado.puntos = [HID, BOC];
  });
  const texto = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");

  it('la foto dice «Foto · opcional» y el botón «Hacer foto (opcional)», secundario (D3)', () => {
    const html = pintar('/proponer/datos?p=p1');
    expect(T.formulario.fotoOpcional).toBe('Foto · opcional');
    expect(T.formulario.hacerFotoOpcional).toBe('Hacer foto (opcional)');
    expect(html).toContain(`>${T.formulario.fotoOpcional}<`);
    const boton = /<button[^>]*>(?:(?!<\/button>).)*Hacer foto \(opcional\)<\/button>/s.exec(html)?.[0];
    expect(boton).toBeDefined();
    // Secundario (06 §5): borde de --texto, no el naranja de la foto obligatoria.
    expect(boton).toMatch(/\bborder-texto\b/);
    expect(boton).not.toMatch(/border-naranja-600/);
    expect(html).not.toMatch(/obligatoria/);
  });

  it('en las demás operaciones la foto sigue obligatoria, con el botón de siempre', () => {
    const html = pintar('/proponer/revision?p=p1');
    expect(html).toContain(T.formulario.hacerFoto);
    expect(html).not.toContain(T.formulario.fotoOpcional);
  });

  it('la ayuda del tipo es una frase con el enlace dentro, sin «·» colgando (D8)', () => {
    const html = pintar('/proponer/datos?p=p1');
    const ayuda = /<p[^>]*data-ayuda-tipo[^>]*>(.*?)<\/p>/s.exec(html)?.[1] ?? '';
    expect(texto(ayuda)).toBe('¿El tipo está mal? Propón retirarlo y da de alta el correcto.');
    expect(ayuda).toMatch(/<a[^>]*href="\/proponer\/retirada\?p=p1"[^>]*>Propón retirarlo<\/a>/);
    expect(ayuda).not.toContain('·');
  });

  it('«Otra medida» lleva «mm» al lado del número', () => {
    const html = pintar('/proponer/datos?p=b1');
    expect(html).toMatch(/<input[^>]*aria-label="Otra medida"[^>]*value="32"[^>]*\/?>\s*<span[^>]*>mm<\/span>/);
  });
});

describe('el botón de jefatura sin conexión (docs/31 RV-151)', () => {
  const comoJefatura = () => {
    estado.acceso = { tipo: 'jefatura', correo: 'j@example.org' };
    estado.cargado = true;
    estado.puntos = [HID];
  };

  it('con conexión, "Aplicar ahora"', () => {
    comoJefatura();
    expect(pintar('/proponer/revision?p=p1')).toContain(T.envio.aplicarAhora);
  });

  it.each(['sin_cobertura', 'sin_servidor'] as const)('%s, "Guardar en el móvil"', (c) => {
    comoJefatura();
    estado.conexion = c;
    const html = pintar('/proponer/revision?p=p1');
    expect(html).toContain(T.envio.guardarEnMovil);
    expect(html).not.toContain(T.envio.aplicarAhora);
  });
});
