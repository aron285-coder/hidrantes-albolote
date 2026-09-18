// Generación de claves sin servicios externos: contraseñas, sal, VAPID (Web Push) y GPG.

import { generateKeyPairSync, randomBytes } from 'node:crypto';

/** Contraseña aleatoria solo con letras y números (segura en URL y en psql). */
export function claveAleatoria(longitud = 40): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(longitud * 2);
  let s = '';
  for (let i = 0; s.length < longitud; i++) {
    const b = bytes[i % bytes.length];
    if (b < 256 - (256 % alfabeto.length)) s += alfabeto[b % alfabeto.length];
  }
  return s;
}

export function salAleatoria(): string {
  return randomBytes(32).toString('base64url');
}

/** Par VAPID (P-256) en el formato que esperan PushManager y web-push: base64url sin relleno. */
export function paresVapid(): { publica: string; privada: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  const x = Buffer.from(pub.x!, 'base64url');
  const y = Buffer.from(pub.y!, 'base64url');
  return {
    publica: Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64url'),
    privada: priv.d!,
  };
}

/** Par GPG para cifrar respaldos (04 §10). La privada solo se muestra una vez. */
export async function parGpg(): Promise<{ publica: string; privada: string; huella: string }> {
  const openpgp = await import('openpgp');
  const { publicKey, privateKey } = await openpgp.generateKey({
    type: 'curve25519',
    userIDs: [{ name: 'Respaldo hidrantes-albolote' }],
    format: 'armored',
  });
  const clave = await openpgp.readKey({ armoredKey: publicKey });
  return { publica: publicKey, privada: privateKey, huella: clave.getFingerprint().toUpperCase() };
}
