// docs/27 RV-114 (DEC-165): la hoja de Cercanos, con lo justo para un servicio. Cada fila da el
// código, "diámetro · estado", la distancia y el rumbo, y un solo botón, Cómo llegar. La posición
// vieja o poco precisa se avisa en el subtítulo, sin recuadros. Vitest corre en Node, sin DOM: se
// pinta a HTML con react-dom/server, y los manejadores se buscan en el árbol de elementos.

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Sin DOM no hay renderizador que guarde estado: para leer el árbol se llama al componente como una
// función, con useState y useRef sin estado. renderToStaticMarkup usa su propio React y no lo nota.
vi.mock('react', async (original) => {
  const r = await original<typeof import('react')>();
  return {
    ...r,
    useState: <S,>(inicial: S | (() => S)) => [
      typeof inicial === 'function' ? (inicial as () => S)() : inicial,
      () => {},
    ],
    useRef: <V,>(v: V) => ({ current: v }),
  };
});

const { PanelCercanos } = await import('./PanelCercanos');
const { T } = await import('@/lib/textos');
const { enlaceComoLlegar } = await import('@/lib/ficha');
const { hace } = await import('@/lib/formato');
type Props = Parameters<typeof PanelCercanos>[0];
type Estado = Props['estado'];

const ORIGEN = { lat: 37.2305, lng: -3.656 };

const BASE = {
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'regular',
  racor: null,
  descripcion_fallo: null,
  descripcion: null,
  direccion: 'Calle Real 5',
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-01',
  actualizado_en: '2026-08-01T00:00:00Z',
  radio_px: 11,
  revision_caducada: false,
} as const;

const CANDIDATOS = [
  { punto: { ...BASE, id: 'p1', codigo: 'HID-9002', lat: 37.2329, lng: -3.656 }, metros: 264, rumbo: 0 },
  {
    punto: { ...BASE, id: 'p2', codigo: 'HID-9006', caudal: 'bueno', diametro_mm: 70, lat: 37.228, lng: -3.653 },
    metros: 357,
    rumbo: 135,
  },
  {
    punto: {
      ...BASE,
      id: 'p3',
      codigo: 'BOC-9010',
      tipo: 'boca_riego',
      diametro_mm: 45,
      racor: 'granada',
      lat: 37.24,
      lng: -3.66,
    },
    metros: 1240,
    rumbo: 315,
  },
] as unknown as Estado['candidatos'];

const ESTADO = {
  origen: ORIGEN,
  desdeGps: true,
  buscando: false,
  precision: 8,
  posicionVieja: null,
  candidatos: CANDIDATOS,
  soloHidrantes: false,
} as Estado;

function props(cambios: Partial<Estado> = {}, manejadores: Partial<Props> = {}): Props {
  return {
    estado: { ...ESTADO, ...cambios },
    variante: 'hoja',
    alCerrar: () => {},
    alMarcarEnMapa: () => {},
    alCambiarSoloHidrantes: () => {},
    alElegir: () => {},
    alVerLista: () => {},
    ...manejadores,
  } as Props;
}

const pintar = (p: Props) => renderToStaticMarkup(<PanelCercanos {...p} />);
/** El texto que se ve, sin etiquetas y con los espacios juntos. */
const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
/** Cada <li> de la lista, en HTML. */
const filas = (html: string) => [...html.matchAll(/<li\b[^>]*>(.*?)<\/li>/gs)].map((m) => m[1]!);
/** El subtítulo de la cabecera (lo que va detrás de "Cercanos"). */
const subtitulo = (html: string) => texto(/<p[^>]*data-subtitulo[^>]*>(.*?)<\/p>/s.exec(html)?.[1] ?? '');

/** Los elementos del árbol que cumplen `si`, sin entrar en los componentes hijos. */
function buscar(
  nodo: ReactNode,
  si: (e: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(nodo)) return nodo.flatMap((n) => buscar(n as ReactNode, si));
  if (!isValidElement<Record<string, unknown>>(nodo)) return [];
  const propios = si(nodo) ? [nodo] : [];
  return [...propios, ...buscar(nodo.props.children as ReactNode, si)];
}
const arbol = (p: Props) => PanelCercanos(p) as ReactNode;

describe('la fila de Cercanos (RV-114)', () => {
  const html = pintar(props());

  it('da código, "diámetro · estado", distancia y rumbo, y nada más', () => {
    const [primera, , tercera] = filas(html);
    expect(texto(primera!)).toContain('HID-9002');
    expect(texto(primera!)).toContain(T.incidente.detalle(T.formato.mm(100), T.formulario.regular));
    expect(texto(primera!)).toContain('264 m');
    expect(texto(primera!)).toMatch(/\bN\b/);
    expect(texto(tercera!)).toContain('1,2 km');
    for (const f of filas(html)) {
      const t = texto(f).toLowerCase();
      expect(t).not.toContain('tramo');
      expect(t).not.toContain('revisado');
      expect(t).not.toContain('hidrante');
      expect(t).not.toContain('boca de riego');
      // "Medir tendido" ya no está en la fila: medir sigue en la barra del mapa y en ¿Qué hay aquí?
      expect(t).not.toContain('medir');
    }
  });

  it('un solo botón por fila: "Cómo llegar", que lleva al punto', () => {
    const lista = filas(html);
    expect(lista).toHaveLength(3);
    lista.forEach((f, i) => {
      const enlaces = [...f.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1]!);
      expect(enlaces).toHaveLength(1);
      expect(enlaces[0]).toContain(`aria-label="${T.ficha.comoLlegar}"`);
      expect(enlaces[0]).toContain(`title="${T.ficha.comoLlegar}"`);
      expect(enlaces[0]).toContain(`href="${enlaceComoLlegar(CANDIDATOS[i]!.punto).replace(/&/g, '&amp;')}"`);
      // El resto de la fila es el botón que abre la ficha.
      expect([...f.matchAll(/<button\b/g)]).toHaveLength(1);
    });
  });

  it('tocar la fila abre la ficha de ese punto', () => {
    const alElegir = vi.fn();
    const [fila] = buscar(arbol(props({}, { alElegir })), (e) => e.type === 'li');
    const [boton] = buscar(fila, (e) => e.type === 'button');
    (boton!.props.onClick as () => void)();
    expect(alElegir).toHaveBeenCalledWith('p1');
  });

  it('sin "Compartir el incidente", sin "Datos de hace N" y sin "El más cercano…"', () => {
    const t = texto(html);
    expect(t).not.toContain('Compartir');
    expect(t).not.toContain('Datos de');
    expect(t).not.toContain('El más cercano');
    expect(html).not.toContain('role="alert"');
  });
});

describe('el subtítulo y sus avisos (DEC-165)', () => {
  it('con el GPS al día y preciso, solo "en línea recta", sin role="status"', () => {
    const html = pintar(props());
    expect(subtitulo(html)).toBe(`· ${T.incidente.lineaRecta}`);
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain(T.incidente.marcarEnMapa);
  });

  it('posición vieja: una línea en el subtítulo, en naranja de texto, sin recuadro', () => {
    const momento = Date.now() - 5 * 60_000;
    const html = pintar(props({ posicionVieja: momento }));
    expect(subtitulo(html)).toBe(`· ${T.incidente.lineaRecta} · ${T.incidente.posicionDe(hace(momento))}`);
    expect(/<p[^>]*data-subtitulo[^>]*>/.exec(html)?.[0]).toContain('role="status"');
    expect(html).toContain('text-naranja-texto');
    expect(html).not.toContain('bg-oro-100');
  });

  it('poco precisa: "posición poco precisa (±80 m)" y "Marcar en el mapa"', () => {
    const alMarcarEnMapa = vi.fn();
    const p = props({ precision: 80 }, { alMarcarEnMapa });
    const html = pintar(p);
    expect(subtitulo(html)).toBe(`· ${T.incidente.lineaRecta} · ${T.incidente.pocoPrecisa(80)}`);
    expect(html).not.toContain('bg-oro-100');
    const [marcar] = buscar(arbol(p), (e) => e.type === 'button' && e.props.children === T.incidente.marcarEnMapa);
    (marcar!.props.onClick as () => void)();
    expect(alMarcarEnMapa).toHaveBeenCalledOnce();
  });

  it('vieja y poco precisa a la vez: solo el de poco precisa, que lleva acción', () => {
    const html = pintar(props({ precision: 80, posicionVieja: Date.now() - 5 * 60_000 }));
    expect(subtitulo(html)).toBe(`· ${T.incidente.lineaRecta} · ${T.incidente.pocoPrecisa(80)}`);
    expect(html).toContain(T.incidente.marcarEnMapa);
  });

  it('desde un punto marcado: "desde el punto marcado · en línea recta"', () => {
    const html = pintar(props({ desdeGps: false, precision: null }));
    expect(subtitulo(html)).toBe(`· ${T.incidente.desdePuntoMarcado} · ${T.incidente.lineaRecta}`);
  });

  it('el «·» nunca se queda solo al partir la línea: va pegado a lo que sigue (docs/33 RV-316, D8)', () => {
    for (const p of [props({ posicionVieja: Date.now() - 5 * 60_000 }), props({ desdeGps: false, precision: null })]) {
      const crudo = /<p[^>]*data-subtitulo[^>]*>(.*?)<\/p>/s.exec(pintar(p))?.[1] ?? '';
      const separadores = [...crudo.replace(/<[^>]+>/g, '').matchAll(/·(.)/gs)].map((m) => m[1]);
      expect(separadores.length).toBeGreaterThan(1);
      // Detrás de cada «·», un espacio duro (U+00A0): el salto solo puede ir antes del «·».
      expect(separadores.every((c) => c === String.fromCharCode(0xa0))).toBe(true);
    }
  });

  it('sin posición: solo el mensaje, sin subtítulo ni lista', () => {
    const html = pintar(props({ origen: null, candidatos: [] }));
    expect(texto(html)).toContain(T.incidente.sinPosicion);
    expect(html).not.toContain('data-subtitulo');
    expect(filas(html)).toHaveLength(0);
  });
});

describe('"Solo hidrantes" (RV-114)', () => {
  it('es un chip con role="switch" que avisa al cambiar', () => {
    const alCambiarSoloHidrantes = vi.fn();
    const p = props({}, { alCambiarSoloHidrantes });
    expect(pintar(p)).toMatch(/<input[^>]*role="switch"/);
    const [interruptor] = buscar(arbol(p), (e) => e.props.role === 'switch');
    (interruptor!.props.onChange as (e: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    expect(alCambiarSoloHidrantes).toHaveBeenCalledWith(true);
  });
});
