import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Callejero, callejeroCargado, cargarCallejero, llevaNumero, olvidarCallejero } from './callejero';
import {
  MAX_RESULTADOS_CALLES,
  buscarCalles,
  calleCercana,
  municipioCercano,
  puntoCercano,
  recuadroDe,
} from './callejero-buscar';

const REAL: Callejero = JSON.parse(readFileSync('public/callejero.json', 'utf8'));

const EJEMPLO: Callejero = {
  version: '20260923',
  fuente: '© colaboradores de OpenStreetMap (ODbL)',
  entradas: [
    {
      n: 'Calle Real',
      t: 'calle',
      m: 'albolote',
      g: [
        [
          [-3.658, 37.231],
          [-3.656, 37.233],
        ],
      ],
    },
    {
      n: 'Calle Real',
      t: 'calle',
      m: 'calicasas',
      g: [
        [
          [-3.6225, 37.273],
          [-3.622, 37.2735],
        ],
      ],
    },
    {
      n: 'Avenida de Andalucía',
      t: 'calle',
      m: 'albolote',
      g: [
        [
          [-3.65, 37.229],
          [-3.648, 37.2295],
        ],
      ],
    },
    {
      n: 'Camino Real de Granada',
      t: 'calle',
      m: 'albolote',
      g: [
        [
          [-3.66, 37.22],
          [-3.659, 37.221],
        ],
      ],
    },
    { n: 'Polígono Juncaril', t: 'lugar', c: [-3.6414, 37.2259] },
  ],
};

describe('buscarCalles (FR-73)', () => {
  it.each(['c/ real', 'c/real', 'calle real', 'CALLE REAL', 'Calle Real 12', 'real, 12'])(
    '"%s" encuentra "Calle Real"',
    (q) => {
      expect(buscarCalles(EJEMPLO, q)[0]?.n).toBe('Calle Real');
    },
  );

  it('"avda andalucia" encuentra "Avenida de Andalucía"', () => {
    expect(buscarCalles(EJEMPLO, 'avda andalucia').map((e) => e.n)).toEqual(['Avenida de Andalucía']);
    expect(buscarCalles(EJEMPLO, 'av. de andalucía')[0]?.n).toBe('Avenida de Andalucía');
  });

  it('desempate por el municipio del centro del mapa', () => {
    expect(buscarCalles(EJEMPLO, 'calle real', 'calicasas')[0]).toMatchObject({ n: 'Calle Real', m: 'calicasas' });
    expect(buscarCalles(EJEMPLO, 'calle real', 'albolote')[0]).toMatchObject({ n: 'Calle Real', m: 'albolote' });
  });

  it('el tipo de vía buscado pasa delante, pero no es obligatorio', () => {
    expect(buscarCalles(EJEMPLO, 'camino real')[0]?.n).toBe('Camino Real de Granada');
    expect(buscarCalles(EJEMPLO, 'real').map((e) => e.n)).toContain('Camino Real de Granada');
  });

  it('lugares también', () => {
    expect(buscarCalles(EJEMPLO, 'juncaril')[0]).toMatchObject({ t: 'lugar', n: 'Polígono Juncaril' });
  });

  it('como mucho 8 resultados', () => {
    expect(buscarCalles(REAL, 'calle').length).toBe(0);
    expect(buscarCalles(REAL, 'a').length).toBe(MAX_RESULTADOS_CALLES);
  });

  it('con el callejero real, "c/ real" da la Calle Real de Albolote', () => {
    expect(buscarCalles(REAL, 'c/ real', 'albolote')[0]).toMatchObject({ n: 'Calle Real', m: 'albolote' });
  });

  it('sin palabras que buscar, nada', () => {
    expect(buscarCalles(EJEMPLO, 'calle')).toEqual([]);
    expect(buscarCalles(EJEMPLO, '12')).toEqual([]);
  });
});

describe('llevaNumero', () => {
  it('detecta el número de portal del final', () => {
    for (const t of ['calle real 12', 'real, 12', 'calle real 12b', 'Calle Real 5 '])
      expect(llevaNumero(t), t).toBe(true);
    for (const t of ['calle real', 'HID-0012', '12', 'calle 28 de febrero']) expect(llevaNumero(t), t).toBe(false);
  });
});

describe('geometría', () => {
  const real = EJEMPLO.entradas[0]!;

  it('puntoCercano cae sobre la calle', () => {
    const p = puntoCercano(real, { lat: 37.232, lng: -3.6555 });
    expect(p.lat).toBeGreaterThan(37.231);
    expect(p.lat).toBeLessThan(37.233);
    expect(puntoCercano(EJEMPLO.entradas[4]!, { lat: 37, lng: -3 })).toEqual({ lat: 37.2259, lng: -3.6414 });
  });

  it('recuadroDe', () => {
    expect(recuadroDe(real)).toEqual([
      [37.231, -3.658],
      [37.233, -3.656],
    ]);
  });

  it('calleCercana: a menos de 60 m, su nombre; más lejos, nada', () => {
    expect(calleCercana(EJEMPLO, { lat: 37.232, lng: -3.657 })).toBe('Calle Real');
    expect(calleCercana(EJEMPLO, { lat: 37.24, lng: -3.657 })).toBeNull();
  });

  it('municipioCercano', () => {
    expect(municipioCercano(EJEMPLO, { lat: 37.273, lng: -3.622 })).toBe('calicasas');
    expect(municipioCercano(EJEMPLO, { lat: 37.231, lng: -3.657 })).toBe('albolote');
  });
});

describe('cargarCallejero', () => {
  afterEach(() => {
    olvidarCallejero();
    vi.unstubAllGlobals();
  });

  it('lo pide una sola vez y lo guarda en memoria', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(EJEMPLO)));
    vi.stubGlobal('fetch', f);
    await Promise.all([cargarCallejero(), cargarCallejero()]);
    await cargarCallejero();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('/callejero.json');
    expect(callejeroCargado()?.datos.entradas).toHaveLength(5);
    expect(typeof callejeroCargado()?.f.buscarCalles).toBe('function');
  });

  it('sin red devuelve null y lo vuelve a intentar la próxima vez', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('sin red');
    });
    vi.stubGlobal('fetch', f);
    expect(await cargarCallejero()).toBeNull();
    expect(await cargarCallejero()).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
