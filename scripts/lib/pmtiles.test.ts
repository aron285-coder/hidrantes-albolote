import { gunzipSync, gzipSync } from 'node:zlib';
import { PMTiles, type Source } from 'pmtiles';
import { describe, expect, it } from 'vitest';
import { escribirPmtiles, teselasDelRecuadro } from './pmtiles.ts';

/** Origen en memoria para leer con la librería oficial lo que escribimos. */
function memoria(bytes: Uint8Array): Source {
  return {
    getKey: () => 'memoria',
    getBytes: async (offset, length) => ({
      data: bytes.slice(offset, offset + length).buffer as ArrayBuffer,
    }),
  };
}

const RECUADRO: [number, number, number, number] = [-3.711504, 37.206212, -3.601049, 37.404078];

describe('escritura de PMTiles v3', () => {
  it('la librería oficial relee cabecera, metadatos y cada tesela', async () => {
    const teselas = [
      { z: 12, x: 2005, y: 1597, datos: gzipSync(Buffer.from('a')) },
      { z: 10, x: 501, y: 399, datos: gzipSync(Buffer.from('bb')) },
      { z: 12, x: 2006, y: 1597, datos: gzipSync(Buffer.from('ccc')) },
    ];
    const archivo = escribirPmtiles(teselas, {
      compresionTeselas: 2,
      tipoTesela: 1,
      minZoom: 10,
      maxZoom: 12,
      recuadro: RECUADRO,
      metadatos: { name: 'prueba', vector_layers: [] },
    });
    const p = new PMTiles(memoria(archivo));
    const h = await p.getHeader();
    expect(h).toMatchObject({ specVersion: 3, minZoom: 10, maxZoom: 12, numAddressedTiles: 3, tileType: 1 });
    expect(h.minLon).toBeCloseTo(RECUADRO[0], 6);
    expect(h.maxLat).toBeCloseTo(RECUADRO[3], 6);
    expect(await p.getMetadata()).toEqual({ name: 'prueba', vector_layers: [] });
    for (const t of teselas) {
      const r = await p.getZxy(t.z, t.x, t.y);
      // La librería descomprime al leer: se compara con el contenido original.
      expect(new Uint8Array(r!.data)).toEqual(new Uint8Array(gunzipSync(t.datos)));
    }
    expect(await p.getZxy(12, 1, 1)).toBeUndefined();
  });

  it('muchas teselas: el directorio sigue cabiendo en la raíz', async () => {
    const teselas: { z: number; x: number; y: number; datos: Uint8Array }[] = [];
    for (let z = 10; z <= 15; z++) {
      for (const { x, y } of teselasDelRecuadro(z, RECUADRO)) teselas.push({ z, x, y, datos: new Uint8Array([z]) });
    }
    const archivo = escribirPmtiles(teselas, {
      compresionTeselas: 1,
      tipoTesela: 1,
      minZoom: 10,
      maxZoom: 15,
      recuadro: RECUADRO,
      metadatos: {},
    });
    const p = new PMTiles(memoria(archivo));
    const ultima = teselas.at(-1)!;
    expect(new Uint8Array((await p.getZxy(ultima.z, ultima.x, ultima.y))!.data)).toEqual(new Uint8Array([15]));
  });
});

describe('teselas del recuadro', () => {
  it('cubre Albolote y Calicasas con pocas teselas por zoom', () => {
    expect(teselasDelRecuadro(10, RECUADRO)).toEqual([{ x: 501, y: 397 }]);
    const z15 = teselasDelRecuadro(15, RECUADRO);
    expect(z15.length).toBeGreaterThan(100);
    expect(z15.length).toBeLessThan(400);
  });
});
