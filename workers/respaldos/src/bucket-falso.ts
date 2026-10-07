// Un bucket R2 en memoria para los tests del Worker y de scripts/subir-respaldo.ts (docs/31 RV-133).
// Hace lo que importa de R2: If-None-Match: * en put y subidas por partes. Anota cualquier llamada
// a delete o get, que el Worker no debe hacer nunca.

import type { BucketR2, ObjetoR2, ParteR2 } from './respaldos.ts';

/** Un bucket en memoria con lo que hace R2: If-None-Match: * en put y subidas por partes. */
export function bucketFalso() {
  const objetos = new Map<string, { bytes: Uint8Array; uploaded: Date }>();
  const subidas = new Map<string, { clave: string; partes: Map<number, Uint8Array> }>();
  const borrados: string[] = [];
  let n = 0;
  const aBytes = async (cuerpo: ReadableStream | ArrayBuffer | string | null) =>
    cuerpo === null
      ? new Uint8Array()
      : typeof cuerpo === 'string'
        ? new TextEncoder().encode(cuerpo)
        : cuerpo instanceof ArrayBuffer
          ? new Uint8Array(cuerpo)
          : new Uint8Array(await new Response(cuerpo).arrayBuffer());
  const objeto = (clave: string): ObjetoR2 | null => {
    const o = objetos.get(clave);
    return o ? { key: clave, size: o.bytes.length, uploaded: o.uploaded } : null;
  };
  const subida = (clave: string, id: string) => ({
    key: clave,
    uploadId: id,
    async uploadPart(numero: number, cuerpo: ReadableStream | ArrayBuffer | string): Promise<ParteR2> {
      const s = subidas.get(id);
      if (!s || s.clave !== clave) throw new Error('subida desconocida');
      s.partes.set(numero, await aBytes(cuerpo));
      return { partNumber: numero, etag: `etag-${numero}` };
    },
    async complete(partes: ParteR2[]): Promise<ObjetoR2> {
      const s = subidas.get(id);
      if (!s) throw new Error('subida desconocida');
      const trozos = partes.map((p) => s.partes.get(p.partNumber)!);
      const todo = new Uint8Array(trozos.reduce((t, x) => t + x.length, 0));
      let i = 0;
      for (const t of trozos) {
        todo.set(t, i);
        i += t.length;
      }
      objetos.set(clave, { bytes: todo, uploaded: new Date() });
      subidas.delete(id);
      return objeto(clave)!;
    },
  });
  const bucket: BucketR2 & { delete(clave: string): Promise<void>; get(clave: string): Promise<unknown> } = {
    async head(clave) {
      return objeto(clave);
    },
    async put(clave, cuerpo, opciones) {
      if (opciones?.onlyIf?.get('If-None-Match') === '*' && objetos.has(clave)) return null;
      objetos.set(clave, { bytes: await aBytes(cuerpo), uploaded: new Date() });
      return objeto(clave);
    },
    async list({ prefix }) {
      const lista = [...objetos.keys()].filter((k) => k.startsWith(prefix)).sort();
      return { objects: lista.map((k) => objeto(k)!), truncated: false };
    },
    async createMultipartUpload(clave) {
      const id = `subida-${++n}`;
      subidas.set(id, { clave, partes: new Map() });
      return subida(clave, id);
    },
    resumeMultipartUpload(clave, id) {
      return subida(clave, id);
    },
    // Lo que el Worker nunca debe llamar: si lo hiciera, quedaría anotado.
    async delete(clave) {
      borrados.push(clave);
      objetos.delete(clave);
    },
    async get(clave) {
      borrados.push(`leido:${clave}`);
      return objetos.get(clave) ?? null;
    },
  };
  return { bucket, objetos, borrados };
}

