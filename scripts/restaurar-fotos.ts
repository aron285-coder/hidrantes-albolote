// Devuelve al bucket las fotos de un respaldo (15 §5.3, paso 5). Como `restaurar.ts`, se usa en una
// emergencia: aquí no se borra nada, se vuelve a subir lo que falte.
//
//   npm run restaurar-fotos -- --entorno prod --archivo fotos-2026-09-20.tar.gpg
//   npm run restaurar-fotos -- --entorno prod --archivo fotos-2026-09-20 --ya-descifrado
//
// Si el archivo viene cifrado, lo descifra con `gpg` (hace falta la clave privada del sobre
// importada en este ordenador) y lo desempaqueta en una carpeta temporal.
//
// Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno: subir al bucket es cosa de la
// clave de servicio, nunca de `anon` (CLAUDE.md §3).

import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { abortar, argumentos, confirmar, ejecutar, ejecutarScript, log, preguntar, RAIZ } from './lib/comun.ts';
import { BUCKET_POR_DEFECTO } from './respaldo-fotos.ts';

export const BUCKETS: Record<string, string> = {
  staging: 'hidrantes-fotos-dev',
  prod: BUCKET_POR_DEFECTO,
};

/** Rutas de todos los archivos bajo `carpeta`, relativas a ella y con barras de URL. */
export function archivosDe(carpeta: string, prefijo = ''): string[] {
  return readdirSync(path.join(carpeta, prefijo), { withFileTypes: true }).flatMap((e) => {
    const relativa = prefijo ? `${prefijo}/${e.name}` : e.name;
    return e.isDirectory() ? archivosDe(carpeta, relativa) : [relativa];
  });
}

/**
 * El respaldo se empaqueta con la carpeta dentro (`fotos-2026-09-20/fotos/a.jpg`), así que al
 * desempaquetar hay que quitar ese primer tramo: en el bucket la foto es `fotos/a.jpg`.
 */
export const sinCarpetaRaiz = (ruta: string): string => ruta.split('/').slice(1).join('/');

export async function subir(
  url: string,
  servicio: string,
  bucket: string,
  objeto: string,
  datos: Uint8Array,
): Promise<boolean> {
  const r = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURI(objeto)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${servicio}`,
      apikey: servicio,
      'Content-Type': 'image/jpeg',
      // Si la foto ya está (restauración parcial), se deja la que hay y se sigue.
      'x-upsert': 'false',
    },
    body: new Blob([datos as BlobPart]),
  });
  if (r.ok) return true;
  // Una foto que ya está no es un problema: es una restauración parcial, se deja la que hay. Storage
  // lo cuenta como 409 en el cuerpo aunque la respuesta venga con 400 (pasa por Kong).
  const cuerpo = (await r.json().catch(() => ({}))) as { statusCode?: string; error?: string };
  if (r.status === 409 || cuerpo.statusCode === '409' || cuerpo.error === 'Duplicate') return false;
  abortar(`Storage respondió ${r.status} al subir ${objeto}: ${cuerpo.error ?? 'sin detalle'}`);
}

function descifrarYDesempaquetar(archivo: string): string {
  const carpeta = mkdtempSync(path.join(tmpdir(), 'fotos-'));
  // El tar acaba siempre dentro de la carpeta temporal y se desempaqueta desde ahí, con el nombre a
  // secas: en Windows, `tar -xf C:/…` toma la letra de unidad por un host remoto ("Cannot connect
  // to C:"), y una ruta con dos puntos tampoco sobrevive al paso por el shell.
  const tar = path.join(carpeta, 'fotos.tar');
  if (archivo.endsWith('.gpg')) {
    log.info('Descifrando con gpg (necesita la clave privada del sobre importada aquí).');
    const r = ejecutar('gpg', ['--batch', '--yes', '--decrypt', '--output', tar, archivo]);
    if (r.codigo !== 0) abortar(`gpg no ha podido descifrar el archivo:\n${r.error || r.salida}`);
  } else {
    copyFileSync(archivo, tar);
  }
  const r = ejecutar('tar', ['-xf', 'fotos.tar'], { cwd: carpeta });
  if (r.codigo !== 0) abortar(`No se ha podido desempaquetar:\n${r.error || r.salida}`);
  rmSync(tar, { force: true });
  return carpeta;
}

async function principal(): Promise<void> {
  const { banderas, valores } = argumentos();
  const entorno = valores.get('entorno') ?? abortar('Indica --entorno staging o prod.');
  const archivo = valores.get('archivo') ?? abortar('Indica --archivo <fotos-«fecha».tar.gpg>.');
  const bucket = valores.get('bucket') ?? BUCKETS[entorno] ?? abortar(`Entorno desconocido: ${entorno}`);
  const ruta = path.resolve(RAIZ, archivo);
  if (!existsSync(ruta)) abortar(`No encuentro ${archivo}.`);

  const url = process.env.SUPABASE_URL ?? abortar('Falta SUPABASE_URL.');
  const servicio =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? (await preguntar('Clave de servicio de Supabase', { oculto: true }));

  const carpeta = banderas.has('ya-descifrado') && statSync(ruta).isDirectory() ? ruta : descifrarYDesempaquetar(ruta);
  const archivos = archivosDe(carpeta);
  if (archivos.length === 0) abortar('El respaldo no trae ninguna foto.');

  log.paso(`Restaurar ${archivos.length} fotos en ${bucket} (${entorno})`);
  log.info('Las fotos que ya estén en el bucket se dejan como están.');
  if (!(await confirmar(`¿Subir ${archivos.length} fotos a ${bucket}?`))) return;

  let subidas = 0;
  let existentes = 0;
  for (const relativa of archivos) {
    const objeto = sinCarpetaRaiz(relativa);
    const nueva = await subir(url, servicio, bucket, objeto, readFileSync(path.join(carpeta, relativa)));
    if (nueva) subidas++;
    else existentes++;
  }
  log.ok(`${subidas} fotos restauradas · ${existentes} ya estaban`);
  log.info('Comprueba una ficha con foto en el panel (15 §5.3, paso 6).');
}

if (import.meta.main) ejecutarScript(principal);
