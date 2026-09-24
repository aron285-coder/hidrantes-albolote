// FR-144 y TR-54: la purga de fotos huérfanas. Borrar fotos no se deshace, así que lo que más se
// prueba aquí es cuándo **no** hay que borrar.

import { describe, expect, it, vi } from 'vitest';
import {
  type Archivo,
  archivosDelBucket,
  borrar,
  bytesDe,
  huerfanas,
  lotes,
  MAX_FILAS_POSTGREST,
  motivoParaNoBorrar,
  purgar,
  referenciadas,
  resumen,
} from './purgar-fotos.ts';
import { readFileSync } from 'node:fs';
import type { ObjetoStorage } from './respaldo-fotos.ts';

const archivo = (ruta: string, bytes = 1000): Archivo => ({ ruta, bytes });

const URL_BASE = 'https://proyecto.supabase.co';
const SERVICIO = 'clave-de-servicio'; // detectar-secretos:permitir (valor de prueba)

describe('huerfanas', () => {
  it('deja las referenciadas y señala el resto', () => {
    const bucket = [archivo('2026/09/a.jpg'), archivo('2026/09/b.jpg'), archivo('2026/10/c.jpg')];
    expect(huerfanas(bucket, ['2026/09/b.jpg']).map((a) => a.ruta)).toEqual(['2026/09/a.jpg', '2026/10/c.jpg']);
  });

  it('sin nada que sobre, no devuelve nada', () => {
    const bucket = [archivo('a.jpg'), archivo('b.jpg')];
    expect(huerfanas(bucket, ['a.jpg', 'b.jpg'])).toEqual([]);
  });

  it('una referencia a una foto que ya no está no estorba', () => {
    expect(huerfanas([archivo('a.jpg')], ['a.jpg', 'borrada-hace-meses.jpg'])).toEqual([]);
  });
});

// La lista de conservadas la da fn_fotos_referenciadas (04 §7): puntos, propuestas vivas y subidas
// reservadas en los últimos `dias_reserva_subida` días. Si esa lista llega vacía, o es que la base está vacía —y entonces
// el bucket también debería estarlo— o es que algo ha fallado.
describe('motivoParaNoBorrar', () => {
  it('se planta si el bucket tiene fotos y la base de datos no referencia ninguna', () => {
    expect(motivoParaNoBorrar([archivo('a.jpg')], [])).toMatch(/no se borra nada/);
  });

  it('con el bucket vacío no hay nada que temer', () => {
    expect(motivoParaNoBorrar([], [])).toBeNull();
  });

  it('con referencias, adelante', () => {
    expect(motivoParaNoBorrar([archivo('a.jpg'), archivo('b.jpg')], ['a.jpg'])).toBeNull();
  });

  // RV-33: PostgREST corta cualquier respuesta en max_rows (1.000). Una lista de exactamente 1.000,
  // o de un múltiplo, huele a truncada: el resto contaría como huérfano.
  it('con 1.000 referenciadas exactas se planta: es el síntoma de una lista truncada', () => {
    const bucket = Array.from({ length: 1500 }, (_, i) => archivo(`f/${i}.jpg`));
    const vivas = bucket.slice(0, MAX_FILAS_POSTGREST).map((a) => a.ruta);
    expect(motivoParaNoBorrar(bucket, vivas)).toMatch(/1000/);
    expect(motivoParaNoBorrar(bucket, [...vivas, ...vivas.map((r) => r + 'x')])).toMatch(/2000/);
  });

  // docs/19 RV-68: con el total de la base de datos igual a la lista, ya está comprobada: un número
  // redondo de fotos no es motivo para no purgar.
  it('con total === fotos.length, 1.000 referenciadas no se plantan', () => {
    const bucket = Array.from({ length: 1050 }, (_, i) => archivo(`f/${i}.jpg`));
    const vivas = bucket.slice(0, MAX_FILAS_POSTGREST).map((a) => a.ruta);
    expect(motivoParaNoBorrar(bucket, vivas, { total: MAX_FILAS_POSTGREST })).toBeNull();
    // Sin total, o con otro, sigue plantándose.
    expect(motivoParaNoBorrar(bucket, vivas)).toMatch(/1000/);
    expect(motivoParaNoBorrar(bucket, vivas, { total: 1200 })).toMatch(/1000/);
  });

  it('se planta si una pasada borraría más de max(50, 10 %) del bucket, salvo con --forzar', () => {
    const bucket = Array.from({ length: 1000 }, (_, i) => archivo(`f/${i}.jpg`));
    const vivas = bucket.slice(0, 600).map((a) => a.ruta); // sobran 400, el 40 %
    expect(motivoParaNoBorrar(bucket, vivas)).toMatch(/40 %/);
    expect(motivoParaNoBorrar(bucket, vivas, { forzar: true })).toBeNull();
    // 50 de 100 es la mitad, pero por debajo de 50 fotos no hace falta forzar.
    const pequeno = bucket.slice(0, 100);
    expect(
      motivoParaNoBorrar(
        pequeno,
        pequeno.slice(0, 50).map((a) => a.ruta),
      ),
    ).toBeNull();
    expect(
      motivoParaNoBorrar(
        pequeno,
        pequeno.slice(0, 49).map((a) => a.ruta),
      ),
    ).toMatch(/51/);
  });
});

describe('purgar', () => {
  const bucket = Array.from({ length: 1500 }, (_, i) => archivo(`f/${i}.jpg`));
  const dependencias = (lecturas: string[][]) => {
    const borrados: string[][] = [];
    let n = 0;
    return {
      borrados,
      archivos: () => Promise.resolve(bucket),
      // Sin total, como si la base de datos no lo hubiera dicho: el múltiplo de 1.000 se planta.
      referenciadas: () => Promise.resolve({ fotos: lecturas[Math.min(n++, lecturas.length - 1)]! }),
      borrar: (rutas: string[]) => {
        borrados.push(rutas);
        return Promise.resolve();
      },
    };
  };

  it('con 1.000 referenciadas exactas y 1.500 en el bucket, aborta sin borrar', async () => {
    const d = dependencias([bucket.slice(0, 1000).map((a) => a.ruta)]);
    await expect(purgar(d, { ensayo: false, forzar: true })).rejects.toThrow(/truncada/);
    expect(d.borrados).toEqual([]);
  });

  it('una ruta que aparece en la segunda lectura no se borra', async () => {
    const primera = bucket.slice(0, 1480).map((a) => a.ruta);
    const d = dependencias([primera, [...primera, 'f/1490.jpg']]);
    const r = await purgar(d, { ensayo: false, forzar: false });
    expect(d.borrados.flat()).toHaveLength(19);
    expect(d.borrados.flat()).not.toContain('f/1490.jpg');
    expect(r.borradas).toBe(19);
  });

  it('en ensayo no borra ni vuelve a preguntar', async () => {
    const d = dependencias([bucket.slice(0, 1480).map((a) => a.ruta)]);
    const r = await purgar(d, { ensayo: true, forzar: false });
    expect(d.borrados).toEqual([]);
    expect(r.sobran).toHaveLength(20);
  });

  it('purgar-fotos.yml nunca pasa --forzar: solo se usa a mano tras un --ensayo revisado', () => {
    const lineas = readFileSync('.github/workflows/purgar-fotos.yml', 'utf8').split('\n');
    expect(lineas.filter((l) => !l.trim().startsWith('#') && l.includes('--forzar'))).toEqual([]);
  });
});

describe('lotes', () => {
  it('parte en trozos del tamaño pedido sin perder nada', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const partido = lotes(items, 100);
    expect(partido.map((l) => l.length)).toEqual([100, 100, 50]);
    expect(partido.flat()).toEqual(items);
  });

  it('con la lista vacía no hay lotes', () => {
    expect(lotes([], 100)).toEqual([]);
  });
});

describe('resumen', () => {
  const bucket = [archivo('a.jpg', 2 * 1024 * 1024), archivo('b.jpg', 1024 * 1024)];

  it('en ensayo deja claro que no se ha tocado nada', () => {
    expect(resumen(bucket, [bucket[0]], true)).toBe('Ensayo: 1 de 2 fotos sobran (2.0 MB). No se ha borrado nada.');
  });

  it('al borrar dice cuánto se ha liberado y cuánto queda', () => {
    expect(resumen(bucket, [bucket[0]], false)).toBe('1 fotos huérfanas borradas (2.0 MB). Quedan 1 (1.0 MB).');
  });

  it('bytesDe suma lo que ocupan', () => {
    expect(bytesDe(bucket)).toBe(3 * 1024 * 1024);
  });
});

describe('archivosDelBucket', () => {
  it('recorre las carpetas y se queda con las rutas completas y su tamaño', async () => {
    const porPrefijo: Record<string, ObjetoStorage[]> = {
      '': [{ name: '2026', metadata: null }],
      '2026': [{ name: '09', metadata: null }],
      '2026/09': [
        { name: 'a.jpg', metadata: { size: 120 } },
        { name: 'b.jpg', metadata: { size: 340 } },
      ],
    };
    const deposito = {
      listar: (prefijo: string, pagina: number) => Promise.resolve(pagina === 0 ? (porPrefijo[prefijo] ?? []) : []),
      descargar: () => Promise.resolve(new Uint8Array()),
    };
    expect(await archivosDelBucket(deposito)).toEqual([
      { ruta: '2026/09/a.jpg', bytes: 120 },
      { ruta: '2026/09/b.jpg', bytes: 340 },
    ]);
  });
});

const lista = (fotos: unknown[], total = fotos.length) => new Response(JSON.stringify({ fotos, total }));

describe('referenciadas', () => {
  // RV-33: una RPC que devuelve un conjunto se corta en max_rows; la lista viene en una sola fila.
  it('pregunta a fn_fotos_referenciadas_lista con la clave de servicio y el esquema hidrantes', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(lista(['2026/09/a.jpg', '2026/09/b.jpg']));
    expect(await referenciadas(URL_BASE, SERVICIO)).toEqual(['2026/09/a.jpg', '2026/09/b.jpg']);

    const [url, opciones] = espia.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${URL_BASE}/rest/v1/rpc/fn_fotos_referenciadas_lista`);
    expect((opciones.headers as Record<string, string>)['Accept-Profile']).toBe('hidrantes');
    espia.mockRestore();
  });

  it('si total no coincide con la longitud de la lista, aborta', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(lista(['a.jpg', 'b.jpg'], 1200));
    await expect(referenciadas(URL_BASE, SERVICIO)).rejects.toThrow(/1200/);
    espia.mockRestore();
  });

  it('una fila vacía o que no es texto también aborta: la lista no cuadraría con total', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(lista(['a.jpg', null, '', 7, 'b.jpg']));
    await expect(referenciadas(URL_BASE, SERVICIO)).rejects.toThrow(/no cuadra/);
    espia.mockRestore();
  });

  it('una respuesta con forma de conjunto (la RPC antigua) aborta', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(['a.jpg'])));
    await expect(referenciadas(URL_BASE, SERVICIO)).rejects.toThrow(/inesperada/);
    espia.mockRestore();
  });

  it('sin ninguna foto referenciada, la lista viene vacía (jsonb_agg da null)', async () => {
    const espia = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ fotos: null, total: 0 })));
    expect(await referenciadas(URL_BASE, SERVICIO)).toEqual([]);
    espia.mockRestore();
  });

  it('si la base de datos falla, aborta en vez de devolver una lista vacía', async () => {
    for (const respuesta of [new Response('no', { status: 401 }), new Error('caído')]) {
      const espia = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          respuesta instanceof Error ? Promise.reject(respuesta) : Promise.resolve(respuesta),
        );
      await expect(referenciadas(URL_BASE, SERVICIO)).rejects.toThrow(/fotos referenciadas/);
      espia.mockRestore();
    }
  });
});

describe('borrar', () => {
  it('manda las rutas en lotes al bucket indicado', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    const rutas = Array.from({ length: 150 }, (_, i) => `2026/09/${i}.jpg`);
    await borrar(URL_BASE, SERVICIO, 'hidrantes-fotos-dev', rutas);

    expect(espia).toHaveBeenCalledTimes(2);
    const [url, opciones] = espia.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${URL_BASE}/storage/v1/object/hidrantes-fotos-dev`);
    expect(opciones.method).toBe('DELETE');
    expect(JSON.parse(opciones.body as string)).toEqual({ prefixes: rutas.slice(0, 100) });
    espia.mockRestore();
  });

  it('sin rutas no llama a Storage', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    await borrar(URL_BASE, SERVICIO, 'hidrantes-fotos', []);
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  it('si Storage falla, aborta: mejor dejarlas que creer que se han borrado', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 500 }));
    await expect(borrar(URL_BASE, SERVICIO, 'hidrantes-fotos', ['a.jpg'])).rejects.toThrow(/Storage/);
    espia.mockRestore();
  });
});
