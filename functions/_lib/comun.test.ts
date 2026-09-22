// Las piezas comunes de las Pages Functions (04 §6, 05 §8 y §9). Aquí se decide en qué bucket
// acaban las fotos y con qué estado HTTP sale cada error, dos cosas que no se ven al probar a mano
// y que, mal puestas, mezclarían staging con producción o dejarían a la app sin saber qué ha pasado.

import { describe, expect, it, vi } from 'vitest';
import {
  type Env,
  bucketPara,
  error,
  esAdmin,
  esUuid,
  estadoDe,
  json,
  jwtDe,
  leerJson,
  rpc,
  sha256Hex,
} from './comun.ts';

const ENV: Env = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio', // detectar-secretos:permitir (valor de prueba)
  SAL_IP: 'sal',
};

const peticion = (cabeceras: Record<string, string> = {}) =>
  new Request('https://hidrantes-albolote-staging.pages.dev/api/algo', { headers: cabeceras });

describe('respuestas', () => {
  it('json no se guarda en caché y va en UTF-8', async () => {
    const r = json({ a: 1 });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.json()).toEqual({ a: 1 });
  });

  it('error usa la forma de 05 §9: { error, ...extra }', async () => {
    const r = error(429, 'DEMASIADOS_INTENTOS', { reintentar_en_s: 3600 });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'DEMASIADOS_INTENTOS', reintentar_en_s: 3600 });
  });

  it('leerJson solo acepta un objeto: ni texto suelto, ni lista, ni basura', async () => {
    const cuerpo = (v: string) => new Request('https://x.test/', { method: 'POST', body: v });
    expect(await leerJson(cuerpo('{"codigo":"123456"}'))).toEqual({ codigo: '123456' });
    expect(await leerJson(cuerpo('[1,2]'))).toBeNull();
    expect(await leerJson(cuerpo('"hola"'))).toBeNull();
    expect(await leerJson(cuerpo('no es json'))).toBeNull();
  });
});

describe('esUuid', () => {
  it('acepta un uuid de verdad, en mayúsculas o minúsculas', () => {
    expect(esUuid('0f1e2d3c-4b5a-4968-8776-6a5b4c3d2e1f')).toBe(true);
    expect(esUuid('0F1E2D3C-4B5A-4968-8776-6A5B4C3D2E1F')).toBe(true);
  });

  it('rechaza lo que no lo es', () => {
    for (const v of ['', '1234', 'no-uuid', '0f1e2d3c4b5a49688776 6a5b4c3d2e1f', null, 42, {}]) {
      expect(esUuid(v), String(v)).toBe(false);
    }
  });
});

describe('jwtDe', () => {
  it('saca el JWT de la cabecera Authorization', () => {
    expect(jwtDe(peticion({ Authorization: 'Bearer aaa.bbb.ccc' }))).toBe('aaa.bbb.ccc');
  });

  it('sin cabecera, o con algo que no es un JWT, devuelve null', () => {
    expect(jwtDe(peticion())).toBeNull();
    expect(jwtDe(peticion({ Authorization: 'Basic dXN1YXJpbzpjbGF2ZQ==' }))).toBeNull();
    expect(jwtDe(peticion({ Authorization: 'Bearer solo-un-trozo' }))).toBeNull();
  });
});

// 04 §4: producción tiene su propio bucket y nada más escribe en él. Staging, las previsualizaciones
// de los PR y el desarrollo local comparten el de dev.
describe('bucketPara', () => {
  it('solo el dominio de producción usa el bucket de producción', () => {
    expect(bucketPara('https://hidrantes-albolote.pages.dev/api/url-subida', {})).toBe('hidrantes-fotos');
  });

  it('staging, previsualizaciones y local usan el de dev', () => {
    for (const url of [
      'https://hidrantes-albolote-staging.pages.dev/api/url-subida',
      'https://abc123.hidrantes-albolote.pages.dev/api/url-subida',
      'https://hidrantes-albolote.pages.dev.ejemplo.test/api/url-subida',
      'http://127.0.0.1:8788/api/url-subida',
    ]) {
      expect(bucketPara(url, {}), url).toBe('hidrantes-fotos-dev');
    }
  });

  it('BUCKET_FOTOS manda sobre el dominio', () => {
    expect(bucketPara('https://hidrantes-albolote.pages.dev/x', { BUCKET_FOTOS: 'otro' })).toBe('otro');
  });
});

describe('estadoDe (05 §8)', () => {
  it('traduce cada familia de error a su estado HTTP', () => {
    expect(estadoDe('TOKEN_INVALIDO')).toBe(401);
    expect(estadoDe('TOKEN_CADUCADO')).toBe(401);
    expect(estadoDe('TOKEN_REVOCADO')).toBe(401);
    expect(estadoDe('CODIGO_INCORRECTO')).toBe(401);
    expect(estadoDe('NO_AUTORIZADO')).toBe(403);
    expect(estadoDe('CUOTA_SUBIDAS_AGOTADA')).toBe(429);
    expect(estadoDe('DEMASIADOS_INTENTOS')).toBe(429);
    expect(estadoDe('CUOTA_INCIDENCIAS_AGOTADA')).toBe(429);
    expect(estadoDe('SERVIDOR_NO_DISPONIBLE')).toBe(503);
    expect(estadoDe('ERROR_INTERNO')).toBe(500);
    expect(estadoDe('PAYLOAD_INVALIDO(descripcion)')).toBe(400);
  });
});

describe('sha256Hex', () => {
  it('es el sha256 en hexadecimal, en minúsculas', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('rpc', () => {
  const respuesta = (cuerpo: string, estado = 200) => new Response(cuerpo, { status: estado });

  it('llama al esquema hidrantes con la clave de servicio', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta('{"ok":1}'));
    const r = await rpc<{ ok: number }>(ENV, 'fn_salud', { limite: 1 });
    expect(r).toEqual({ ok: true, datos: { ok: 1 } });

    const [url, opciones] = espia.mock.calls[0] as [string, RequestInit];
    const cabeceras = opciones.headers as Record<string, string>;
    expect(url).toBe('https://proyecto.supabase.co/rest/v1/rpc/fn_salud');
    expect(cabeceras['Accept-Profile']).toBe('hidrantes');
    expect(cabeceras['Content-Profile']).toBe('hidrantes');
    expect(cabeceras.Authorization).toBe('Bearer clave-de-servicio');
    expect(opciones.body).toBe('{"limite":1}');
    espia.mockRestore();
  });

  it('con jwt llama con la identidad de quien pide, para que fn_es_admin() la vea', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta('true'));
    await rpc(ENV, 'fn_es_admin', {}, { jwt: 'aaa.bbb.ccc' });
    const cabeceras = (espia.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(cabeceras.Authorization).toBe('Bearer aaa.bbb.ccc');
    expect(cabeceras.apikey).toBe('clave-de-servicio');
    espia.mockRestore();
  });

  it('un error P0001 de la base de datos llega con su código de 05 §8', async () => {
    const espia = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        respuesta('{"code":"P0001","message":"CUOTA_SUBIDAS_AGOTADA: Has llegado al máximo de fotos de hoy"}', 400),
      );
    expect(await rpc(ENV, 'fn_reservar_subida', {})).toEqual({
      ok: false,
      codigo: 'CUOTA_SUBIDAS_AGOTADA',
      estado: 400,
    });
    espia.mockRestore();
  });

  it('un permiso denegado es NO_AUTORIZADO, no un error interno', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta('{"code":"42501"}', 403));
    expect(await rpc(ENV, 'fn_aprobar', {})).toEqual({ ok: false, codigo: 'NO_AUTORIZADO', estado: 403 });
    espia.mockRestore();
  });

  it('si la base no responde, el estado es 503 y no lanza', async () => {
    const caido = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await rpc(ENV, 'fn_salud', {})).toEqual({
      ok: false,
      codigo: 'SERVIDOR_NO_DISPONIBLE',
      estado: 503,
    });
    caido.mockRestore();

    const roto = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta('<html>502</html>', 502));
    expect(await rpc(ENV, 'fn_salud', {})).toEqual({ ok: false, codigo: 'ERROR_INTERNO', estado: 503 });
    roto.mockRestore();
  });
});

describe('esAdmin (FR-37)', () => {
  it('sin JWT no pregunta siquiera', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('true'));
    expect(await esAdmin(ENV, null)).toBe(false);
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  it('lo decide la base de datos: solo un true explícito abre la puerta', async () => {
    for (const [cuerpo, esperado] of [
      ['true', true],
      ['false', false],
      ['null', false],
      ['{"error":"x"}', false],
    ] as const) {
      const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(cuerpo));
      expect(await esAdmin(ENV, 'aaa.bbb.ccc'), cuerpo).toBe(esperado);
      espia.mockRestore();
    }
  });
});
