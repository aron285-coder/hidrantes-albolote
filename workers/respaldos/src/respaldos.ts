// La segunda copia del respaldo, fuera de GitHub (docs/31 RV-133, DEC-173). respaldo.yml sube aquí
// el mismo archivo cifrado que deja como artefacto, y el Worker lo guarda en el bucket R2
// `hidrantes-respaldos`, que borra lo de más de 400 días con su regla de ciclo de vida.
//
// Solo escritura, a propósito: quien robe RESPALDO_SUBIDA_SECRETO solo puede **añadir** archivos.
//   - PUT  /bd/AAAA-MM-DD.sql.gpg                          el volcado, de una vez (cabe en 100 MB)
//   - POST /fotos/AAAA-MM.tar.gpg?accion=iniciar           empieza una subida por partes
//   - PUT  /fotos/AAAA-MM.tar.gpg?subida=…&parte=N         una parte de 50 MB (la última, menos)
//   - POST /fotos/AAAA-MM.tar.gpg?accion=completar&subida=…   con [{parte, etag}] en el cuerpo
//   - GET  /estado                                         fecha y tamaño del último de cada tipo
// No lista, no lee y no borra nada, y no sobrescribe un objeto que ya existe (409): ni con PUT, que
// usa onlyIf (If-None-Match: *), ni al iniciar o completar una subida por partes. Una subida por
// partes que se queda a medias no es una copia: la regla de ciclo de vida la aborta a los 7 días.
//
// Nunca registra nada: ni el secreto ni el contenido (cifrado, pero igualmente).

// ---------- lo mínimo de R2 que se usa (sin @cloudflare/workers-types) ----------

export interface ObjetoR2 {
  key: string;
  size: number;
  uploaded: Date;
}

export interface ParteR2 {
  partNumber: number;
  etag: string;
}

export interface SubidaR2 {
  readonly key: string;
  readonly uploadId: string;
  uploadPart(numero: number, cuerpo: ReadableStream | ArrayBuffer | string): Promise<ParteR2>;
  complete(partes: ParteR2[]): Promise<ObjetoR2>;
}

export interface ListaR2 {
  objects: ObjetoR2[];
  truncated: boolean;
  cursor?: string;
}

export interface BucketR2 {
  head(clave: string): Promise<ObjetoR2 | null>;
  put(
    clave: string,
    cuerpo: ReadableStream | ArrayBuffer | string | null,
    opciones?: { onlyIf?: Headers },
  ): Promise<ObjetoR2 | null>;
  list(opciones: { prefix: string; cursor?: string; limit?: number }): Promise<ListaR2>;
  createMultipartUpload(clave: string): Promise<SubidaR2>;
  resumeMultipartUpload(clave: string, idSubida: string): SubidaR2;
}

export interface Env {
  RESPALDOS: BucketR2;
  RESPALDO_SUBIDA_SECRETO?: string;
}

// ---------- reglas ----------

/** Trozos de 50 MB: por debajo de los 100 MB por petición del plan gratuito de Workers. */
export const TAMANO_PARTE = 50 * 1024 * 1024;
/** El volcado va de una vez: por encima de esto, la petición ni llegaría al Worker. */
export const MAX_PUT = 95 * 1024 * 1024;
/** R2 admite hasta 10 000 partes; con 50 MB, 500 GB: de sobra. */
const MAX_PARTES = 10_000;

const NOMBRE_BD = /^\/bd\/(\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))\.sql\.gpg$/;
const NOMBRE_FOTOS = /^\/fotos\/(\d{4}-(0[1-9]|1[0-2]))\.tar\.gpg$/;

export type Tipo = 'bd' | 'fotos';

/** La clave del objeto si la ruta es una de las dos admitidas; si no, null. */
export function claveDe(ruta: string): { tipo: Tipo; clave: string } | null {
  if (NOMBRE_BD.test(ruta)) return { tipo: 'bd', clave: ruta.slice(1) };
  if (NOMBRE_FOTOS.test(ruta)) return { tipo: 'fotos', clave: ruta.slice(1) };
  return null;
}

const json = (cuerpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const error = (codigo: string, status: number): Response => json({ error: codigo }, status);

async function resumen(texto: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

/**
 * Compara en tiempo constante: los dos lados pasan por SHA-256, así que ni la longitud del secreto
 * se filtra por el tiempo de respuesta.
 */
export async function mismoSecreto(dado: string, esperado: string): Promise<boolean> {
  const [a, b] = await Promise.all([resumen(dado), resumen(esperado)]);
  let distinto = 0;
  for (let i = 0; i < a.length; i++) distinto |= a[i]! ^ b[i]!;
  return distinto === 0;
}

async function autorizado(peticion: Request, env: Env): Promise<boolean> {
  const esperado = env.RESPALDO_SUBIDA_SECRETO ?? '';
  const cabecera = peticion.headers.get('Authorization') ?? '';
  const dado = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
  // Un secreto corto no es un secreto: sin él (o mal puesto), nadie entra.
  if (esperado.length < 32 || !dado) return false;
  return mismoSecreto(dado, esperado);
}

/** El último objeto de un tipo, por nombre (la fecha va en el nombre). Lo usa solo /estado. */
async function ultimo(bucket: BucketR2, prefijo: string): Promise<ObjetoR2 | null> {
  let mejor: ObjetoR2 | null = null;
  let cursor: string | undefined;
  do {
    const pagina = await bucket.list({ prefix: prefijo, cursor, limit: 1000 });
    for (const o of pagina.objects) if (!mejor || o.key > mejor.key) mejor = o;
    cursor = pagina.truncated ? pagina.cursor : undefined;
  } while (cursor);
  return mejor;
}

const resumenObjeto = (o: ObjetoR2 | null) => (o ? { fecha: o.uploaded.toISOString(), bytes: o.size } : null);

async function estado(env: Env): Promise<Response> {
  const [bd, fotos] = await Promise.all([ultimo(env.RESPALDOS, 'bd/'), ultimo(env.RESPALDOS, 'fotos/')]);
  return json({ bd: resumenObjeto(bd), fotos: resumenObjeto(fotos) });
}

async function subirEntero(peticion: Request, env: Env, clave: string): Promise<Response> {
  const largo = Number(peticion.headers.get('Content-Length') ?? NaN);
  if (!Number.isFinite(largo) || largo <= 0) return error('SIN_TAMANO', 411);
  if (largo > MAX_PUT) return error('DEMASIADO_GRANDE', 413);
  if (await env.RESPALDOS.head(clave)) return error('YA_EXISTE', 409);
  // If-None-Match: * hace que R2 no escriba si, entre el head y ahora, alguien ha subido el mismo
  // nombre: put devuelve null y no se toca lo que había.
  const guardado = await env.RESPALDOS.put(clave, peticion.body, {
    onlyIf: new Headers({ 'If-None-Match': '*' }),
  });
  if (!guardado) return error('YA_EXISTE', 409);
  return json({ clave, bytes: guardado.size }, 201);
}

async function porPartes(peticion: Request, env: Env, clave: string, url: URL): Promise<Response> {
  const accion = url.searchParams.get('accion');
  const idSubida = url.searchParams.get('subida');

  if (peticion.method === 'POST' && accion === 'iniciar') {
    if (await env.RESPALDOS.head(clave)) return error('YA_EXISTE', 409);
    const subida = await env.RESPALDOS.createMultipartUpload(clave);
    return json({ clave, subida: subida.uploadId, tamano_parte: TAMANO_PARTE }, 201);
  }

  if (!idSubida) return error('FALTA_SUBIDA', 400);

  if (peticion.method === 'PUT') {
    const parte = Number(url.searchParams.get('parte'));
    if (!Number.isInteger(parte) || parte < 1 || parte > MAX_PARTES) return error('PARTE_NO_VALIDA', 400);
    const largo = Number(peticion.headers.get('Content-Length') ?? NaN);
    if (!Number.isFinite(largo) || largo <= 0) return error('SIN_TAMANO', 411);
    if (largo > TAMANO_PARTE) return error('DEMASIADO_GRANDE', 413);
    if (!peticion.body) return error('SIN_CUERPO', 400);
    const subida = env.RESPALDOS.resumeMultipartUpload(clave, idSubida);
    const hecha = await subida.uploadPart(parte, peticion.body);
    return json({ parte: hecha.partNumber, etag: hecha.etag });
  }

  if (peticion.method === 'POST' && accion === 'completar') {
    let partes: ParteR2[];
    try {
      const cuerpo = (await peticion.json()) as { parte: unknown; etag: unknown }[];
      if (!Array.isArray(cuerpo) || cuerpo.length === 0 || cuerpo.length > MAX_PARTES) throw new Error();
      partes = cuerpo.map((p) => {
        if (!Number.isInteger(p.parte) || typeof p.etag !== 'string') throw new Error();
        return { partNumber: p.parte as number, etag: p.etag };
      });
    } catch {
      return error('PARTES_NO_VALIDAS', 400);
    }
    // Completar escribiría encima de lo que hubiera: se comprueba otra vez justo antes.
    if (await env.RESPALDOS.head(clave)) return error('YA_EXISTE', 409);
    const subida = env.RESPALDOS.resumeMultipartUpload(clave, idSubida);
    const guardado = await subida.complete(partes);
    return json({ clave, bytes: guardado.size }, 201);
  }

  return error('NO_PERMITIDO', 405);
}

export async function atender(peticion: Request, env: Env): Promise<Response> {
  // Primero el secreto: sin él no se distingue ni qué rutas existen.
  if (!(await autorizado(peticion, env))) return error('NO_AUTORIZADO', 401);
  const url = new URL(peticion.url);

  if (url.pathname === '/estado') {
    return peticion.method === 'GET' ? estado(env) : error('NO_PERMITIDO', 405);
  }

  const destino = claveDe(url.pathname);
  if (!destino) return error('NO_ENCONTRADO', 404);

  try {
    if (destino.tipo === 'bd') {
      return peticion.method === 'PUT' ? await subirEntero(peticion, env, destino.clave) : error('NO_PERMITIDO', 405);
    }
    return await porPartes(peticion, env, destino.clave, url);
  } catch {
    // Sin detalles: R2 puede decir el nombre del bucket o de la subida, y no hace falta para nada.
    return error('FALLO_R2', 502);
  }
}
