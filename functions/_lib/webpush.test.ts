// Vector de prueba de RFC 8291, apéndice A, y comprobación de la firma VAPID.
import { describe, expect, it } from 'vitest';
import { b64url, cabeceraVapid, cifrar, desdeB64url } from './webpush.ts';

const RFC = {
  mensaje: 'When I grow up, I want to be a watermelon',
  asPrivada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublica: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivada: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublica: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  sal: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  resultado:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

describe('cifrar (RFC 8291)', () => {
  it('reproduce el vector del apéndice A', async () => {
    const r = await cifrar(
      new TextEncoder().encode(RFC.mensaje),
      RFC.uaPublica,
      RFC.auth,
      { privada: RFC.asPrivada, publica: RFC.asPublica },
      desdeB64url(RFC.sal),
    );
    expect(b64url(r)).toBe(RFC.resultado);
  });

  it('con claves aleatorias produce cabecera de 86 bytes y un cifrado distinto cada vez', async () => {
    const a = await cifrar(new TextEncoder().encode('hola'), RFC.uaPublica, RFC.auth);
    const b = await cifrar(new TextEncoder().encode('hola'), RFC.uaPublica, RFC.auth);
    expect(a.length).toBe(86 + 4 + 1 + 16);
    expect(b64url(a)).not.toBe(b64url(b));
  });
});

describe('cabeceraVapid (RFC 8292)', () => {
  it('firma un JWT ES256 verificable con la clave pública, para el origen del endpoint', async () => {
    const cab = await cabeceraVapid(
      'https://push.example.net/abc/def',
      RFC.asPublica,
      RFC.asPrivada,
      'https://hidrantes-albolote.pages.dev',
      1_800_000_000,
    );
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(cab)!;
    expect(k).toBe(RFC.asPublica);
    const [h, p, f] = jwt.split('.');
    const reclamos = JSON.parse(new TextDecoder().decode(desdeB64url(p)));
    expect(reclamos).toEqual({
      aud: 'https://push.example.net',
      exp: 1_800_000_000 + 43200,
      sub: 'https://hidrantes-albolote.pages.dev',
    });
    const pub = desdeB64url(RFC.asPublica);
    const clave = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)) },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valida = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      clave,
      desdeB64url(f),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(valida).toBe(true);
  });
});
