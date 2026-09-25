// TR-104: la Function de envío de avisos. El cifrado (RFC 8291) y la firma VAPID (RFC 8292) los
// hace este módulo con WebCrypto; si se equivocara en un byte, el servicio de push aceptaría o
// rechazaría el mensaje y el móvil no enseñaría nada, sin que nada en el sistema se quejara. Por eso
// se comprueba contra el ejemplo de la propia RFC, que trae claves fijas y el cuerpo ya cifrado.

import { describe, expect, it, vi } from 'vitest';
import { b64url, cabeceraVapid, cifrar, desdeB64url, enviar, segundosDeRetryAfter } from './webpush.ts';

/** RFC 8291 §5 "Push Message Encryption Example". */
const RFC = {
  textoPlano: 'When I grow up, I want to be a watermelon',
  receptorPublica: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  emisorPrivada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  emisorPublica: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  sal: 'DGv6ra1nlYgDCS1FRnbzlw',
  cuerpo:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6Tlz' +
    'AC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const suscripcion = {
  endpoint: 'https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV',
  keys: { p256dh: RFC.receptorPublica, auth: RFC.auth },
};
const vapid = { publica: RFC.emisorPublica, privada: RFC.emisorPrivada, sujeto: 'mailto:hidrantes@albolote-pc.es' };

describe('base64url', () => {
  it('va y vuelve con cualquier resto de longitud', () => {
    for (const n of [1, 2, 3, 16, 65]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256);
      expect([...desdeB64url(b64url(bytes))]).toEqual([...bytes]);
    }
  });

  it('escribe sin relleno y con el alfabeto de URL', () => {
    expect(b64url(new Uint8Array([251, 255, 190]))).toBe('-_--');
    expect(b64url(new Uint8Array([0]))).toBe('AA');
  });
});

describe('cifrar (RFC 8291 §5)', () => {
  it('con las claves y la sal del ejemplo da el cuerpo del ejemplo, byte a byte', async () => {
    const cuerpo = await cifrar(
      new TextEncoder().encode(RFC.textoPlano),
      RFC.receptorPublica,
      RFC.auth,
      { privada: RFC.emisorPrivada, publica: RFC.emisorPublica },
      desdeB64url(RFC.sal),
    );
    expect(b64url(cuerpo)).toBe(RFC.cuerpo);
  });

  it('la cabecera lleva sal de 16, registro de 4096 y la clave efímera de 65 bytes', async () => {
    const cuerpo = await cifrar(new TextEncoder().encode('hola'), RFC.receptorPublica, RFC.auth);
    expect([...cuerpo.slice(16, 21)]).toEqual([0, 0, 0x10, 0, 65]);
    expect(cuerpo[21]).toBe(4); // 0x04: clave P-256 sin comprimir
    // 16 sal + 4 rs + 1 idlen + 65 clave + (texto + 1 de relleno + 16 de etiqueta GCM)
    expect(cuerpo.length).toBe(86 + 4 + 1 + 16);
  });

  it('sin sal fija, dos cifrados del mismo texto salen distintos', async () => {
    const texto = new TextEncoder().encode('hola');
    const a = await cifrar(texto, RFC.receptorPublica, RFC.auth);
    const b = await cifrar(texto, RFC.receptorPublica, RFC.auth);
    expect(b64url(a)).not.toBe(b64url(b));
  });
});

describe('cabeceraVapid (RFC 8292)', () => {
  const partes = (cabecera: string) => {
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=(.+)$/.exec(cabecera);
    expect(m, cabecera).not.toBeNull();
    return { cabecera: m![1], reclamos: m![2], firma: m![3], k: m![4] };
  };

  it('firma un JWT ES256 que se verifica con la clave pública anunciada', async () => {
    const ahora = 1_800_000_000;
    const p = partes(await cabeceraVapid(suscripcion.endpoint, vapid.publica, vapid.privada, vapid.sujeto, ahora));
    expect(p.k).toBe(vapid.publica);

    const publica = desdeB64url(p.k);
    const clave = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: b64url(publica.slice(1, 33)), y: b64url(publica.slice(33, 65)), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valida = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      clave,
      desdeB64url(p.firma),
      new TextEncoder().encode(`${p.cabecera}.${p.reclamos}`),
    );
    expect(valida).toBe(true);
  });

  it('el aud es el origen del endpoint, no la ruta, y caduca en 12 h', async () => {
    const ahora = 1_800_000_000;
    const p = partes(await cabeceraVapid(suscripcion.endpoint, vapid.publica, vapid.privada, vapid.sujeto, ahora));
    const reclamos = JSON.parse(new TextDecoder().decode(desdeB64url(p.reclamos))) as Record<string, unknown>;
    expect(reclamos).toEqual({ aud: 'https://push.example.net', exp: ahora + 12 * 3600, sub: vapid.sujeto });
    expect(JSON.parse(new TextDecoder().decode(desdeB64url(p.cabecera)))).toEqual({ typ: 'JWT', alg: 'ES256' });
  });
});

describe('enviar', () => {
  const aviso = { titulo: 'Aprobada HID-0147', cuerpo: 'Tu alta se aprobó', url: '/mis-propuestas' };
  const fingirFetch = (respuesta: Response | Error) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      if (respuesta instanceof Error) return Promise.reject(respuesta);
      return Promise.resolve(respuesta);
    });

  it('manda el cuerpo cifrado con las cabeceras del estándar', async () => {
    const espia = fingirFetch(new Response(null, { status: 201 }));
    const r = await enviar(suscripcion, aviso, vapid);
    expect(r).toEqual({ ok: true, caducada: false });

    const [url, opciones] = espia.mock.calls[0] as [string, RequestInit];
    const cabeceras = opciones.headers as Record<string, string>;
    expect(url).toBe(suscripcion.endpoint);
    expect(opciones.method).toBe('POST');
    expect(cabeceras['Content-Encoding']).toBe('aes128gcm');
    expect(cabeceras['Content-Type']).toBe('application/octet-stream');
    expect(cabeceras.TTL).toBe('86400');
    expect(cabeceras.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    // El aviso viaja cifrado: el texto no aparece en claro en el cuerpo.
    const cuerpo = new TextDecoder().decode(opciones.body as Uint8Array);
    expect(cuerpo).not.toContain('HID-0147');
    espia.mockRestore();
  });

  it('404 y 410 marcan la suscripción como caducada, para borrarla', async () => {
    for (const estado of [404, 410]) {
      const espia = fingirFetch(new Response(null, { status: estado }));
      expect(await enviar(suscripcion, aviso, vapid)).toEqual({
        ok: false,
        caducada: true,
        error: `HTTP ${estado}`,
      });
      espia.mockRestore();
    }
  });

  // RV-84: solo 404 y 410 caducan. Cualquier otro error cuenta como un fallo más.
  it('otro error del servicio no caduca la suscripción: se reintentará', async () => {
    for (const estado of [400, 403, 413, 500, 502, 503]) {
      const espia = fingirFetch(new Response(null, { status: estado }));
      expect(await enviar(suscripcion, aviso, vapid)).toEqual({ ok: false, caducada: false, error: `HTTP ${estado}` });
      espia.mockRestore();
    }
  });

  // RV-84: un 429 es pasajero. Se aplaza lo que diga Retry-After (en segundos o como fecha HTTP).
  it('429 no caduca la suscripción y devuelve cuánto esperar', async () => {
    let espia = fingirFetch(new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
    expect(await enviar(suscripcion, aviso, vapid)).toEqual({
      ok: false,
      caducada: false,
      error: 'HTTP 429',
      aplazar_s: 120,
    });
    espia.mockRestore();

    const dentro = new Date(Date.now() + 300_000).toUTCString();
    espia = fingirFetch(new Response(null, { status: 429, headers: { 'Retry-After': dentro } }));
    const r = await enviar(suscripcion, aviso, vapid);
    expect(r.aplazar_s).toBeGreaterThanOrEqual(290);
    expect(r.aplazar_s).toBeLessThanOrEqual(300);
    espia.mockRestore();

    espia = fingirFetch(new Response(null, { status: 429 }));
    expect((await enviar(suscripcion, aviso, vapid)).aplazar_s).toBe(60);
    espia.mockRestore();
  });

  it('Retry-After raro: una fecha pasada es 0; lo que no se entiende, 60', () => {
    const ahora = Date.parse('2026-09-25T10:00:00Z');
    expect(segundosDeRetryAfter('Fri, 25 Sep 2026 09:00:00 GMT', ahora)).toBe(0);
    expect(segundosDeRetryAfter('Fri, 25 Sep 2026 10:02:00 GMT', ahora)).toBe(120);
    expect(segundosDeRetryAfter(' 30 ', ahora)).toBe(30);
    for (const raro of ['1.5', '-5', 'pronto', '', null]) expect(segundosDeRetryAfter(raro, ahora)).toBe(60);
  });

  it('si la red falla, devuelve el motivo en lugar de lanzar', async () => {
    const espia = fingirFetch(new Error('fetch failed'));
    expect(await enviar(suscripcion, aviso, vapid)).toEqual({
      ok: false,
      caducada: false,
      error: 'fetch failed',
    });
    espia.mockRestore();
  });
});
