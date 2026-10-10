// docs/34 RV-356 (DEC-194): las fotos propias de los enganches. En public/racores, exactamente las tres
// que usa la app, de 160 × 160 y ≤ 25 kB; en fuentes/, un original por tipo y ningún dibujo, que tenían
// Barcelona y Directo intercambiados (están en docs/archivo/racores-dibujos/).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LADO, MAXIMO_BYTES, RACORES } from './preparar-racores.ts';

const raiz = path.resolve(import.meta.dirname, '..');
const carpeta = path.join(raiz, 'public', 'racores');
const archivos = (dir: string) => readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isFile());

/** Ancho y alto de un WebP (VP8, VP8L o VP8X). */
function medidas(b: Buffer): [number, number] {
  expect(b.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(b.subarray(8, 12).toString('latin1')).toBe('WEBP');
  const tipo = b.subarray(12, 16).toString('latin1');
  if (tipo === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (tipo === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  expect(tipo).toBe('VP8 ');
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

describe('fotos de los enganches (docs/34 RV-356)', () => {
  it('public/racores tiene exactamente barcelona, granada y directo en WebP', () => {
    expect(archivos(carpeta).sort()).toEqual(['barcelona.webp', 'directo.webp', 'granada.webp']);
  });

  it.each(RACORES)('%s.webp mide 160 × 160 y pesa ≤ 25 kB', (r) => {
    const b = readFileSync(path.join(carpeta, `${r}.webp`));
    expect(medidas(b)).toEqual([LADO, LADO]);
    expect(b.length).toBeLessThanOrEqual(MAXIMO_BYTES);
  });

  it('fuentes/ tiene un original JPEG por tipo y ningún dibujo', () => {
    expect(archivos(path.join(carpeta, 'fuentes')).sort()).toEqual(['barcelona.jpg', 'directo.jpg', 'granada.jpg']);
  });

  it('los dibujos de antes están archivados, no en public/', () => {
    expect(archivos(path.join(raiz, 'docs', 'archivo', 'racores-dibujos')).sort()).toEqual([
      'LEEME.md',
      'barcelona.webp',
      'directo.svg',
      'directo.webp',
      'granada.webp',
    ]);
  });
});
