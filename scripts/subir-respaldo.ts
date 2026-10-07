// Sube un respaldo ya cifrado al Worker de solo escritura hidrantes-respaldos (docs/31 RV-133,
// DEC-173) y comprueba que lo guardado ocupa lo mismo que el archivo. Lo usa respaldo.yml:
//
//   npx tsx scripts/subir-respaldo.ts --tipo bd    --archivo hidrantes-2026-10-04.sql.gpg --nombre 2026-10-04.sql.gpg
//   npx tsx scripts/subir-respaldo.ts --tipo fotos --archivo fotos-2026-10-04.tar.gpg     --nombre 2026-10.tar.gpg
//
// Lee RESPALDOS_URL y RESPALDO_SUBIDA_SECRETO del entorno. Nunca imprime el secreto ni el contenido:
// solo nombres, tamaños y códigos HTTP. El volcado va en una petición; las fotos, por partes de 50 MB.
// Si el nombre ya existe en R2 (otra ejecución el mismo día, o el mismo mes en las fotos), el Worker
// no lo sobrescribe: se avisa y no es un fallo, porque la copia de ese día ya está.

import { open, stat } from 'node:fs/promises';
import { abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';

export const TAMANO_PARTE = 50 * 1024 * 1024;
const INTENTOS = 3;

export type Tipo = 'bd' | 'fotos';

export interface Subida {
  url: string;
  secreto: string;
  tipo: Tipo;
  archivo: string;
  nombre: string;
  /** Solo para los tests: partes más pequeñas que 50 MB. */
  tamanoParte?: number;
}

export type Resultado = { salida: 'subido'; bytes: number } | { salida: 'ya_existia' };

const NOMBRES: Record<Tipo, RegExp> = {
  bd: /^\d{4}-\d{2}-\d{2}\.sql\.gpg$/,
  fotos: /^\d{4}-\d{2}\.tar\.gpg$/,
};

export function comprobarNombre(tipo: string, nombre: string): Tipo {
  if (tipo !== 'bd' && tipo !== 'fotos') abortar('--tipo tiene que ser bd o fotos.');
  if (!NOMBRES[tipo].test(nombre)) {
    abortar(`--nombre no vale para ${tipo}: ${tipo === 'bd' ? 'AAAA-MM-DD.sql.gpg' : 'AAAA-MM.tar.gpg'}.`);
  }
  return tipo;
}

/** Solo el código y el error del Worker: nunca la URL con su subida, ni cabeceras. */
async function motivo(r: Response): Promise<string> {
  const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
  return `HTTP ${r.status}${cuerpo?.error ? ` ${cuerpo.error}` : ''}`;
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Repite ante un fallo de red o un 5xx; un 4xx es definitivo y vuelve tal cual. */
async function conReintentos(hacer: () => Promise<Response>, pausa = 2000): Promise<Response> {
  let ultimo: unknown;
  for (let i = 1; i <= INTENTOS; i++) {
    try {
      const r = await hacer();
      if (r.status < 500 || i === INTENTOS) return r;
      ultimo = await motivo(r);
    } catch (e) {
      ultimo = e instanceof Error ? e.name : 'fallo de red';
      if (i === INTENTOS) abortar(`No se ha podido hablar con el Worker de respaldos (${String(ultimo)}).`);
    }
    log.aviso(`intento ${i} sin éxito (${String(ultimo)}); se repite`);
    await esperar(pausa * i);
  }
  abortar('No se ha podido hablar con el Worker de respaldos.');
}

export async function subir(s: Subida, f: typeof fetch = fetch, pausa = 2000): Promise<Resultado> {
  const base = s.url.replace(/\/+$/, '');
  const ruta = `${base}/${s.tipo}/${s.nombre}`;
  const auth = { Authorization: `Bearer ${s.secreto}` };
  const tamano = (await stat(s.archivo)).size;
  if (tamano === 0) abortar(`${s.archivo} está vacío: no se sube.`);

  const guardado = (bytes: number): Resultado => {
    if (bytes !== tamano) abortar(`R2 ha guardado ${bytes} bytes y el archivo tiene ${tamano}.`);
    return { salida: 'subido', bytes };
  };

  const archivo = await open(s.archivo, 'r');
  try {
    if (s.tipo === 'bd') {
      const cuerpo = await archivo.readFile();
      const r = await conReintentos(
        () =>
          f(ruta, {
            method: 'PUT',
            headers: { ...auth, 'Content-Type': 'application/octet-stream' },
            body: cuerpo,
          }),
        pausa,
      );
      if (r.status === 409) return { salida: 'ya_existia' };
      if (r.status !== 201) abortar(`El Worker no ha guardado el volcado: ${await motivo(r)}.`);
      return guardado(((await r.json()) as { bytes: number }).bytes);
    }

    // Fotos, por partes. Todas de 50 MB menos la última: R2 lo exige.
    const inicio = await conReintentos(() => f(`${ruta}?accion=iniciar`, { method: 'POST', headers: auth }), pausa);
    if (inicio.status === 409) return { salida: 'ya_existia' };
    if (inicio.status !== 201) abortar(`El Worker no ha empezado la subida de las fotos: ${await motivo(inicio)}.`);
    const { subida } = (await inicio.json()) as { subida: string };
    const id = encodeURIComponent(subida);
    const partes: { parte: number; etag: string }[] = [];
    const parte = s.tamanoParte ?? TAMANO_PARTE;
    const trozo = Buffer.alloc(Math.min(parte, tamano));
    for (let n = 1, desde = 0; desde < tamano; n++, desde += parte) {
      const largo = Math.min(parte, tamano - desde);
      const { bytesRead } = await archivo.read(trozo, 0, largo, desde);
      if (bytesRead !== largo) abortar(`No se ha podido leer la parte ${n} de ${s.archivo}.`);
      const cuerpo = trozo.subarray(0, largo);
      const r = await conReintentos(
        () =>
          f(`${ruta}?subida=${id}&parte=${n}`, {
            method: 'PUT',
            headers: { ...auth, 'Content-Type': 'application/octet-stream' },
            body: cuerpo,
          }),
        pausa,
      );
      if (r.status !== 200) abortar(`El Worker no ha guardado la parte ${n}: ${await motivo(r)}.`);
      partes.push((await r.json()) as { parte: number; etag: string });
      log.info(`parte ${n}: ${(largo / 1024 / 1024).toFixed(1)} MB`);
    }
    const fin = await conReintentos(
      () =>
        f(`${ruta}?accion=completar&subida=${id}`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify(partes),
        }),
      pausa,
    );
    if (fin.status === 409) return { salida: 'ya_existia' };
    if (fin.status !== 201) abortar(`El Worker no ha completado la subida de las fotos: ${await motivo(fin)}.`);
    return guardado(((await fin.json()) as { bytes: number }).bytes);
  } finally {
    await archivo.close();
  }
}

/** /estado: el último de este tipo ocupa lo que se acaba de subir y es de hace menos de una hora. */
export async function comprobarEstado(
  url: string,
  secreto: string,
  tipo: Tipo,
  bytes: number,
  f: typeof fetch = fetch,
  ahora = Date.now(),
): Promise<void> {
  const r = await f(`${url.replace(/\/+$/, '')}/estado`, { headers: { Authorization: `Bearer ${secreto}` } });
  if (r.status !== 200) abortar(`/estado no responde: ${await motivo(r)}.`);
  const e = ((await r.json()) as Record<Tipo, { fecha: string; bytes: number } | null>)[tipo];
  if (!e) abortar(`/estado no ve ningún respaldo de ${tipo} en R2.`);
  if (e.bytes !== bytes) abortar(`/estado dice ${e.bytes} bytes para el último de ${tipo}, y se han subido ${bytes}.`);
  if (ahora - Date.parse(e.fecha) > 60 * 60 * 1000) abortar(`/estado dice que el último de ${tipo} es de ${e.fecha}.`);
}

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const url = process.env.RESPALDOS_URL || abortar('Falta RESPALDOS_URL (variable del repositorio).');
  const secreto = process.env.RESPALDO_SUBIDA_SECRETO || abortar('Falta el secreto RESPALDO_SUBIDA_SECRETO.');
  const nombre = valores.get('nombre') ?? abortar('Indica --nombre.');
  const tipo = comprobarNombre(valores.get('tipo') ?? '', nombre);
  const archivo = valores.get('archivo') ?? abortar('Indica --archivo con el respaldo ya cifrado.');
  if (!archivo.endsWith('.gpg')) abortar('Solo se sube un archivo cifrado (.gpg).');

  log.paso(`Segunda copia en R2: ${tipo}/${nombre}`);
  const r = await subir({ url, secreto, tipo, archivo, nombre });
  if (r.salida === 'ya_existia') {
    // No es un fallo: esa copia ya está y el Worker, a propósito, no la cambia.
    console.log(
      `::warning::${tipo}/${nombre} ya estaba en R2 (otra ejecución en el mismo periodo): no se sobrescribe.`,
    );
    return;
  }
  await comprobarEstado(url, secreto, tipo, r.bytes);
  log.ok(`${tipo}/${nombre} en R2: ${r.bytes} bytes, los mismos que el archivo`);
}

if (import.meta.main) ejecutarScript(principal);
