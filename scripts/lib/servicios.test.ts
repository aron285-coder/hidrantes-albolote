// `docs/41` RV-540: `asegurarBucket` pone los límites del bucket de fotos y no tenía test. Lo que
// importa es que ponga **exactamente** los de `CONFIG_BUCKET_FOTOS`, los mismos que revisa la
// vigilancia cada día: si los dos sitios se separan, la vigilancia avisaría de una diferencia que
// puso el propio arranque.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_BUCKET_FOTOS } from './bucket-fotos.ts';
import { asegurarBucket } from './servicios.ts';

const URL_PROYECTO = 'https://proyecto.supabase.co';
const CLAVE = 'clave-de-servicio'; // detectar-secretos:permitir (valor de prueba)
const BUCKET = 'hidrantes-fotos-dev';

interface Llamada {
  url: string;
  method: string;
  cuerpo: Record<string, unknown> | null;
  cabeceras: Record<string, string>;
}

/** `existe`: qué contesta el GET del bucket. El resto, 200 vacío. */
function fingirStorage(existe: 'si' | 'no'): Llamada[] {
  const llamadas: Llamada[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((entrada, init) => {
    const url = String(entrada);
    const method = (init?.method ?? 'GET').toUpperCase();
    const cuerpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    llamadas.push({ url, method, cuerpo, cabeceras: (init?.headers ?? {}) as Record<string, string> });
    if (method === 'GET' && existe === 'no') return Promise.resolve(new Response('no hay', { status: 404 }));
    if (method === 'GET') return Promise.resolve(new Response(JSON.stringify({ id: BUCKET })));
    return Promise.resolve(new Response('{}'));
  });
  return llamadas;
}

afterEach(() => vi.restoreAllMocks());

describe('asegurarBucket', () => {
  it('si no existe, lo crea con los tres límites de CONFIG_BUCKET_FOTOS', async () => {
    const llamadas = fingirStorage('no');
    expect(await asegurarBucket(URL_PROYECTO, CLAVE, BUCKET)).toBe('creado');

    const creacion = llamadas.find((l) => l.method === 'POST')!;
    expect(creacion.url).toBe(`${URL_PROYECTO}/storage/v1/bucket`);
    expect(creacion.cuerpo).toEqual({ id: BUCKET, name: BUCKET, ...CONFIG_BUCKET_FOTOS });
    expect(creacion.cabeceras.apikey).toBe(CLAVE);
  });

  it('si ya existe, lo deja con esos mismos límites', async () => {
    const llamadas = fingirStorage('si');
    expect(await asegurarBucket(URL_PROYECTO, CLAVE, BUCKET)).toBe('actualizado');

    const actualizacion = llamadas.find((l) => l.method === 'PUT')!;
    expect(actualizacion.url).toBe(`${URL_PROYECTO}/storage/v1/bucket/${BUCKET}`);
    expect(actualizacion.cuerpo).toEqual({ id: BUCKET, ...CONFIG_BUCKET_FOTOS });
    expect(llamadas.some((l) => l.method === 'POST')).toBe(false);
  });

  it('no inventa ningún límite: solo esos tres campos, y públicos para que la foto se vea', async () => {
    const llamadas = fingirStorage('no');
    await asegurarBucket(URL_PROYECTO, CLAVE, BUCKET);
    const cuerpo = llamadas.find((l) => l.method === 'POST')!.cuerpo!;
    expect(Object.keys(cuerpo).sort()).toEqual(
      ['id', 'name', 'public', 'file_size_limit', 'allowed_mime_types'].sort(),
    );
    expect(cuerpo.public).toBe(true);
    expect(cuerpo.file_size_limit).toBe(5 * 1024 * 1024);
    expect(cuerpo.allowed_mime_types).toEqual(['image/jpeg', 'image/webp']);
  });
});
