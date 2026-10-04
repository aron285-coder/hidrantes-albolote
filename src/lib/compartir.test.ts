// Compartir un punto o un sitio (FR-75, docs/18 GM-05).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { compartir, textoPunto, textoUbicacion } from './compartir';
import { interpretar } from './coordenadas';
import type { Punto } from './puntos';

const PUNTO: Punto = {
  id: 'p1',
  codigo: 'HID-0123',
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion_fallo: null,
  descripcion: 'Detrás del contenedor, llamar a Ana',
  direccion: 'Calle Real 5',
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-08-01',
  actualizado_en: '2026-09-01T00:00:00Z',
  lat: 37.2305,
  lng: -3.656,
  radio_px: 11,
  revision_caducada: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('textos para compartir', () => {
  it('textoPunto da el formato exacto, con la UTM del primer vector de GM-01', () => {
    expect(textoPunto(PUNTO)).toBe(
      [
        'HID-0123 · hidrante 100 mm · bueno',
        'Calle Real 5, Albolote',
        'WGS84 · grados decimales: 37.230500, -3.656000',
        'ETRS89 · UTM huso 30N: 30S 441808 4120645',
        'https://www.google.com/maps/search/?api=1&query=37.230500,-3.656000',
      ].join('\n'),
    );
  });

  it('no contiene la descripción libre (la escriben voluntarios, FR-27)', () => {
    expect(textoPunto(PUNTO)).not.toContain('contenedor');
    expect(textoPunto(PUNTO)).not.toContain('Ana');
  });

  it('sin dirección, la línea del lugar lleva solo el núcleo', () => {
    expect(textoPunto({ ...PUNTO, direccion: null }).split('\n')[1]).toBe('Albolote');
  });

  it('una ubicación: la calle si se conoce, las coordenadas y el enlace', () => {
    expect(textoUbicacion({ lat: 37.2305, lng: -3.656 }, 'Calle Real')).toBe(
      [
        'Calle Real',
        'WGS84 · grados decimales: 37.230500, -3.656000',
        'ETRS89 · UTM huso 30N: 30S 441808 4120645',
        'https://www.google.com/maps/search/?api=1&query=37.230500,-3.656000',
      ].join('\n'),
    );
    expect(textoUbicacion({ lat: 37.2305, lng: -3.656 }).split('\n')).toHaveLength(3);
  });

  it('cada coordenada lleva delante el nombre de su sistema (RV-109, DEC-157)', () => {
    const texto = textoPunto(PUNTO);
    expect(texto).toContain('WGS84');
    expect(texto).toContain('ETRS89 · UTM huso 30N');
    expect(texto).not.toContain('(ETRS89)');
  });

  it('cada línea de coordenadas que se comparte se puede pegar en la búsqueda (FR-73)', () => {
    const [wgs84, utm] = textoUbicacion({ lat: 37.2305, lng: -3.656 }).split('\n');
    for (const linea of [wgs84!, utm!]) {
      const p = interpretar(linea);
      expect(p, linea).not.toBeNull();
      expect(Math.abs(p!.lat - 37.2305)).toBeLessThan(0.00002);
      expect(Math.abs(p!.lng + 3.656)).toBeLessThan(0.00002);
    }
  });

  it('fuera del huso 30 solo va la línea WGS84, sin UTM', () => {
    const texto = textoUbicacion({ lat: 41.3874, lng: 2.1686 });
    expect(texto.split('\n')[0]).toBe('WGS84 · grados decimales: 41.387400, 2.168600');
    expect(texto).not.toContain('UTM');
  });
});

describe('compartir', () => {
  it('usa el menú del móvil si lo hay', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    expect(await compartir('HID-0123', 'texto')).toBe('compartido');
    expect(share).toHaveBeenCalledWith({ title: 'HID-0123', text: 'texto' });
  });

  it('cancelar el menú (AbortError) es cancelado, sin avisar', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    expect(await compartir('t', 'texto')).toBe('cancelado');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('sin menú, al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await compartir('t', 'texto')).toBe('copiado');
    expect(writeText).toHaveBeenCalledWith('texto');
  });

  it('sin menú ni portapapeles, fallo: quien llama enseña el texto', async () => {
    vi.stubGlobal('navigator', {});
    expect(await compartir('t', 'texto')).toBe('fallo');
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } });
    expect(await compartir('t', 'texto')).toBe('fallo');
  });
});
