// `docs/41` RV-540: los límites del bucket de fotos están en un solo sitio y la vigilancia los mira
// cada día. Lo que se prueba aquí es lo que decide si hay que avisar, y que ningún aviso lleve la
// clave de servicio ni la URL del proyecto (11 §6).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_BUCKET_FOTOS, diferenciasDelBucket } from './lib/bucket-fotos.ts';
import { revisar } from './revisar-bucket.ts';

const RAIZ = path.resolve(import.meta.dirname, '..');
const URL_PROYECTO = 'https://proyecto.supabase.co';
const CLAVE = 'clave-de-servicio'; // detectar-secretos:permitir (valor de prueba)
const BUCKET = 'hidrantes-fotos';

/** Lo que devuelve Storage para un bucket bien puesto, con los campos que no se miran incluidos. */
const bucketBueno = (cambios: Record<string, unknown> = {}) => ({
  id: BUCKET,
  name: BUCKET,
  owner: '',
  created_at: '2026-09-21T07:57:23.228Z',
  updated_at: '2026-09-21T07:57:23.228Z',
  ...CONFIG_BUCKET_FOTOS,
  ...cambios,
});

const pedirCon = (respuesta: Response | Error) => () =>
  respuesta instanceof Error ? Promise.reject(respuesta) : Promise.resolve(respuesta.clone());

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

describe('diferenciasDelBucket', () => {
  it('con los tres límites en su sitio, no hay nada que avisar', () => {
    expect(diferenciasDelBucket(bucketBueno())).toEqual([]);
  });

  it('un tope más alto se ve, con el valor que hay y el que debería', () => {
    const [aviso, ...resto] = diferenciasDelBucket(bucketBueno({ file_size_limit: 10 * 1024 * 1024 }));
    expect(resto).toEqual([]);
    expect(aviso).toContain('file_size_limit');
    expect(aviso).toContain('10485760');
    expect(aviso).toContain(String(CONFIG_BUCKET_FOTOS.file_size_limit));
  });

  it('un tipo de archivo de más, también', () => {
    const d = diferenciasDelBucket(bucketBueno({ allowed_mime_types: ['image/jpeg', 'image/webp', 'image/png'] }));
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('allowed_mime_types');
    expect(d[0]).toContain('image/png');
  });

  it('sin tope o sin tipos, lo dice en palabras', () => {
    expect(diferenciasDelBucket(bucketBueno({ file_size_limit: null }))[0]).toContain('sin tope');
    expect(diferenciasDelBucket(bucketBueno({ allowed_mime_types: null }))[0]).toContain('sin dato');
  });

  // Sin `public`, las fotos dejan de verse sin conexión (04 §7): es una diferencia, no un detalle.
  it('public quitado se avisa', () => {
    const d = diferenciasDelBucket(bucketBueno({ public: false }));
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('public');
  });

  it('los tres a la vez son tres avisos', () => {
    expect(
      diferenciasDelBucket(bucketBueno({ public: false, file_size_limit: 1, allowed_mime_types: [] })),
    ).toHaveLength(3);
  });

  it('una respuesta que no es un objeto no se toma por buena', () => {
    for (const v of [null, undefined, 'hola', 42, []]) expect(diferenciasDelBucket(v)).toHaveLength(1);
  });
});

describe('revisar', () => {
  it('pregunta por el bucket con la clave de servicio y no avisa de nada si está bien', async () => {
    const llamadas: [string, RequestInit | undefined][] = [];
    const pedir = (url: string, init?: RequestInit) => {
      llamadas.push([url, init]);
      return Promise.resolve(json(bucketBueno()));
    };
    expect(await revisar(URL_PROYECTO, CLAVE, BUCKET, pedir)).toEqual([]);
    expect(llamadas[0][0]).toBe(`${URL_PROYECTO}/storage/v1/bucket/${BUCKET}`);
    expect((llamadas[0][1]?.headers as Record<string, string>).apikey).toBe(CLAVE);
    // Solo lee: ni method ni cuerpo.
    expect(llamadas[0][1]?.method).toBeUndefined();
    expect(llamadas[0][1]?.body).toBeUndefined();
  });

  it('si Storage falla, lo dice con el estado y no se calla', async () => {
    const problemas = await revisar(URL_PROYECTO, CLAVE, BUCKET, pedirCon(json({ error: 'nope' }, 500)));
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('no responde');
    expect(problemas[0]).toContain('500');
  });

  it('si no hay red, también', async () => {
    const problemas = await revisar(URL_PROYECTO, CLAVE, BUCKET, pedirCon(new Error('ECONNREFUSED')));
    expect(problemas).toEqual(['el bucket de fotos no responde: no se han podido revisar sus límites']);
  });

  it('un 200 que no es JSON no se toma por un bucket bueno', async () => {
    const problemas = await revisar(URL_PROYECTO, CLAVE, BUCKET, pedirCon(new Response('<html>', { status: 200 })));
    expect(problemas).toEqual(['la respuesta del bucket de fotos no se entiende']);
  });

  // 11 §6: lo que escribe la vigilancia acaba en una issue pública y en un aviso a jefatura.
  it('ningún aviso lleva la clave de servicio ni la URL del proyecto', async () => {
    const casos = [
      json(bucketBueno({ public: false, file_size_limit: 99, allowed_mime_types: ['image/png'] })),
      json({ error: 'nope' }, 500),
      new Response('<html>', { status: 200 }),
    ];
    for (const caso of casos) {
      for (const linea of await revisar(URL_PROYECTO, CLAVE, BUCKET, pedirCon(caso))) {
        expect(linea).not.toContain(CLAVE);
        expect(linea).not.toContain(URL_PROYECTO);
      }
    }
  });
});

// Un solo sitio de verdad: la pila local y el arranque tienen que decir lo mismo que la vigilancia
// revisa. Si alguien cambia uno, este test señala el otro.
describe('los mismos límites en todas partes', () => {
  it('supabase/sql/local-storage.sql pone los de CONFIG_BUCKET_FOTOS', () => {
    const sql = readFileSync(path.join(RAIZ, 'supabase/sql/local-storage.sql'), 'utf8');
    expect(sql).toContain(String(CONFIG_BUCKET_FOTOS.file_size_limit));
    expect(sql).toMatch(/\btrue\b/); // public
    for (const tipo of CONFIG_BUCKET_FOTOS.allowed_mime_types) expect(sql).toContain(`'${tipo}'`);
    // Y nada más: un tipo de sobra en la pila local haría pasar un e2e que en producción fallaría.
    const tipos = /array\[([^\]]+)\]/.exec(sql)?.[1] ?? '';
    expect(tipos.split(',').map((t) => t.trim().replace(/'/g, ''))).toEqual(CONFIG_BUCKET_FOTOS.allowed_mime_types);
  });

  it('el guion de la vigilancia no repite los valores: los lee del módulo', () => {
    const sh = readFileSync(path.join(RAIZ, '.github/scripts/revisar-bucket.sh'), 'utf8');
    expect(sh).toContain('node scripts/revisar-bucket.ts');
    expect(sh).not.toContain(String(CONFIG_BUCKET_FOTOS.file_size_limit));
    expect(sh).not.toContain('image/jpeg');
    const ts = readFileSync(path.join(RAIZ, 'scripts/revisar-bucket.ts'), 'utf8');
    expect(ts).toContain("from './lib/bucket-fotos.ts'");
  });
});
