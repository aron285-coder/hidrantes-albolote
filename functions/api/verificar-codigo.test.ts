// La Function del canje del código (TR-41, TR-42, 11 §3). Es la única puerta abierta al exterior sin
// credencial previa: aquí se comprueba que la IP que cuenta para el límite es la real de Cloudflare y
// que nunca se guarda en claro, y que acertar o fallar el código tarda lo mismo.
//
// Cada respuesta espera a completar DURACION_MINIMA_MS de verdad (TR-42). Adelantar el reloj con
// temporizadores fingidos salía mal —leer el cuerpo de la petición pasa por el bucle de eventos real
// y, en una máquina cargada, la espera se programaba después del salto y la prueba se colgaba; se
// vio en la CI—, así que las llamadas que no dependen unas de otras se lanzan a la vez: todas caben
// en la misma espera.

import { describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { DURACION_MINIMA_MS, onRequestPost } from './verificar-codigo.ts';

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal-larga-de-pruebas', // detectar-secretos:permitir (valor de prueba)
} as Env;

const DISPOSITIVO = '0f1e2d3c-4b5a-4968-8776-6a5b4c3d2e1f';
const TOKEN = 't'.repeat(32);

const peticion = (cuerpo: unknown, cabeceras: Record<string, string> = { 'CF-Connecting-IP': '203.0.113.7' }) =>
  new Request('https://hidrantes-albolote-staging.pages.dev/api/verificar-codigo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });

/** Lo que responde fn_verificar_codigo: una fila con token, o con error. */
const canje = (fila: Record<string, unknown>) => new Response(JSON.stringify([fila]));

/** Una respuesta solo se puede leer una vez: con varias llamadas a la vez, cada una lleva su copia. */
const servir = (r: Response | Error) => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r.clone()));

/** Respuesta de la base de datos según el código que se teclee, para poder lanzarlas a la vez. */
function fingirPorCodigo(porCodigo: Record<string, Response | Error>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opciones) => {
    const { codigo } = JSON.parse((opciones as RequestInit).body as string) as { codigo: string };
    return servir(porCodigo[codigo] ?? canje({ token: null, caduca_en: null, error: null }));
  });
}

const fingir = (r: Response | Error) => vi.spyOn(globalThis, 'fetch').mockImplementation(() => servir(r));

describe('POST /api/verificar-codigo', () => {
  const responder = (request: Request) => onRequestPost({ request, env: ENV });

  it('cada respuesta de la base de datos sale con su estado (05 §8)', async () => {
    const casos = [
      {
        que: 'código correcto',
        codigo: '123456',
        da: canje({ token: TOKEN, caduca_en: '2027-09-22T00:00:00Z', error: null }),
        estado: 200,
        espera: { token: TOKEN, caduca_en: '2027-09-22T00:00:00Z' },
      },
      {
        que: 'código incorrecto, sin más pistas (FR-33)',
        codigo: '000001',
        da: canje({ token: null, caduca_en: null, error: null }),
        estado: 401,
        espera: { error: 'CODIGO_INCORRECTO' },
      },
      {
        que: 'pasado el límite, con cuánto esperar (TR-41)',
        codigo: '000002',
        da: canje({ token: null, caduca_en: null, error: 'DEMASIADOS_INTENTOS' }),
        estado: 429,
        espera: { error: 'DEMASIADOS_INTENTOS', reintentar_en_s: 3600 },
      },
      {
        que: 'base de datos sin responder',
        codigo: '000003',
        da: new Error('ECONNREFUSED'),
        estado: 503,
        espera: { error: 'SERVIDOR_NO_DISPONIBLE' },
      },
    ];
    const espia = fingirPorCodigo(Object.fromEntries(casos.map((c) => [c.codigo, c.da])));
    const respuestas = await Promise.all(
      casos.map((c) => responder(peticion({ codigo: c.codigo, dispositivo_id: DISPOSITIVO }))),
    );

    for (const [i, r] of respuestas.entries()) {
      expect(r.status, casos[i].que).toBe(casos[i].estado);
      expect(await r.json(), casos[i].que).toEqual(casos[i].espera);
    }
    espia.mockRestore();
  });

  it('el límite se cuenta sobre la IP real de Cloudflare, y va cifrada (TR-41, 11 §3)', async () => {
    const espia = fingir(canje({ token: TOKEN, caduca_en: null, error: null }));
    const [conCloudflare, sinCabecera] = await Promise.all([
      responder(
        peticion(
          { codigo: '123456', dispositivo_id: DISPOSITIVO },
          { 'CF-Connecting-IP': '203.0.113.7', 'X-Forwarded-For': '10.0.0.1' },
        ),
      ),
      // Sin la cabecera de Cloudflare no se cae: esa petición cuenta como una IP más.
      responder(peticion({ codigo: '123456', dispositivo_id: DISPOSITIVO }, {})),
    ]);
    expect([conCloudflare.status, sinCabecera.status]).toEqual([200, 200]);

    const cuerpo = JSON.parse((espia.mock.calls[0][1] as RequestInit).body as string) as Record<string, string>;
    expect(cuerpo.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(cuerpo)).not.toContain('203.0.113.7');
    expect(JSON.stringify(cuerpo)).not.toContain('10.0.0.1'); // la cabecera que el cliente sí puede inventarse
    espia.mockRestore();
  });

  it('rechaza lo que no tiene la forma esperada, sin preguntar a la base de datos', async () => {
    const espia = fingir(canje({ token: null, caduca_en: null, error: null }));
    const cuerpos = [
      {},
      { codigo: '123456' },
      { codigo: 123456, dispositivo_id: DISPOSITIVO },
      { codigo: '123456', dispositivo_id: 'no-es-uuid' },
      'esto no es json',
    ];
    const respuestas = await Promise.all(cuerpos.map((c) => responder(peticion(c))));

    for (const [i, r] of respuestas.entries()) {
      expect(r.status, JSON.stringify(cuerpos[i])).toBe(400);
      expect(await r.json()).toEqual({ error: 'PAYLOAD_INVALIDO' });
    }
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  // TR-42: si acertar tardara menos que fallar, se podría adivinar el código a base de cronómetro.
  it('acertar y fallar tardan lo mismo, y no menos del mínimo', async () => {
    const espia = fingirPorCodigo({ '123456': canje({ token: TOKEN, caduca_en: null, error: null }) });
    const medir = async (codigo: string) => {
      const empezado = Date.now();
      const r = await responder(peticion({ codigo, dispositivo_id: DISPOSITIVO }));
      return { estado: r.status, tardado: Date.now() - empezado };
    };
    const [bueno, malo] = await Promise.all([medir('123456'), medir('000001')]);
    espia.mockRestore();

    expect([bueno.estado, malo.estado]).toEqual([200, 401]);
    // Margen pequeño: el temporizador puede despertar un pelo antes del milisegundo redondo.
    for (const { tardado } of [bueno, malo]) expect(tardado).toBeGreaterThanOrEqual(DURACION_MINIMA_MS - 20);
    // Y lo que importa: acertar no se nota en el cronómetro.
    expect(Math.abs(bueno.tardado - malo.tardado)).toBeLessThan(150);
  });
});

// RV-14: con IPv6, quien ataca rota direcciones dentro de su /64; el límite por IP cuenta el /64.
describe('normalizarIp (RV-14)', () => {
  it('IPv6: sus primeros 64 bits, se escriba como se escriba', async () => {
    const { normalizarIp } = await import('../_lib/comun.ts');
    expect(normalizarIp('2001:db8:1:2:3:4:5:6')).toBe(normalizarIp('2001:db8:1:2::9'));
    expect(normalizarIp('2001:0DB8:0001:0002:ffff::1')).toBe(normalizarIp('2001:db8:1:2::'));
    expect(normalizarIp('2001:db8:1:2::9')).not.toBe(normalizarIp('2001:db8:1:3::9'));
    expect(normalizarIp('::1')).toBe(normalizarIp('0:0:0:0:0:0:0:1'));
  });
  it('una IPv4 mapeada es la IPv4, y una IPv4 queda intacta', async () => {
    const { normalizarIp } = await import('../_lib/comun.ts');
    expect(normalizarIp('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(normalizarIp('192.0.2.1')).toBe('192.0.2.1');
  });
  // docs/18 RV-48: basura con forma de IPv6 no se mezcla con nadie, y la IPv4 mapeada en
  // hexadecimal es su IPv4, no el /64 de ::1.
  it('más de un :: o más de 8 grupos es una IP inválida, en un cubo propio', async () => {
    const { normalizarIp } = await import('../_lib/comun.ts');
    expect(normalizarIp('1::2::3')).toBe('invalida');
    expect(normalizarIp('1:2:3:4:5:6:7:8:9')).toBe('invalida');
    expect(normalizarIp('1::2::3')).not.toBe(normalizarIp('::1'));
  });
  it('::ffff:c000:201 (IPv4 mapeada en hexadecimal) es 192.0.2.1', async () => {
    const { normalizarIp } = await import('../_lib/comun.ts');
    expect(normalizarIp('::ffff:c000:201')).toBe('192.0.2.1');
    expect(normalizarIp('::ffff:c000:201')).not.toBe(normalizarIp('::1'));
  });
  it('lo que no es una IP se queda como está', async () => {
    const { normalizarIp } = await import('../_lib/comun.ts');
    expect(normalizarIp('desconocida')).toBe('desconocida');
  });

  it('dos IPv6 del mismo /64 comparten ip_hash', async () => {
    const hashes: string[] = [];
    const espia = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opciones) => {
      hashes.push((JSON.parse((opciones as RequestInit).body as string) as { ip_hash: string }).ip_hash);
      return Promise.resolve(canje({ token: null, caduca_en: null, error: 'CODIGO_INCORRECTO' }));
    });
    await Promise.all(
      ['2001:db8:aa:bb:1::1', '2001:db8:aa:bb:ffff:2::7'].map((ip) =>
        onRequestPost({
          request: peticion({ codigo: '000000', dispositivo_id: DISPOSITIVO }, { 'CF-Connecting-IP': ip }),
          env: ENV,
        }),
      ),
    );
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).toBe(hashes[1]);
    espia.mockRestore();
  });
});
