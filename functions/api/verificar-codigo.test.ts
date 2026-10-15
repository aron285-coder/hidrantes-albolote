// La Function del canje del código (TR-41, TR-42, 11 §3). Es la única puerta abierta al exterior sin
// credencial previa: aquí se comprueba que la IP que cuenta para el límite es la real de Cloudflare y
// que nunca se guarda en claro, y que acertar o fallar el código tarda lo mismo.
//
// Cada respuesta espera a completar DURACION_MINIMA_MS de verdad (TR-42). Adelantar el reloj con
// temporizadores fingidos salía mal —leer el cuerpo de la petición pasa por el bucle de eventos real
// y, en una máquina cargada, la espera se programaba después del salto y la prueba se colgaba; se
// vio en la CI—, así que las llamadas que no dependen unas de otras se lanzan a la vez: todas caben
// en la misma espera.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Env } from '../_lib/comun.ts';
import { _reiniciarLimites } from '../_lib/limite.ts';
import {
  CONSULTA_ENTRADA_MS,
  DURACION_MINIMA_MS,
  LIMITE_CODIGO_ENTRADA_ABIERTA,
  LIMITE_CODIGO_POR_MINUTO,
  _reiniciarEntrada,
  onRequestPost,
} from './verificar-codigo.ts';

// El tope por IP de la Function (docs/36 RV-451) vive en la memoria del módulo: cada prueba empieza
// con él vacío.
// Lo mismo con lo que la Function sabe de la entrada abierta (docs/37 RV-491).
beforeEach(() => {
  _reiniciarLimites();
  _reiniciarEntrada();
});

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
        // RV-143: el id de un administrador no se puede usar. 409, sin decir de quién es, para que
        // el móvil genere otro y repita (RV-159).
        que: 'dispositivo reservado (RV-143)',
        codigo: '000004',
        da: canje({ token: null, caduca_en: null, error: 'DISPOSITIVO_RESERVADO' }),
        estado: 409,
        espera: { error: 'DISPOSITIVO_RESERVADO' },
      },
      {
        que: 'dispositivo reservado, si la base de datos lo lanza como excepción (RV-143)',
        codigo: '000005',
        da: new Response(JSON.stringify({ code: 'P0001', message: 'DISPOSITIVO_RESERVADO: no disponible' }), {
          status: 400,
        }),
        estado: 409,
        espera: { error: 'DISPOSITIVO_RESERVADO' },
      },
      {
        // docs/35 RV-401: sin turno en la base de datos en 3 s. 503 y que repita en 30 s.
        que: 'mucha gente entrando a la vez (OCUPADO)',
        codigo: '000006',
        da: canje({ token: null, caduca_en: null, error: 'OCUPADO' }),
        estado: 503,
        espera: { error: 'OCUPADO', reintentar_en_s: 30 },
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
      expect(r.headers.get('Retry-After'), casos[i].que).toBe(casos[i].codigo === '000006' ? '30' : null);
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

  it('sin SAL_IP no se canjea nada: el hash de la IP sin sal se podría deshacer', async () => {
    const espia = fingir(canje({ token: TOKEN, caduca_en: null, error: null }));
    const r = await onRequestPost({
      request: peticion({ codigo: '123456', dispositivo_id: DISPOSITIVO }),
      env: { ...ENV, SAL_IP: '' } as Env,
    });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'NO_CONFIGURADO' });
    expect(espia).not.toHaveBeenCalled();
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

  // docs/36 RV-451 (DEC-207): la Function pone su propio tope por IP agrupada, antes de la base de datos.
  // Contesta OCUPADO (503 + Retry-After) y no DEMASIADOS_INTENTOS: con este último la app bloquea el
  // móvil una hora, y un grupo entrando a la vez desde la misma wifi no ha fallado nada.
  it('el undécimo intento en un minuto desde la misma IP agrupada → OCUPADO sin llamar a la base; de otra IP, pasa', async () => {
    expect(LIMITE_CODIGO_POR_MINUTO).toBe(10);
    const espia = fingir(canje({ token: null, caduca_en: null, error: null }));
    const desde = (ip: string) =>
      responder(peticion({ codigo: '000001', dispositivo_id: DISPOSITIVO }, { 'CF-Connecting-IP': ip }));
    const empezado = Date.now();
    // Las diez primeras desde dos IPv6 del mismo /48: cuentan juntas.
    const respuestas = await Promise.all([
      ...Array.from({ length: 5 }, () => desde('2001:db8:aa:1::1')),
      ...Array.from({ length: 5 }, () => desde('2001:db8:aa:2::2')),
      desde('2001:db8:aa:3::3'),
      desde('198.51.100.20'),
    ]);
    const tardado = Date.now() - empezado;
    const llamadasALaBase = espia.mock.calls.filter(([url]) => String(url).endsWith('/fn_verificar_codigo')).length;
    espia.mockRestore();

    expect(respuestas.slice(0, 10).map((r) => r.status)).toEqual(Array(10).fill(401));
    expect(respuestas[10]!.status).toBe(503);
    const cuerpo = (await respuestas[10]!.json()) as { error: string; reintentar_en_s: number };
    expect(cuerpo.error).toBe('OCUPADO');
    expect(cuerpo.reintentar_en_s).toBeGreaterThanOrEqual(1);
    expect(cuerpo.reintentar_en_s).toBeLessThanOrEqual(60);
    expect(respuestas[10]!.headers.get('Retry-After')).toBe(String(cuerpo.reintentar_en_s));
    expect(respuestas[11]!.status).toBe(401);
    // Once llamadas a la base de datos: las diez primeras y la de la otra IP.
    expect(llamadasALaBase).toBe(11);
    // El 429 también espera la duración mínima.
    expect(tardado).toBeGreaterThanOrEqual(DURACION_MINIMA_MS - 20);
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

// RV-14 y docs/35 RV-401: con IPv6, un cliente suele tener un /48 o un /56 entero; el límite por IP
// cuenta el /48.
describe('normalizarIp (RV-14, docs/35 RV-401)', () => {
  it('IPv6: sus primeros 48 bits, se escriba como se escriba', async () => {
    const { normalizarIp } = await import('../_lib/comun.ts');
    expect(normalizarIp('2001:db8:1:2:3:4:5:6')).toBe(normalizarIp('2001:db8:1:2::9'));
    expect(normalizarIp('2001:0DB8:0001:0002:ffff::1')).toBe(normalizarIp('2001:db8:1:2::'));
    expect(normalizarIp('2001:db8:1:2::9')).toBe(normalizarIp('2001:db8:1:3::9'));
    expect(normalizarIp('2001:db8:1:ffff::9')).toBe('2001:db8:1::/48');
    expect(normalizarIp('2001:db8:1::9')).not.toBe(normalizarIp('2001:db8:2::9'));
    expect(normalizarIp('::1')).toBe(normalizarIp('0:0:0:0:0:0:0:1'));
  });
  it('una IPv4 mapeada es la IPv4, y una IPv4 queda intacta', async () => {
    const { normalizarIp } = await import('../_lib/comun.ts');
    expect(normalizarIp('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(normalizarIp('192.0.2.1')).toBe('192.0.2.1');
  });
  // docs/18 RV-48: basura con forma de IPv6 no se mezcla con nadie, y la IPv4 mapeada en
  // hexadecimal es su IPv4, no el prefijo de ::1.
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

  it('dos IPv6 del mismo /48 comparten ip_hash', async () => {
    const hashes: string[] = [];
    const espia = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opciones) => {
      hashes.push((JSON.parse((opciones as RequestInit).body as string) as { ip_hash: string }).ip_hash);
      return Promise.resolve(canje({ token: null, caduca_en: null, error: 'CODIGO_INCORRECTO' }));
    });
    await Promise.all(
      ['2001:db8:aa:bb:1::1', '2001:db8:aa:cc:ffff:2::7'].map((ip) =>
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

// docs/37 RV-491 (DEC-211): el día del lanzamiento, una sala entera entra desde la misma wifi.
describe('POST /api/verificar-codigo con la entrada abierta', () => {
  const responder = (request: Request) => onRequestPost({ request, env: ENV });
  const intento = () =>
    responder(peticion({ codigo: '000001', dispositivo_id: DISPOSITIVO }, { 'CF-Connecting-IP': '203.0.113.50' }));

  /** fn_entrada_abierta_hasta responde `entrada`; fn_verificar_codigo, código incorrecto. */
  function fingirEntrada(entrada: Response | Error) {
    return vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url) =>
        String(url).endsWith('/fn_entrada_abierta_hasta')
          ? servir(entrada)
          : servir(canje({ token: null, caduca_en: null, error: null })),
      );
  }
  const abierta = () => new Response(JSON.stringify(new Date(Date.now() + 3_600_000).toISOString()));
  const llamadasEntrada = (espia: ReturnType<typeof fingirEntrada>) =>
    espia.mock.calls.filter(([url]) => String(url).endsWith('/fn_entrada_abierta_hasta')).length;

  it('abierta: el intento 11 y el 60 pasan y el 61 recibe OCUPADO; la entrada se pregunta una vez', async () => {
    expect(LIMITE_CODIGO_ENTRADA_ABIERTA).toBe(60);
    const espia = fingirEntrada(abierta());
    const respuestas: Response[] = [];
    // Las diez primeras no preguntan por la entrada; las demás, a la vez.
    respuestas.push(...(await Promise.all(Array.from({ length: 10 }, intento))));
    expect(llamadasEntrada(espia)).toBe(0);
    respuestas.push(...(await Promise.all(Array.from({ length: 51 }, intento))));
    const entrada = llamadasEntrada(espia);
    const alaBase = espia.mock.calls.length - entrada;
    espia.mockRestore();

    expect(respuestas.slice(0, 60).map((r) => r.status)).toEqual(Array(60).fill(401));
    expect(respuestas[60]!.status).toBe(503);
    expect(((await respuestas[60]!.json()) as { error: string }).error).toBe('OCUPADO');
    expect(alaBase).toBe(60);
    expect(entrada).toBe(1);
  });

  it('cerrada (null): el 11 recibe OCUPADO', async () => {
    const espia = fingirEntrada(new Response('null'));
    const respuestas = await Promise.all(Array.from({ length: 11 }, intento));
    espia.mockRestore();
    expect(respuestas.slice(0, 10).map((r) => r.status)).toEqual(Array(10).fill(401));
    expect(respuestas[10]!.status).toBe(503);
  });

  it('con una hora que ya pasó, cerrada', async () => {
    const espia = fingirEntrada(new Response(JSON.stringify('2020-01-01T00:00:00Z')));
    const respuestas = await Promise.all(Array.from({ length: 11 }, intento));
    espia.mockRestore();
    expect(respuestas[10]!.status).toBe(503);
  });

  it.each([
    ['la base de datos da un error', new Response('{"code":"42501"}', { status: 403 })],
    ['no hay red', new Error('sin red')],
    ['responde algo que no es una fecha', new Response('"mañana"')],
  ])('si %s, el tope de 10', async (_caso, r) => {
    const espia = fingirEntrada(r);
    const respuestas = await Promise.all(Array.from({ length: 12 }, intento));
    const entrada = llamadasEntrada(espia);
    espia.mockRestore();
    expect(respuestas.slice(0, 10).map((x) => x.status)).toEqual(Array(10).fill(401));
    expect(respuestas.slice(10).map((x) => x.status)).toEqual([503, 503]);
    // Tampoco se pregunta en cada intento cuando falla.
    expect(entrada).toBe(1);
  });

  it('se vuelve a preguntar pasado un minuto, no antes', async () => {
    let desfase = 0;
    const reloj = Date.now;
    const ahora = vi.spyOn(Date, 'now').mockImplementation(() => reloj() + desfase);
    const espia = fingirEntrada(new Response('null'));
    try {
      await Promise.all(Array.from({ length: 12 }, intento));
      expect(llamadasEntrada(espia)).toBe(1);
      desfase = CONSULTA_ENTRADA_MS - 5_000;
      await intento();
      expect(llamadasEntrada(espia)).toBe(1);
      // Pasado el minuto la ventana del tope también se ha vaciado: hacen falta 11 para volver a preguntar.
      desfase = CONSULTA_ENTRADA_MS + 1_000;
      await Promise.all(Array.from({ length: 11 }, intento));
      expect(llamadasEntrada(espia)).toBe(2);
    } finally {
      espia.mockRestore();
      ahora.mockRestore();
    }
  });
});
