import { describe, expect, it, vi } from 'vitest';
import { POR_PAGINA, copiar, cuerpoListado, esArchivo, rutasDelBucket, type Deposito } from './respaldo-fotos.ts';

const archivo = (name: string) => ({ name, metadata: { size: 10 } });
const carpeta = (name: string) => ({ name, metadata: null });

/** Depósito de mentira con carpetas anidadas, para no hablar con Storage en los tests. */
function deposito(arbol: Record<string, { name: string; metadata: { size: number } | null }[]>): Deposito {
  return {
    listar: vi.fn(async (prefijo: string, pagina: number) =>
      (arbol[prefijo] ?? []).slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA),
    ),
    descargar: vi.fn(async (ruta: string) => new TextEncoder().encode(`contenido de ${ruta}`)),
  };
}

describe('listado del bucket', () => {
  it('una carpeta no es un archivo: Storage las mezcla en la misma lista', () => {
    expect(esArchivo(archivo('a.jpg'))).toBe(true);
    expect(esArchivo(carpeta('fotos'))).toBe(false);
  });

  it('pagina de 100 en 100 dentro de cada prefijo', () => {
    expect(cuerpoListado('fotos', 0)).toMatchObject({ prefix: 'fotos', limit: 100, offset: 0 });
    expect(cuerpoListado('fotos', 3).offset).toBe(300);
  });

  it('baja por las carpetas y devuelve las rutas completas', async () => {
    const d = deposito({
      '': [carpeta('fotos'), archivo('suelta.jpg')],
      fotos: [carpeta('2026'), archivo('a.jpg')],
      'fotos/2026': [archivo('b.jpg')],
    });
    expect(await rutasDelBucket(d)).toEqual(['fotos/2026/b.jpg', 'fotos/a.jpg', 'suelta.jpg']);
  });

  it('sigue pidiendo páginas mientras vengan llenas: no se deja fotos fuera', async () => {
    const muchas = Array.from({ length: POR_PAGINA + 7 }, (_, i) => archivo(`f${i}.jpg`));
    const d = deposito({ '': muchas });
    const rutas = await rutasDelBucket(d);
    expect(rutas).toHaveLength(POR_PAGINA + 7);
    expect(d.listar).toHaveBeenCalledTimes(2);
  });

  it('un bucket vacío no es un error', async () => {
    expect(await rutasDelBucket(deposito({}))).toEqual([]);
  });
});

describe('copia', () => {
  it('escribe cada foto con su carpeta y cuenta los bytes', async () => {
    const d = deposito({ '': [carpeta('fotos')], fotos: [archivo('a.jpg'), archivo('b.jpg')] });
    const escritas = new Map<string, number>();
    const r = await copiar(d, 'destino', (ruta, datos) => escritas.set(ruta.replaceAll('\\', '/'), datos.byteLength));
    expect([...escritas.keys()]).toEqual(['destino/fotos/a.jpg', 'destino/fotos/b.jpg']);
    expect(r.fotos).toBe(2);
    expect(r.bytes).toBe([...escritas.values()].reduce((a, b) => a + b, 0));
  });
});
