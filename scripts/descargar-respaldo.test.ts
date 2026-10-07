// Descargar una copia de R2 (docs/31 RV-133): qué claves se piden, dónde se deja y con qué comando.

import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ } from './lib/comun.ts';
import { argsDescarga, domingosAnteriores, nombreLocal, pedido } from './descargar-respaldo.ts';

const v = (o: Record<string, string>) => new Map(Object.entries(o));

describe('descargar-respaldo (RV-133)', () => {
  it('los domingos hacia atrás, con hoy si es domingo', () => {
    expect(domingosAnteriores(new Date('2026-10-04T12:00:00Z'), 3)).toEqual(['2026-10-04', '2026-09-27', '2026-09-20']);
    expect(domingosAnteriores(new Date('2026-10-07T12:00:00Z'), 2)).toEqual(['2026-10-04', '2026-09-27']);
  });

  it('--fecha pide ese volcado; sin nada, los domingos recientes; --fotos, el tar del mes', () => {
    expect(pedido(v({ fecha: '2026-10-04' })).claves).toEqual(['bd/2026-10-04.sql.gpg']);
    expect(pedido(v({}), new Date('2026-10-07T00:00:00Z')).claves.slice(0, 2)).toEqual([
      'bd/2026-10-04.sql.gpg',
      'bd/2026-09-27.sql.gpg',
    ]);
    expect(pedido(v({ fotos: '2026-10' })).claves).toEqual(['fotos/2026-10.tar.gpg']);
    expect(() => pedido(v({ fecha: '4-10-2026' }))).toThrow(/AAAA-MM-DD/);
    expect(() => pedido(v({ fotos: '2026-10-04' }))).toThrow(/AAAA-MM/);
    expect(() => pedido(v({ fecha: '2026-10-04', fotos: '2026-10' }))).toThrow(/no los dos/);
  });

  it('lo deja fuera del repositorio: por defecto en la carpeta temporal, y nunca dentro', () => {
    expect(pedido(v({ fecha: '2026-10-04' }), new Date(), os.tmpdir()).destino).toBe(
      path.join(os.tmpdir(), 'hidrantes-respaldos'),
    );
    expect(() => pedido(v({ fecha: '2026-10-04', destino: path.join(RAIZ, 'respaldos') }))).toThrow(
      /dentro del repositorio/,
    );
    expect(() => pedido(v({ fecha: '2026-10-04', destino: RAIZ }))).toThrow(/dentro del repositorio/);
  });

  it('el mismo nombre que el artefacto de GitHub, y siempre contra el bucket remoto', () => {
    expect(nombreLocal('bd/2026-10-04.sql.gpg')).toBe('hidrantes-2026-10-04.sql.gpg');
    expect(nombreLocal('fotos/2026-10.tar.gpg')).toBe('fotos-2026-10.tar.gpg');
    expect(argsDescarga('bd/2026-10-04.sql.gpg', '/tmp/x.gpg')).toEqual([
      'wrangler',
      'r2',
      'object',
      'get',
      'hidrantes-respaldos/bd/2026-10-04.sql.gpg',
      '--file',
      '/tmp/x.gpg',
      '--remote',
    ]);
  });
});
