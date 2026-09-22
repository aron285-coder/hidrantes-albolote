// TR-72: Nominatim se usa como mucho una vez por segundo, con User-Agent identificable, solo desde
// el servidor y nunca como dependencia bloqueante (FR-15): si no responde, la propuesta se aprueba
// sin dirección. Esto último es lo que más importa probar: un fallo aquí no puede parar a jefatura.

import { describe, expect, it, vi } from 'vitest';
import { direccionDe, formatearDireccion, turnoNominatim } from './nominatim.ts';

describe('formatearDireccion', () => {
  it('calle con número y localidad', () => {
    expect(formatearDireccion({ address: { road: 'Calle Real', house_number: '14', town: 'Albolote' } })).toBe(
      'Calle Real 14, Albolote',
    );
  });

  it('sin número, solo la vía', () => {
    expect(formatearDireccion({ address: { road: 'Calle Real', village: 'Calicasas' } })).toBe('Calle Real, Calicasas');
  });

  it('acepta las otras formas de vía que devuelve Nominatim', () => {
    expect(formatearDireccion({ address: { pedestrian: 'Plaza Mayor', city: 'Albolote' } })).toBe(
      'Plaza Mayor, Albolote',
    );
    expect(formatearDireccion({ address: { footway: 'Camino del Cubillas' } })).toBe('Camino del Cubillas');
  });

  it('en descampado, solo la localidad', () => {
    expect(formatearDireccion({ address: { hamlet: 'El Chaparral' } })).toBe('El Chaparral');
  });

  it('sin vía ni localidad no inventa nada: la propuesta se aprueba sin dirección', () => {
    expect(formatearDireccion({ address: { country: 'España' } })).toBeNull();
    expect(formatearDireccion({})).toBeNull();
  });
});

// El módulo guarda cuándo fue la última petición, así que estos relojes fingidos van en el pasado:
// si dejaran la marca en el futuro, la siguiente llamada real se quedaría esperando de verdad.
describe('turnoNominatim', () => {
  it('deja al menos un segundo entre peticiones seguidas (TR-72)', async () => {
    let reloj = 1_600_000_000_000;
    const esperas: number[] = [];
    const dormir = (ms: number) => {
      esperas.push(ms);
      reloj += ms;
      return Promise.resolve();
    };
    const ahora = () => reloj;

    await turnoNominatim(ahora, dormir); // la primera no espera: hace mucho de la anterior
    await turnoNominatim(ahora, dormir);
    await turnoNominatim(ahora, dormir);

    expect(esperas).toEqual([1000, 1000]); // la primera no llegó a dormir
  });

  it('si ya ha pasado el segundo, no hace esperar', async () => {
    let reloj = 1_600_000_100_000;
    const dormir = vi.fn(() => Promise.resolve());
    await turnoNominatim(() => reloj, dormir);
    reloj += 5000;
    await turnoNominatim(() => reloj, dormir);
    expect(dormir).not.toHaveBeenCalled();
  });
});

describe('direccionDe', () => {
  const sinEspera = () => Promise.resolve();
  const AGENTE = 'hidrantes-albolote/1.0 (contacto)';
  const respuesta = (cuerpo: unknown, estado = 200) =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

  it('pregunta por las coordenadas con el User-Agent y devuelve la dirección', async () => {
    const espia = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(respuesta({ address: { road: 'Calle Real', house_number: '14', town: 'Albolote' } }));

    expect(await direccionDe(37.2309, -3.6558, AGENTE, sinEspera)).toBe('Calle Real 14, Albolote');

    const [url, opciones] = espia.mock.calls[0] as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/reverse');
    expect(url.searchParams.get('lat')).toBe('37.2309');
    expect(url.searchParams.get('lon')).toBe('-3.6558');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect((opciones.headers as Record<string, string>)['User-Agent']).toBe(AGENTE);
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
    espia.mockRestore();
  });

  it('un error del servicio no rompe nada: devuelve null (FR-15)', async () => {
    for (const caso of [respuesta({}, 429), respuesta({}, 500)]) {
      const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(caso);
      expect(await direccionDe(37.23, -3.65, AGENTE, sinEspera)).toBeNull();
      espia.mockRestore();
    }
  });

  it('si Nominatim no contesta o contesta basura, devuelve null en vez de lanzar', async () => {
    const caido = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    expect(await direccionDe(37.23, -3.65, AGENTE, sinEspera)).toBeNull();
    caido.mockRestore();

    const basura = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { status: 200 }));
    expect(await direccionDe(37.23, -3.65, AGENTE, sinEspera)).toBeNull();
    basura.mockRestore();
  });
});
