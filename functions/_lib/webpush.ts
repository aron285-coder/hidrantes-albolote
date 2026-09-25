// Web Push sin servicios externos (TR-104): cifrado aes128gcm (RFC 8291) y firma VAPID (RFC 8292)
// con WebCrypto, que existe tanto en Cloudflare como en Node. Sin Firebase ni dependencias.

const te = new TextEncoder();

/** Bytes respaldados por un ArrayBuffer normal: lo que exige WebCrypto en TypeScript 6. */
type Bytes = Uint8Array<ArrayBuffer>;

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function desdeB64url(texto: string): Bytes {
  const b = atob(texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

const unir = (...partes: Bytes[]) => {
  const r = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of partes) {
    r.set(p, o);
    o += p.length;
  }
  return r;
};

async function hmac(clave: Bytes, datos: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', clave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, datos));
}

/** Clave pública P-256 sin comprimir (65 bytes) → JWK con x e y. */
function jwkPublica(publica: Bytes): JsonWebKey {
  return { kty: 'EC', crv: 'P-256', x: b64url(publica.slice(1, 33)), y: b64url(publica.slice(33, 65)), ext: true };
}

export interface ClavesEfimeras {
  privada: string; // d, base64url
  publica: string; // 65 bytes sin comprimir, base64url
}

/**
 * Cifra `mensaje` para una suscripción (RFC 8291 §3–§4, un solo registro de 4096).
 * `efimeras` y `sal` solo se pasan en los tests (vectores de la RFC); en uso real son aleatorias.
 */
export async function cifrar(
  mensaje: Bytes,
  p256dh: string,
  auth: string,
  efimeras?: ClavesEfimeras,
  sal: Bytes = crypto.getRandomValues(new Uint8Array(16)),
): Promise<Bytes> {
  const publicaUa = desdeB64url(p256dh);
  const secretoAuth = desdeB64url(auth);

  let privadaAs: CryptoKey;
  let publicaAs: Bytes;
  if (efimeras) {
    publicaAs = desdeB64url(efimeras.publica);
    privadaAs = await crypto.subtle.importKey(
      'jwk',
      { ...jwkPublica(publicaAs), d: efimeras.privada },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
  } else {
    const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    privadaAs = par.privateKey;
    publicaAs = new Uint8Array((await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer);
  }

  const claveUa = await crypto.subtle.importKey('raw', publicaUa, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secretoEcdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: claveUa }, privadaAs, 256));

  // IKM = HKDF(auth, ecdh, "WebPush: info" || 0 || ua || as)
  const prkClave = await hmac(secretoAuth, secretoEcdh);
  const ikm = await hmac(prkClave, unir(te.encode('WebPush: info\0'), publicaUa, publicaAs, new Uint8Array([1])));
  const prk = await hmac(sal, ikm);
  const cek = (await hmac(prk, unir(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, unir(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const clave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, clave, unir(mensaje, new Uint8Array([2]))),
  );

  // cabecera: sal (16) · rs (4, big-endian) · idlen (1) · keyid (clave pública efímera)
  const rs = new Uint8Array([0, 0, 0x10, 0]);
  return unir(sal, rs, new Uint8Array([publicaAs.length]), publicaAs, cifrado);
}

/** Cabecera Authorization VAPID (RFC 8292): JWT ES256 firmado con la clave del servidor. */
export async function cabeceraVapid(
  endpoint: string,
  publica: string,
  privada: string,
  sujeto: string,
  ahora = Math.floor(Date.now() / 1000),
): Promise<string> {
  const clave = await crypto.subtle.importKey(
    'jwk',
    { ...jwkPublica(desdeB64url(publica)), d: privada },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const cabecera = b64url(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const reclamos = b64url(
    te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: ahora + 12 * 3600, sub: sujeto })),
  );
  const firma = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, te.encode(`${cabecera}.${reclamos}`)),
  );
  return `vapid t=${cabecera}.${reclamos}.${b64url(firma)}, k=${publica}`;
}

export interface Suscripcion {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface ResultadoEnvio {
  ok: boolean;
  caducada: boolean;
  error?: string;
  /** Solo con 429: segundos que el servicio pide esperar (Retry-After) antes de volver a enviar. */
  aplazar_s?: number;
}

/** Espera por defecto si un 429 no trae Retry-After, o trae algo que no se entiende. */
export const APLAZAR_POR_DEFECTO_S = 60;

/** Retry-After (RFC 9110 §10.2.3): segundos, o una fecha HTTP. */
export function segundosDeRetryAfter(valor: string | null, ahora = Date.now()): number {
  const texto = valor?.trim() ?? '';
  if (/^\d+$/.test(texto)) return Number(texto);
  // Una fecha HTTP lleva el día y el mes en letras; sin letras (p. ej. "1.5") no es ni una cosa ni
  // otra, aunque Date.parse la acepte.
  const fecha = /[a-z]/i.test(texto) ? Date.parse(texto) : Number.NaN;
  if (Number.isNaN(fecha)) return APLAZAR_POR_DEFECTO_S;
  return Math.max(0, Math.round((fecha - ahora) / 1000));
}

/**
 * `destino` solo lo pasan las pruebas de integración (`PUSH_ENDPOINT_PRUEBAS`, RV-86): la petición va
 * ahí, pero la firma VAPID sigue siendo para el servicio de push de verdad (`aud` = origen del endpoint).
 */
export async function enviar(
  s: Suscripcion,
  aviso: { titulo: string; cuerpo: string; url: string | null },
  vapid: { publica: string; privada: string; sujeto: string },
  destino: string = s.endpoint,
): Promise<ResultadoEnvio> {
  try {
    const cuerpo = await cifrar(te.encode(JSON.stringify(aviso)), s.keys.p256dh, s.keys.auth);
    const r = await fetch(destino, {
      method: 'POST',
      headers: {
        Authorization: await cabeceraVapid(s.endpoint, vapid.publica, vapid.privada, vapid.sujeto),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
      },
      body: cuerpo,
    });
    // 404/410: la suscripción ya no existe en el servicio de push. Solo estos dos caducan (RV-84).
    if (r.status === 404 || r.status === 410) return { ok: false, caducada: true, error: `HTTP ${r.status}` };
    // 429: pasajero; el servicio dice cuánto esperar.
    if (r.status === 429) {
      return {
        ok: false,
        caducada: false,
        error: 'HTTP 429',
        aplazar_s: segundosDeRetryAfter(r.headers.get('Retry-After')),
      };
    }
    return r.ok ? { ok: true, caducada: false } : { ok: false, caducada: false, error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, caducada: false, error: (e as Error).message.slice(0, 200) };
  }
}
