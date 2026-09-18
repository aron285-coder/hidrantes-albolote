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
});
