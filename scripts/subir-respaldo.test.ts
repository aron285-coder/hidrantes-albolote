// La subida del respaldo a R2 (docs/31 RV-133): contra el Worker de verdad con un bucket en memoria.
// El mismo archivo llega entero, por partes en las fotos; lo que ya existe no se toca; un 5xx se
// repite y un 401 no; y nada de lo que se imprime lleva el secreto.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import trabajador from '../workers/respaldos/src/index.ts';
import { bucketFalso } from '../workers/respaldos/src/bucket-falso.ts';
import type { Env } from '../workers/respaldos/src/respaldos.ts';
import { comprobarEstado, comprobarNombre, subir } from './subir-respaldo.ts';

const SECRETO = 's'.repeat(64); // detectar-secretos:permitir (valor de prueba)
const URL_WORKER = 'https://hidrantes-respaldos.ejemplo.workers.dev/';
const carpeta = mkdtempSync(path.join(os.tmpdir(), 'subir-respaldo-'));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

function archivo(nombre: string, contenido: string): string {
  const ruta = path.join(carpeta, nombre);
  writeFileSync(ruta, contenido);
  return ruta;
}

/** fetch que entrega cada petición al Worker, con el Content-Length que pondría la red. */
function contraElWorker(env: Env, antes?: (r: Request) => Response | undefined) {
  const llamadas: string[] = [];
  const f = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const sinLargo = new Request(entrada, init);
    const cuerpo = init?.body ? new Uint8Array(await sinLargo.clone().arrayBuffer()) : undefined;
    const headers = new Headers(init?.headers);
    if (cuerpo) headers.set('Content-Length', String(cuerpo.length));
    const peticion = new Request(entrada, { method: init?.method, headers, body: cuerpo });
    llamadas.push(`${peticion.method} ${new URL(peticion.url).pathname}${new URL(peticion.url).search}`);
    return antes?.(peticion) ?? trabajador.fetch(peticion, env);
  });
  return { f: f as unknown as typeof fetch, llamadas };
}

const nuevo = () => {
  const falso = bucketFalso();
  return { env: { RESPALDOS: falso.bucket, RESPALDO_SUBIDA_SECRETO: SECRETO } as Env, ...falso };
};

describe('subir-respaldo (RV-133)', () => {
  it('el volcado va de una vez y R2 guarda los mismos bytes', async () => {
    const { env, objetos } = nuevo();
    const { f, llamadas } = contraElWorker(env);
    const ruta = archivo('hidrantes-2026-10-04.sql.gpg', 'cifrado-de-prueba');
    const r = await subir(
      { url: URL_WORKER, secreto: SECRETO, tipo: 'bd', archivo: ruta, nombre: '2026-10-04.sql.gpg' },
      f,
      0,
    );
    expect(r).toEqual({ salida: 'subido', bytes: 17 });
    expect(llamadas).toEqual(['PUT /bd/2026-10-04.sql.gpg']);
    expect(new TextDecoder().decode(objetos.get('bd/2026-10-04.sql.gpg')!.bytes)).toBe('cifrado-de-prueba');
    await expect(comprobarEstado(URL_WORKER, SECRETO, 'bd', 17, f)).resolves.toBeUndefined();
  });

  it('las fotos van por partes del tamaño fijado, la última más pequeña, y llegan enteras', async () => {
    const { env, objetos } = nuevo();
    const { f, llamadas } = contraElWorker(env);
    const contenido = 'abcdefghij'.repeat(5) + 'xyz'; // 53 bytes: partes de 20, 20 y 13
    const ruta = archivo('fotos-2026-10-04.tar.gpg', contenido);
    const r = await subir(
      { url: URL_WORKER, secreto: SECRETO, tipo: 'fotos', archivo: ruta, nombre: '2026-10.tar.gpg', tamanoParte: 20 },
      f,
      0,
    );
    expect(r).toEqual({ salida: 'subido', bytes: 53 });
    expect(llamadas.map((l) => l.replace(/subida=[^&]+/, 'subida=ID'))).toEqual([
      'POST /fotos/2026-10.tar.gpg?accion=iniciar',
      'PUT /fotos/2026-10.tar.gpg?subida=ID&parte=1',
      'PUT /fotos/2026-10.tar.gpg?subida=ID&parte=2',
      'PUT /fotos/2026-10.tar.gpg?subida=ID&parte=3',
      'POST /fotos/2026-10.tar.gpg?accion=completar&subida=ID',
    ]);
    expect(new TextDecoder().decode(objetos.get('fotos/2026-10.tar.gpg')!.bytes)).toBe(contenido);
  });

  it('si ya está en R2 no lo sobrescribe y lo dice, sin fallar', async () => {
    const { env, objetos } = nuevo();
    const { f } = contraElWorker(env);
    const ruta = archivo('otra.sql.gpg', 'segunda');
    objetos.set('bd/2026-10-04.sql.gpg', { bytes: new TextEncoder().encode('primera'), uploaded: new Date() });
    const r = await subir(
      { url: URL_WORKER, secreto: SECRETO, tipo: 'bd', archivo: ruta, nombre: '2026-10-04.sql.gpg' },
      f,
      0,
    );
    expect(r).toEqual({ salida: 'ya_existia' });
    expect(new TextDecoder().decode(objetos.get('bd/2026-10-04.sql.gpg')!.bytes)).toBe('primera');
  });

  it('un 5xx se repite; un 401 falla a la primera y el mensaje no lleva el secreto', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { env } = nuevo();
    let n = 0;
    const { f } = contraElWorker(env, () =>
      ++n === 1 ? new Response('{"error":"FALLO_R2"}', { status: 502 }) : undefined,
    );
    const ruta = archivo('b.sql.gpg', 'x');
    await expect(
      subir({ url: URL_WORKER, secreto: SECRETO, tipo: 'bd', archivo: ruta, nombre: '2026-10-05.sql.gpg' }, f, 0),
    ).resolves.toEqual({ salida: 'subido', bytes: 1 });

    const mal = contraElWorker(env);
    const error = await subir(
      { url: URL_WORKER, secreto: 'otro'.repeat(10), tipo: 'bd', archivo: ruta, nombre: '2026-10-06.sql.gpg' },
      mal.f,
      0,
    ).catch((e: Error) => e.message);
    expect(error).toMatch(/HTTP 401 NO_AUTORIZADO/);
    expect(mal.llamadas).toHaveLength(1);
    expect(error).not.toContain('otro'.repeat(10));
  });

  it('un archivo vacío no se sube', async () => {
    const { env } = nuevo();
    const { f, llamadas } = contraElWorker(env);
    const ruta = archivo('vacio.sql.gpg', '');
    await expect(
      subir({ url: URL_WORKER, secreto: SECRETO, tipo: 'bd', archivo: ruta, nombre: '2026-10-04.sql.gpg' }, f, 0),
    ).rejects.toThrow(/vacío/);
    expect(llamadas).toEqual([]);
  });

  it('/estado tiene que ver el tamaño subido y una fecha reciente', async () => {
    const respuesta = (bd: unknown) =>
      (async () => new Response(JSON.stringify({ bd, fotos: null }))) as unknown as typeof fetch;
    const ahora = Date.parse('2026-10-04T04:00:00Z');
    await expect(comprobarEstado(URL_WORKER, SECRETO, 'bd', 10, respuesta(null), ahora)).rejects.toThrow(/ningún/);
    await expect(
      comprobarEstado(URL_WORKER, SECRETO, 'bd', 10, respuesta({ fecha: '2026-10-04T03:59:00Z', bytes: 9 }), ahora),
    ).rejects.toThrow(/9 bytes/);
    await expect(
      comprobarEstado(URL_WORKER, SECRETO, 'bd', 10, respuesta({ fecha: '2026-09-27T03:59:00Z', bytes: 10 }), ahora),
    ).rejects.toThrow(/2026-09-27/);
    await expect(
      comprobarEstado(URL_WORKER, SECRETO, 'bd', 10, respuesta({ fecha: '2026-10-04T03:59:00Z', bytes: 10 }), ahora),
    ).resolves.toBeUndefined();
  });

  it('solo los nombres que el Worker admite', () => {
    expect(comprobarNombre('bd', '2026-10-04.sql.gpg')).toBe('bd');
    expect(comprobarNombre('fotos', '2026-10.tar.gpg')).toBe('fotos');
    expect(() => comprobarNombre('fotos', '2026-10-04.tar.gpg')).toThrow(/AAAA-MM/);
    expect(() => comprobarNombre('otro', '2026-10-04.sql.gpg')).toThrow(/bd o fotos/);
  });
});
