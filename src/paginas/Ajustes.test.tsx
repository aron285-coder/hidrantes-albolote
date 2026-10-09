// docs/26 RV-113 (DEC-164): en Ajustes, la fila «Cuenta de jefatura» lleva un botón secundario
// «Panel de jefatura» que abre /admin dentro de la app. Un voluntario no lo ve. Vitest corre en Node,
// sin DOM: se pinta a HTML con react-dom/server y lo que lee el estado de la app se simula.

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let acceso: Record<string, unknown> = { tipo: 'nada' };

const app = vi.hoisted(() => ({
  conexion: 'bien',
  instalar: 'instalada',
  guardadoEn: null as number | null,
}));
vi.mock('@/hooks/estado', () => ({
  useAcceso: () => acceso,
  useConexion: () => app.conexion,
  useInstalar: () => app.instalar,
  useMapabase: () => ({ progreso: null, descargado: null, fallo: false }),
  usePuntos: () => ({
    puntos: Array.from({ length: 15 }, () => ({})),
    guardadoEn: app.guardadoEn,
    sincronizando: false,
  }),
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
vi.mock('@/lib/errores', () => ({ anotarError: vi.fn() }));
const { olvidarTemasJefatura, pulsadores, salirDeGoogle } = vi.hoisted(() => ({
  olvidarTemasJefatura: vi.fn(),
  pulsadores: new Map<string, () => void>(),
  salirDeGoogle: vi.fn(async () => undefined),
}));
vi.mock('@/lib/acceso', () => ({ cambiarFirma: vi.fn(), cerrarSesionVoluntario: vi.fn(), salirDeGoogle }));
vi.mock('@/lib/panel/push-jefatura', () => ({ olvidarTemasJefatura }));
// El Boton de verdad, pero se apunta qué hace cada uno al pulsarlo: sin DOM no se puede pulsar.
vi.mock('@/componentes/Boton', async (original) => {
  const { Boton: Real } = await original<typeof import('@/componentes/Boton')>();
  return {
    Boton: (p: Parameters<typeof Real>[0]) => {
      if (typeof p.children === 'string' && p.onClick) pulsadores.set(p.children, p.onClick as () => void);
      return Real(p);
    },
  };
});
const almacen = vi.hoisted(() => ({ protegido: null as boolean | null }));
vi.mock('@/lib/almacen', () => ({ leer: (k: string) => (k === 'almacen_persistente' ? almacen.protegido : null) }));
vi.mock('@/lib/conexion', () => ({ reintentarAhora: vi.fn() }));
vi.mock('@/lib/instalar', () => ({ instalar: vi.fn() }));
vi.mock('@/lib/mapabase', () => ({ descargarMapabase: vi.fn(), hayVersionNuevaMapabase: () => false }));
vi.mock('@/lib/pwa', () => ({ pedirRecarga: vi.fn() }));
vi.mock('@/lib/tema', () => ({ guardarTema: vi.fn(), leerTema: () => 'sistema' }));
vi.mock('@/lib/capas', () => ({
  NOMBRE_CAPA: { calles: 'Calles' },
  capaGuardada: () => 'calles',
  guardarCapa: vi.fn(),
}));
const novedades = vi.hoisted(() => ({
  actuales: { version: null as string | null, fecha: null, lineas: [] as { version: string; texto: string }[] },
}));
vi.mock('@/lib/novedades', async (original) => ({
  agruparNovedades: (await original<typeof import('@/lib/novedades')>()).agruparNovedades,
  get NOVEDADES() {
    return novedades.actuales;
  },
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

describe('Ajustes · Cerrar sesión de Google (docs/33 RV-325, N5)', () => {
  beforeEach(() => {
    acceso = { tipo: 'jefatura', correo: 'jefa@example.org' };
    pulsadores.clear();
    olvidarTemasJefatura.mockClear();
    salirDeGoogle.mockClear();
  });

  it('borra lo que este navegador recuerda de los avisos de jefatura, como «Salir» en el panel', () => {
    pintar();
    const pulsar = pulsadores.get(T.ajustes.cerrarSesionGoogle);
    expect(pulsar).toBeDefined();
    pulsar!();
    expect(olvidarTemasJefatura).toHaveBeenCalledTimes(1);
    expect(salirDeGoogle).toHaveBeenCalledTimes(1);
  });
});

describe('Ajustes sin jerga (docs/33 RV-320, U11)', () => {
  const textoDe = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  /** Los grupos con nombre (cada tarjeta de Ajustes). */
  const grupos = (html: string) => [...html.matchAll(/role="group" aria-label="([^"]*)"/g)].map((m) => m[1]);
  /** La tarjeta del mapa: desde su marca hasta la tarjeta siguiente («Capa por defecto»). */
  const tarjetaMapa = (html: string) => {
    const desde = html.indexOf('data-testid="tarjeta-mapa"');
    const hasta = html.indexOf(`aria-label="${T.ajustes.capaPorDefecto}"`, desde);
    expect(desde).toBeGreaterThan(-1);
    expect(hasta).toBeGreaterThan(desde);
    return html.slice(desde, hasta);
  };

  beforeEach(() => {
    acceso = { tipo: 'voluntario', sesion: { nombre: 'Voluntaria', apellido: 'Pruebas' } };
    almacen.protegido = true;
    novedades.actuales = { version: null, fecha: null, lineas: [] };
    app.conexion = 'bien';
    app.instalar = 'instalada';
    app.guardadoEn = Date.now() - 60_000;
  });

  it('una sola tarjeta «Mapa sin cobertura» con el mapa, los puntos guardados y «Sincronizar»', () => {
    const html = pintar();
    expect(grupos(html)).toContain(T.ajustes.mapaSinCobertura);
    expect(grupos(html)).not.toContain('Puntos guardados');
    expect(grupos(html)).not.toContain('Guardado protegido');
    const tarjeta = tarjetaMapa(html);
    expect(textoDe(tarjeta)).toContain('15 puntos guardados');
    expect(textoDe(tarjeta)).toContain(T.ajustes.noDescargadoDetalle);
    expect(tarjeta).toMatch(/<button[^>]*>Sincronizar<\/button>/);
    expect(tarjeta).toMatch(/<button[^>]*>Descargar<\/button>/);
  });

  it('sin sincronizar todavía, lo dice en la tarjeta', () => {
    app.guardadoEn = null;
    expect(textoDe(tarjetaMapa(pintar()))).toContain(T.ajustes.sinSincronizar);
  });

  it('sin cobertura: los dos botones deshabilitados y el motivo una sola vez (UI-02)', () => {
    app.conexion = 'sin_cobertura';
    const tarjeta = tarjetaMapa(pintar());
    expect(tarjeta).toMatch(/<button[^>]*disabled=""[^>]*>Sincronizar<\/button>/);
    expect(tarjeta).toMatch(/<button[^>]*disabled=""[^>]*>Descargar<\/button>/);
    expect(textoDe(tarjeta).split(T.mapa.necesitaCobertura)).toHaveLength(2);
  });

  it('«Guardado protegido» en una frase, sí o no; sin respuesta del navegador, nada', () => {
    expect(textoDe(pintar())).toContain(T.ajustes.guardadoProtegidoSi);
    almacen.protegido = false;
    app.instalar = 'disponible';
    let html = textoDe(pintar());
    expect(html).toContain(T.ajustes.guardadoProtegidoNo);
    expect(html).not.toContain('Guardado protegido');
    // Ya instalada, no se aconseja instalarla.
    app.instalar = 'instalada';
    html = textoDe(pintar());
    expect(html).toContain(T.ajustes.guardadoProtegidoNoInstalada);
    expect(html).not.toContain(T.ajustes.guardadoProtegidoNo);
    almacen.protegido = null;
    html = textoDe(tarjetaMapa(pintar()));
    expect(html).not.toContain(T.ajustes.guardadoProtegidoSi);
    expect(html).not.toContain(T.ajustes.guardadoProtegidoNoInstalada);
  });

  it('«Novedades de la versión 0.x.y» sin repetir la versión en cada línea; las de antes, plegadas', () => {
    novedades.actuales = {
      version: '0.10.1',
      fecha: null,
      lineas: [
        { version: '0.10.1', texto: 'Nuevo tipo de enganche «Directo»' },
        { version: '0.10.0', texto: 'La lista dice a qué distancia está' },
      ],
    };
    const html = pintar();
    expect(textoDe(html)).toContain('Novedades de la versión 0.10.1');
    expect(html).toContain('<li>Nuevo tipo de enganche «Directo»</li>');
    expect(html).not.toMatch(/<li>[^<]*0\.10\.1/);
    const plegadas = /<details[^>]*data-testid="novedades-anteriores"[^>]*>(.*?)<\/details>/s.exec(html)?.[1] ?? '';
    expect(plegadas).toMatch(/<summary[^>]*>Ver versiones anteriores<\/summary>/);
    expect(plegadas).toContain('<li>La lista dice a qué distancia está</li>');
    // Sin «open»: plegadas.
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it('una versión sin líneas propias lo dice, con las anteriores plegadas; sin nada, «Todavía no hay…»', () => {
    novedades.actuales = {
      version: '0.10.2',
      fecha: null,
      lineas: [{ version: '0.10.1', texto: 'Algo de antes' }],
    };
    let html = pintar();
    expect(textoDe(html)).toContain(T.ajustes.sinNovedadesVersion);
    expect(html).toContain('data-testid="novedades-anteriores"');
    novedades.actuales = { version: null, fecha: null, lineas: [] };
    html = pintar();
    expect(textoDe(html)).toContain(T.ajustes.sinNovedades);
    expect(html).not.toContain('data-testid="novedades-anteriores"');
  });
});
