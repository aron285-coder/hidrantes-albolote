import { describe, expect, it } from 'vitest';
import { claveAleatoria, paresVapid, parGpg } from './claves.ts';

describe('claves', () => {
  it('claveAleatoria es alfanumérica y de la longitud pedida', () => {
    const c = claveAleatoria(40);
    expect(c).toMatch(/^[A-Za-z0-9]{40}$/);
    expect(claveAleatoria(40)).not.toBe(c);
  });

  it('VAPID: pública de 65 bytes sin comprimir y privada de 32', () => {
    const { publica, privada } = paresVapid();
    const pub = Buffer.from(publica, 'base64url');
    expect(pub).toHaveLength(65);
    expect(pub[0]).toBe(0x04);
    expect(Buffer.from(privada, 'base64url')).toHaveLength(32);
  });

  it('GPG: genera un par armado con huella', async () => {
    const { publica, privada, huella } = await parGpg();
    expect(publica).toContain('BEGIN PGP PUBLIC KEY BLOCK');
    expect(privada).toContain('PRIVATE KEY BLOCK');
    expect(huella).toMatch(/^[0-9A-F]{40,64}$/);
  });

  // Quien lee esta clave es el gpg del runner al hacer el respaldo, y GnuPG 2.4 no entiende los
  // algoritmos nuevos de RFC 9580 (Ed25519 = 27, X25519 = 25): se traga el paquete, descarta los
  // identificadores y luego no cifra nada. El respaldo fallaría un domingo de madrugada, no aquí.
  // Los de siempre (EdDSA heredado = 22, ECDH = 18) los lee cualquier GnuPG.
  it('GPG: algoritmos que GnuPG sabe leer, clave v4 y con identificador', async () => {
    const openpgp = await import('openpgp');
    const { publica } = await parGpg();
    const clave = await openpgp.readKey({ armoredKey: publica });
    expect(clave.keyPacket.version).toBe(4);
    expect(clave.keyPacket.algorithm).toBe(22);
    expect(clave.getSubkeys()[0].keyPacket.algorithm).toBe(18);
    expect(clave.getUserIDs()).toEqual(['Respaldo hidrantes-albolote <respaldo@hidrantes-albolote.invalid>']);
  });

  it('GPG: lo cifrado con la pública se abre con la privada (15 §5.3)', async () => {
    const openpgp = await import('openpgp');
    const { publica, privada } = await parGpg();
    const cifrado = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: 'volcado de prueba' }),
      encryptionKeys: await openpgp.readKey({ armoredKey: publica }),
    });
    const { data } = await openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage: cifrado }),
      decryptionKeys: await openpgp.readPrivateKey({ armoredKey: privada }),
    });
    expect(data).toBe('volcado de prueba');
  });
});
