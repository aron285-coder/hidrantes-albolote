import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { entradaCallejero } from './precacheo.ts';

describe('precacheo del callejero (TR-117)', () => {
  it('la revisión cambia con el contenido', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'callejero-'));
    const ruta = path.join(dir, 'callejero.json');
    writeFileSync(ruta, '{"version":"1"}');
    const a = entradaCallejero(ruta);
    writeFileSync(ruta, '{"version":"2"}');
    const b = entradaCallejero(ruta);
    expect(a.url).toBe('/callejero.json');
    expect(a.revision).toMatch(/^[0-9a-f]{16}$/);
    expect(a.revision).not.toBe(b.revision);
  });
});
