// La ficha de un punto (06 §5). Vitest corre en Node, sin DOM: se pinta a HTML con react-dom/server.

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Punto } from '@/tipos/punto';

// La hoja se pinta en <body> con un portal; sin DOM, se pinta en su sitio.
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (n: ReactNode) => n,
}));
vi.stubGlobal('document', { body: {} });
vi.mock('@/hooks/estado', () => ({ useConexion: () => 'bien' }));

const { Ficha } = await import('./Ficha');
const { T } = await import('@/lib/textos');
const { bandaDe, nombreCaudal } = await import('@/lib/ficha');

const BOCA: Punto = {
  id: 'p2',
  codigo: 'BOC-0031',
  tipo: 'boca_riego',
  diametro_mm: 45,
  caudal: 'bueno',
  racor: 'granada',
  descripcion_fallo: null,
  descripcion: null,
  direccion: 'Calle Real 5',
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

const pintar = (p: Punto, conCabecera = true) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <Ficha punto={p} posicion={null} guardadoEn={null} alCerrar={() => {}} conCabecera={conCabecera} />
    </MemoryRouter>,
  );

/** El texto que se lee, sin etiquetas. */
const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** La rejilla de datos fijos: cada etiqueta con su valor, en orden. */
function rejilla(html: string): [string, string][] {
  const dl = /<dl\b[^>]*>(.*?)<\/dl>/s.exec(html)?.[1] ?? '';
  return [...dl.matchAll(/<dt\b[^>]*>(.*?)<\/dt>\s*<dd\b[^>]*>(.*?)<\/dd>/gs)].map(([, k, v]) => [texto(k), texto(v)]);
}

/** La banda del estado: sus clases y su texto. */
function banda(html: string) {
  const m = /<header\b([^>]*data-banda="[^"]*"[^>]*)>(.*?)<\/header>/s.exec(html);
  return { atributos: m?.[1] ?? '', texto: texto(m?.[2] ?? '') };
}

/** Los botones y enlaces: texto, aria-label y si son primarios. */
function acciones(html: string) {
  return [...html.matchAll(/<(button|a)\b([^>]*)>(.*?)<\/\1>/gs)].map(([, , atributos, dentro]) => ({
    texto: texto(dentro),
    etiqueta: /aria-label="([^"]*)"/.exec(atributos)?.[1] ?? null,
    primario: /data-variante="primario"|bg-naranja-600|bg-marino-950/.test(atributos),
  }));
}

const HIDRANTE: Punto = { ...BOCA, codigo: 'HID-0001', tipo: 'hidrante', diametro_mm: 100, racor: null };

// docs/25 RV-112 (DEC-163): en una boca, el tipo de enganche; nunca «racor».
describe('tipo de enganche en la ficha (RV-112)', () => {
  it('la rejilla dice "Tipo de enganche" con el valor "Granada", y nada dice racor', () => {
    const html = pintar(BOCA);
    expect(rejilla(html)).toContainEqual(['Tipo de enganche', 'Granada']);
    expect(texto(html)).not.toMatch(/racor/i);
  });

  // docs/29 RV-121 (DEC-170).
  it('una boca con enganche Directo dice "Directo"', () => {
    expect(rejilla(pintar({ ...BOCA, racor: 'directo' }))).toContainEqual(['Tipo de enganche', 'Directo']);
  });

  // Compatibilidad (04 §12): un valor que esta versión no conoce se lee como «Otro», sin romperse.
  it('un enganche desconocido se enseña como "Otro"', () => {
    const raro = { ...BOCA, racor: 'nuevo_tipo' } as unknown as Punto;
    expect(rejilla(pintar(raro))).toContainEqual(['Tipo de enganche', 'Otro']);
  });

  it('un hidrante no enseña enganche', () => {
    expect(texto(pintar(HIDRANTE))).not.toMatch(/enganche/i);
  });
});

// docs/25 RV-108 (DEC-156): banda del color del estado arriba y ficha compacta.
describe('ficha con banda de estado (RV-108)', () => {
  const ESTADOS = ['bueno', 'regular', 'malo', 'barro', 'no_funciona'] as const;

  it.each(ESTADOS)('%s: la banda lleva la clase del estado y el estado en mayúsculas', (caudal) => {
    const b = banda(pintar({ ...BOCA, caudal }));
    expect(b.atributos).toContain(`data-banda="${caudal}"`);
    expect(b.atributos).toContain(bandaDe(caudal).clase);
    expect(b.texto).toContain(nombreCaudal(caudal));
  });

  it('el estado va en Barlow Condensed 700 de 24 px y en mayúsculas', () => {
    const html = pintar(BOCA);
    expect(html).toMatch(
      /<p\b[^>]*class="[^"]*font-titulo[^"]*text-\[24px\][^"]*font-bold[^"]*uppercase[^"]*"[^>]*>Bueno<\/p>/,
    );
  });

  it('en regular, el texto de la banda es --marino-950; en los demás, blanco', () => {
    expect(banda(pintar({ ...BOCA, caudal: 'regular' })).atributos).toContain('text-marino-950');
    for (const caudal of ['bueno', 'malo', 'barro', 'no_funciona'] as const)
      expect(banda(pintar({ ...BOCA, caudal })).atributos).toContain('text-white');
  });

  it('debajo del estado, "revisado hace N · fecha"; sin revisar, "sin revisar desde hace N"', () => {
    const al = banda(pintar({ ...BOCA, fecha_ultima_revision: new Date().toISOString() })).texto;
    expect(al).toMatch(/revisado hace /);
    const caducado = banda(pintar({ ...BOCA, fecha_ultima_revision: '2020-01-10', revision_caducada: true })).texto;
    expect(caducado).toMatch(/sin revisar desde hace \d+ años/);
    expect(caducado).not.toMatch(/revisado hace/);
  });

  it('la X de cerrar va en la banda (tableta y ordenador); en el móvil cierra la flecha de la barra', () => {
    expect(/<header\b[^>]*data-banda[^>]*>(?:(?!<\/header>).)*aria-label="Cerrar"/s.test(pintar(BOCA))).toBe(true);
    expect(pintar(BOCA, false)).not.toContain('aria-label="Cerrar"');
    // En el móvil la banda sigue arriba, aunque sin X.
    expect(banda(pintar(BOCA, false)).texto).toContain('Bueno');
  });

  it('código en JetBrains Mono de 21 px con el núcleo a la derecha', () => {
    const html = pintar(BOCA);
    expect(html).toMatch(/<h2\b[^>]*class="[^"]*font-datos[^"]*text-\[21px\][^"]*"[^>]*>BOC-0031<\/h2>/);
    expect(html).toMatch(/text-texto-suave[^"]*"[^>]*>Albolote/);
  });

  it('rejilla: tipo y diámetro; en bocas además tipo de enganche y dirección; en hidrantes la dirección a todo el ancho', () => {
    expect(rejilla(pintar(BOCA))).toEqual([
      ['Tipo', 'Boca de riego'],
      ['Diámetro', '45 mm'],
      ['Tipo de enganche', 'Granada'],
      ['Dirección', 'Calle Real 5'],
    ]);
    const h = pintar(HIDRANTE);
    expect(rejilla(h)).toEqual([
      ['Tipo', 'Hidrante'],
      ['Diámetro', '100 mm'],
      ['Dirección', 'Calle Real 5'],
    ]);
    expect(h).toMatch(/<div class="[^"]*col-span-2[^"]*"><dt[^>]*>Dirección<\/dt>/);
  });

  it('la revisión no se repite fuera de la banda, y no quedan los chips', () => {
    const html = pintar(BOCA);
    expect(html).not.toContain('rounded-chip');
    expect(texto(html).match(/revisado hace|sin revisar desde/g)).toHaveLength(1);
    expect(texto(html)).not.toContain('Última revisión');
  });

  it('un punto que no funciona: el fallo a todo el ancho debajo de la rejilla, y la descripción libre también', () => {
    const html = pintar({
      ...BOCA,
      caudal: 'no_funciona',
      descripcion_fallo: 'Tapa soldada',
      descripcion: 'Junto al banco',
    });
    const finRejilla = html.indexOf('</dl>');
    expect(html.indexOf('Tapa soldada')).toBeGreaterThan(finRejilla);
    expect(html.indexOf('Junto al banco')).toBeGreaterThan(finRejilla);
  });

  it('"Cómo llegar" es el único botón con el estilo principal', () => {
    const lista = acciones(pintar(BOCA));
    expect(lista.filter((a) => a.primario).map((a) => a.texto)).toEqual([T.ficha.comoLlegar]);
    const proponer = /<button\b([^>]*)>(?:(?!<\/button>).)*Proponer un cambio/s.exec(pintar(BOCA))?.[1] ?? '';
    expect(proponer).toContain('border-naranja-600');
    expect(proponer).toContain('text-naranja-texto');
  });

  it('"Compartir" es un botón de icono de 46 px con aria-label', () => {
    const compartir = acciones(pintar(BOCA)).find((a) => a.etiqueta === T.compartir.boton);
    expect(compartir).toBeDefined();
    expect(compartir!.texto).toBe('');
    expect(pintar(BOCA)).toMatch(/<button\b[^>]*aria-label="Compartir"[^>]*class="[^"]*size-\[46px\]/);
  });

  // docs/33 RV-314 (U5): sin foto, una franja de 44 px con icono y «Sin foto», no un bloque ni nada.
  it('sin foto, una franja de 44 px con icono y «Sin foto»', () => {
    const html = pintar(BOCA);
    const franja = /<div[^>]*data-testid="foto-franja"[^>]*>(.*?)<\/div>/s.exec(html);
    expect(franja).not.toBeNull();
    expect(franja![0]).toMatch(/\bmin-h-11\b/);
    expect(franja![0]).not.toMatch(/h-\[1[57]0px\]/);
    expect(franja![1]).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(texto(franja![1])).toBe(T.ficha.sinFoto);
    expect(html).not.toContain('<img');
  });

  it('una foto que no se puede pedir (sin URL de Supabase) lo dice en la franja, no desaparece', () => {
    // En vitest no hay VITE_SUPABASE_URL: urlFoto() da null aunque haya ruta. Sin dirección no hay
    // a quién volver a pedirla: sin «Reintentar».
    const html = pintar({ ...BOCA, foto_path: 'a.jpg' });
    expect(html).toContain('data-testid="foto-franja"');
    expect(texto(html)).toContain(T.ficha.fotoNoCarga);
    expect(texto(html)).not.toContain(T.ficha.reintentarFoto);
  });

  it('con las dos fotos, la etiqueta "Conexión · 1/2"', () => {
    const html = pintar({ ...BOCA, foto_path: 'a.jpg', foto_sitio_path: 'b.jpg' });
    expect(texto(html)).toContain('Conexión · 1/2');
  });

  it('"Datos sincronizados hace N" al final, en texto suave y centrado', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Ficha punto={BOCA} posicion={null} guardadoEn={Date.now() - 4 * 60_000} alCerrar={() => {}} />
      </MemoryRouter>,
    );
    const sinc = html.indexOf('Datos sincronizados hace 4 min');
    expect(sinc).toBeGreaterThan(html.indexOf(T.coordenadas.titulo));
    expect(html).toMatch(/<p class="[^"]*text-texto-suave[^"]*text-center[^"]*">Datos sincronizados/);
  });
});
