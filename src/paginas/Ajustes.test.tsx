// docs/26 RV-113 (DEC-164): en Ajustes, la fila «Cuenta de jefatura» lleva un botón secundario
// «Panel de jefatura» que abre /admin dentro de la app. Un voluntario no lo ve. Vitest corre en Node,
// sin DOM: se pinta a HTML con react-dom/server y lo que lee el estado de la app se simula.

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let acceso: Record<string, unknown> = { tipo: 'nada' };

vi.mock('@/hooks/estado', () => ({
  useAcceso: () => acceso,
  useConexion: () => 'bien',
  useInstalar: () => 'instalada',
  useMapabase: () => ({ progreso: null, descargado: null, fallo: false }),
  usePuntos: () => ({ puntos: [], guardadoEn: null, sincronizando: false }),
}));
vi.mock('@/hooks/version', () => ({ useVersionNueva: () => false }));
vi.mock('@/hooks/cola', () => ({ useCola: () => [], useMisPropuestas: () => [] }));
vi.mock('@/hooks/reloj', () => ({ useReloj: () => undefined }));
vi.mock('@/lib/push', () => ({
  estadoPush: () => 'no_disponible',
  activarPush: vi.fn(),
  desactivarPush: vi.fn(),
  sePuedeReintentar: () => false,
  textoMotivoPush: () => '',
}));
vi.mock('@/lib/acceso', () => ({ cambiarFirma: vi.fn(), cerrarSesionVoluntario: vi.fn(), salirDeGoogle: vi.fn() }));
vi.mock('@/lib/almacen', () => ({ leer: () => null }));
vi.mock('@/lib/conexion', () => ({ reintentarAhora: vi.fn() }));
vi.mock('@/lib/instalar', () => ({ instalar: vi.fn() }));
vi.mock('@/lib/mapabase', () => ({ descargarMapabase: vi.fn(), hayVersionNuevaMapabase: () => false }));
vi.mock('@/lib/pwa', () => ({ recargar: vi.fn() }));
vi.mock('@/lib/tema', () => ({ guardarTema: vi.fn(), leerTema: () => 'sistema' }));
vi.mock('@/lib/capas', () => ({
  NOMBRE_CAPA: { calles: 'Calles' },
  capaGuardada: () => 'calles',
  guardarCapa: vi.fn(),
}));
vi.mock('@/lib/novedades', () => ({
  NOVEDADES: { version: null, lineas: [] },
  hayNovedadesSinVer: () => false,
  marcarNovedadesVistas: vi.fn(),
}));

const { Ajustes } = await import('./Ajustes');
const { T } = await import('@/lib/textos');

const pintar = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <Ajustes />
    </MemoryRouter>,
  );

/** El enlace o botón cuyo texto visible es `texto`, con sus atributos. */
function control(html: string, texto: string) {
  return [...html.matchAll(/<(a|button)\b([^>]*)>(.*?)<\/\1>/gs)]
    .map(([, etiqueta, atributos, dentro]) => ({
      etiqueta,
      atributos,
      dentro,
      texto: dentro.replace(/<[^>]+>/g, '').trim(),
    }))
    .find((c) => c.texto === texto);
}

describe('Ajustes · Panel de jefatura (RV-113)', () => {
  beforeEach(() => {
    acceso = { tipo: 'nada' };
  });

  it('con acceso de jefatura, se ve «Panel de jefatura» y lleva a /admin dentro de la app', () => {
    acceso = { tipo: 'jefatura', correo: 'jefa@example.org' };
    expect(T.ajustes.irAlPanel).toBe('Panel de jefatura');
    const html = pintar();
    const boton = control(html, T.ajustes.irAlPanel);
    expect(boton).toBeDefined();
    // Un enlace del router: navega sin recargar ni abrir otra pestaña.
    expect(boton!.etiqueta).toBe('a');
    expect(boton!.atributos).toContain('href="/admin"');
    expect(boton!.atributos).not.toContain('target=');
    // Secundario de 06 §5 (DEC-147: en Ajustes no hay principal), con --texto para que se lea en
    // claro y en oscuro (DEC-164), a todo el ancho y de 44 px como mínimo.
    expect(boton!.atributos).toMatch(/\bborder-texto\b/);
    expect(boton!.atributos).toMatch(/\btext-texto\b/);
    expect(boton!.atributos).toMatch(/\bw-full\b/);
    expect(boton!.atributos).toMatch(/\bmin-h-11\b/);
    expect(boton!.atributos).not.toContain('bg-naranja-600');
    // Con su icono de panel, que no se lee.
    expect(boton!.dentro).toMatch(/<svg[^>]*aria-hidden="true"/);
    // «Cerrar sesión de Google» sigue en su sitio.
    expect(control(html, T.ajustes.cerrarSesionGoogle)).toBeDefined();
  });

  it('con acceso de voluntario, no se ve', () => {
    acceso = { tipo: 'voluntario', sesion: { nombre: 'Voluntaria', apellido: 'Pruebas' } };
    const html = pintar();
    expect(control(html, T.ajustes.irAlPanel)).toBeUndefined();
    expect(html).not.toContain('href="/admin"');
  });
});
