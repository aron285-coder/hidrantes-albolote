// El Worker de los respaldos (docs/31 RV-133, DEC-173): solo añade. Sin secreto, 401; no lista, no
// lee, no borra y no sobrescribe; /estado dice solo fecha y tamaño del último de cada tipo.

import { describe, expect, it } from 'vitest';
import trabajador, * as modulo from './index.ts';
import { bucketFalso } from './bucket-falso.ts';
import { type Env, TAMANO_PARTE, claveDe, mismoSecreto } from './respaldos.ts';

const SECRETO = 'x'.repeat(48); // detectar-secretos:permitir (valor de prueba)
const BASE = 'https://hidrantes-respaldos.ejemplo.workers.dev';

function entorno(secreto: string | undefined = SECRETO) {
  const falso = bucketFalso();
  const env: Env = { RESPALDOS: falso.bucket, RESPALDO_SUBIDA_SECRETO: secreto };
  return { env, ...falso };
}

function peticion(metodo: string, ruta: string, opciones: { cuerpo?: BodyInit; secreto?: string | null } = {}) {
  const headers = new Headers();
  const secreto = opciones.secreto === undefined ? SECRETO : opciones.secreto;
  if (secreto !== null) headers.set('Authorization', `Bearer ${secreto}`);
  if (typeof opciones.cuerpo === 'string') headers.set('Content-Length', String(new TextEncoder().encode(opciones.cuerpo).length));
  return new Request(`${BASE}${ruta}`, { method: metodo, headers, body: opciones.cuerpo });
}

const llamar = (env: Env, r: Request) => trabajador.fetch(r, env);

describe('Worker hidrantes-respaldos (RV-133)', () => {
  it('index.ts solo exporta el manejador por defecto', () => {
    expect(Object.keys(modulo)).toEqual(['default']);
  });

  it('sin secreto, o con otro, 401 en todo: también en /estado y en rutas que no existen', async () => {
    const { env, objetos } = entorno();
    for (const secreto of [null, 'otro-secreto-que-no-vale-para-nada-xxxxxxxxxx', '']) {
      for (const [m, ruta] of [
        ['PUT', '/bd/2026-10-04.sql.gpg'],
        ['GET', '/estado'],
        ['GET', '/'],
        ['DELETE', '/bd/2026-10-04.sql.gpg'],
      ] as const) {
        const r = await llamar(env, peticion(m, ruta, { secreto, cuerpo: m === 'PUT' ? 'x' : undefined }));
        expect(r.status, `${m} ${ruta}`).toBe(401);
      }
    }
    expect(objetos.size).toBe(0);
  });

  it('un Worker sin el secreto puesto (o con uno corto) no deja entrar a nadie', async () => {
    for (const s of [undefined, '', 'corto']) {
      const { env } = entorno(s);
      expect((await llamar(env, peticion('GET', '/estado', { secreto: s ?? '' }))).status).toBe(401);
    }
  });

  it('PUT /bd/AAAA-MM-DD.sql.gpg guarda el archivo y devuelve su tamaño', async () => {
    const { env, objetos } = entorno();
    const r = await llamar(env, peticion('PUT', '/bd/2026-10-04.sql.gpg', { cuerpo: 'cifrado' }));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ clave: 'bd/2026-10-04.sql.gpg', bytes: 7 });
    expect(new TextDecoder().decode(objetos.get('bd/2026-10-04.sql.gpg')!.bytes)).toBe('cifrado');
  });

  it('no sobrescribe: el mismo nombre otra vez es 409 y lo guardado no cambia', async () => {
    const { env, objetos } = entorno();
    await llamar(env, peticion('PUT', '/bd/2026-10-04.sql.gpg', { cuerpo: 'bueno' }));
    const r = await llamar(env, peticion('PUT', '/bd/2026-10-04.sql.gpg', { cuerpo: 'malo-y-mas-largo' }));
    expect(r.status).toBe(409);
    expect(new TextDecoder().decode(objetos.get('bd/2026-10-04.sql.gpg')!.bytes)).toBe('bueno');
  });

  it('no sobrescribe aunque otra subida gane entre la comprobación y la escritura (onlyIf)', async () => {
    const { env, bucket, objetos } = entorno();
    const head = bucket.head.bind(bucket);
    // El head dice que no existe, pero justo después alguien lo escribe.
    bucket.head = async (clave) => {
      const r = await head(clave);
      objetos.set(clave, { bytes: new TextEncoder().encode('primero'), uploaded: new Date() });
      return r;
    };
    const r = await llamar(env, peticion('PUT', '/bd/2026-10-04.sql.gpg', { cuerpo: 'segundo' }));
    expect(r.status).toBe(409);
    expect(new TextDecoder().decode(objetos.get('bd/2026-10-04.sql.gpg')!.bytes)).toBe('primero');
  });

  it('no lista, no lee y no borra: GET, HEAD y DELETE de un objeto, y la raíz, no tocan nada', async () => {
    const { env, borrados } = entorno();
    await llamar(env, peticion('PUT', '/bd/2026-10-04.sql.gpg', { cuerpo: 'x' }));
    for (const [m, ruta, codigo] of [
      ['GET', '/bd/2026-10-04.sql.gpg', 405],
      ['HEAD', '/bd/2026-10-04.sql.gpg', 405],
      ['DELETE', '/bd/2026-10-04.sql.gpg', 405],
      ['DELETE', '/fotos/2026-10.tar.gpg?subida=s', 405],
      ['GET', '/', 404],
      ['GET', '/bd/', 404],
      ['GET', '/?list-type=2', 404],
      ['DELETE', '/estado', 405],
    ] as const) {
      expect((await llamar(env, peticion(m, ruta))).status, `${m} ${ruta}`).toBe(codigo);
    }
    expect(borrados).toEqual([]);
  });

  it('solo los nombres de respaldo: ni otras carpetas ni rutas con ..', () => {
    expect(claveDe('/bd/2026-10-04.sql.gpg')).toEqual({ tipo: 'bd', clave: 'bd/2026-10-04.sql.gpg' });
    expect(claveDe('/fotos/2026-10.tar.gpg')).toEqual({ tipo: 'fotos', clave: 'fotos/2026-10.tar.gpg' });
    for (const malo of [
      '/bd/2026-13-04.sql.gpg',
      '/bd/2026-10-04.sql',
      '/bd/../fotos/2026-10.tar.gpg',
      '/fotos/2026-10-04.tar.gpg',
      '/otra/2026-10-04.sql.gpg',
      '/bd/2026-10-04.sql.gpg/x',
    ]) {
      expect(claveDe(malo), malo).toBeNull();
    }
  });

  it('fotos por partes: iniciar, subir partes y completar; después, el mismo mes es 409', async () => {
    const { env, objetos } = entorno();
    const ruta = '/fotos/2026-10.tar.gpg';
    const inicio = await llamar(env, peticion('POST', `${ruta}?accion=iniciar`));
    expect(inicio.status).toBe(201);
    const { subida, tamano_parte } = (await inicio.json()) as { subida: string; tamano_parte: number };
    expect(tamano_parte).toBe(TAMANO_PARTE);
    const partes = [];
    for (const [i, trozo] of ['uno-', 'dos-', 'tres'].entries()) {
      const r = await llamar(env, peticion('PUT', `${ruta}?subida=${subida}&parte=${i + 1}`, { cuerpo: trozo }));
      expect(r.status).toBe(200);
      partes.push(await r.json());
    }
    const fin = await llamar(env, peticion('POST', `${ruta}?accion=completar&subida=${subida}`, { cuerpo: JSON.stringify(partes) }));
    expect(fin.status).toBe(201);
    expect(await fin.json()).toEqual({ clave: 'fotos/2026-10.tar.gpg', bytes: 12 });
    expect(new TextDecoder().decode(objetos.get('fotos/2026-10.tar.gpg')!.bytes)).toBe('uno-dos-tres');
    expect((await llamar(env, peticion('POST', `${ruta}?accion=iniciar`))).status).toBe(409);
  });

  it('completar una subida cuando el objeto ya existe es 409 y no lo cambia', async () => {
    const { env, objetos } = entorno();
    const ruta = '/fotos/2026-10.tar.gpg';
    const { subida } = (await (await llamar(env, peticion('POST', `${ruta}?accion=iniciar`))).json()) as {
      subida: string;
    };
    const parte = await (await llamar(env, peticion('PUT', `${ruta}?subida=${subida}&parte=1`, { cuerpo: 'nuevo' }))).json();
    objetos.set('fotos/2026-10.tar.gpg', { bytes: new TextEncoder().encode('viejo'), uploaded: new Date() });
    const fin = await llamar(env, peticion('POST', `${ruta}?accion=completar&subida=${subida}`, { cuerpo: JSON.stringify([parte]) }));
    expect(fin.status).toBe(409);
    expect(new TextDecoder().decode(objetos.get('fotos/2026-10.tar.gpg')!.bytes)).toBe('viejo');
  });

  it('las fotos no van de una vez, y una parte de más de 50 MB o sin número es un error', async () => {
    const { env } = entorno();
    expect((await llamar(env, peticion('PUT', '/fotos/2026-10.tar.gpg', { cuerpo: 'x' }))).status).toBe(400);
    const grande = new Request(`${BASE}/fotos/2026-10.tar.gpg?subida=s&parte=1`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${SECRETO}`, 'Content-Length': String(TAMANO_PARTE + 1) },
      body: 'x',
    });
    expect((await llamar(env, grande)).status).toBe(413);
    expect((await llamar(env, peticion('PUT', '/fotos/2026-10.tar.gpg?subida=s&parte=0', { cuerpo: 'x' }))).status).toBe(400);
    expect(
      (await llamar(env, peticion('POST', '/fotos/2026-10.tar.gpg?accion=completar&subida=s', { cuerpo: 'no es json' }))).status,
    ).toBe(400);
  });

  it('GET /estado: solo fecha y tamaño del último de cada tipo, sin nombres ni contenido', async () => {
    const { env } = entorno();
    expect(await (await llamar(env, peticion('GET', '/estado'))).json()).toEqual({ bd: null, fotos: null });
    await llamar(env, peticion('PUT', '/bd/2026-09-27.sql.gpg', { cuerpo: 'viejo' }));
    await llamar(env, peticion('PUT', '/bd/2026-10-04.sql.gpg', { cuerpo: 'nuevo-y-largo' }));
    const r = await llamar(env, peticion('GET', '/estado'));
    expect(r.status).toBe(200);
    const cuerpo = (await r.json()) as { bd: { fecha: string; bytes: number }; fotos: null };
    expect(cuerpo.fotos).toBeNull();
    expect(cuerpo.bd.bytes).toBe(13);
    expect(Object.keys(cuerpo.bd).sort()).toEqual(['bytes', 'fecha']);
    expect(Number.isNaN(Date.parse(cuerpo.bd.fecha))).toBe(false);
  });

  it('un fallo de R2 es un 502 sin detalles', async () => {
    const { env, bucket } = entorno();
    bucket.put = async () => {
      throw new Error('bucket hidrantes-respaldos: algo interno');
    };
    const r = await llamar(env, peticion('PUT', '/bd/2026-10-04.sql.gpg', { cuerpo: 'x' }));
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain('hidrantes-respaldos');
  });

  it('compara el secreto entero', async () => {
    expect(await mismoSecreto(SECRETO, SECRETO)).toBe(true);
    expect(await mismoSecreto(`${SECRETO}x`, SECRETO)).toBe(false);
    expect(await mismoSecreto(SECRETO.slice(1), SECRETO)).toBe(false);
  });
});
