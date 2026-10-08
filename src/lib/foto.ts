// Foto de una propuesta (FR-21, TR-15, TR-47). En el móvil: se endereza según la orientación de la
// cámara, se reduce a ≤ 1600 px en el lado mayor y se recomprime en JPEG. El lienzo no copia
// metadatos: la foto que sube no lleva EXIF. La posición EXIF, si la hay, se lee antes y viaja
// aparte como dato de la propuesta (exif_lat/exif_lng).

import { FotoDemasiadoGrande, MAXIMO_SIN_REDUCIR, cabeceraHeic, comprobarTamano } from './foto-grande';

export const LADO_MAXIMO = 1600;
/** Objetivo medio de TR-15 (≈ 250 kB); se baja la calidad hasta acercarse. */
export const OBJETIVO_BYTES = 300 * 1024;
export const MAXIMO_BYTES = 5 * 1024 * 1024;

/**
 * Cómo se procesa cada foto. La de la conexión, como siempre (TR-15). La del sitio enseña un
 * entorno, no un detalle: 1280 px y ≈ 150 kB (docs/24 RV-103).
 */
export interface PerfilFoto {
  ladoMaximo: number;
  objetivoBytes: number;
}
export const PERFIL_CONEXION: PerfilFoto = { ladoMaximo: LADO_MAXIMO, objetivoBytes: OBJETIVO_BYTES };
export const PERFIL_SITIO: PerfilFoto = { ladoMaximo: 1280, objetivoBytes: 150 * 1024 };
const CALIDADES = [0.82, 0.72, 0.62, 0.52];

export interface FotoProcesada {
  blob: Blob;
  ancho: number;
  alto: number;
  exif: { lat: number; lng: number } | null;
}

/** Tamaño final conservando proporciones, sin agrandar nunca. */
export function dimensiones(ancho: number, alto: number, maximo = LADO_MAXIMO): { ancho: number; alto: number } {
  const escala = Math.min(1, maximo / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/**
 * Posición GPS del bloque EXIF de un JPEG (APP1 → IFD0 → GPSInfo). Devuelve null si no hay o si
 * el archivo no es un JPEG con EXIF. Solo lee; nunca lanza.
 */
export function leerGpsExif(datos: ArrayBuffer): { lat: number; lng: number } | null {
  try {
    const v = new DataView(datos);
    if (v.getUint16(0) !== 0xffd8) return null;
    let pos = 2;
    while (pos + 4 < v.byteLength) {
      const marca = v.getUint16(pos);
      const largo = v.getUint16(pos + 2);
      if (marca === 0xffe1 && v.getUint32(pos + 4) === 0x45786966) return gpsDeTiff(v, pos + 10);
      if ((marca & 0xff00) !== 0xff00 || marca === 0xffda) return null;
      pos += 2 + largo;
    }
    return null;
  } catch {
    return null;
  }
}

function gpsDeTiff(v: DataView, tiff: number): { lat: number; lng: number } | null {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => v.getUint16(tiff + o, le);
  const u32 = (o: number) => v.getUint32(tiff + o, le);
  const entradas = (ifd: number) => {
    const n = u16(ifd);
    return Array.from({ length: n }, (_, i) => ifd + 2 + i * 12);
  };
  const ifd0 = u32(4);
  const gpsEntrada = entradas(ifd0).find((e) => u16(e) === 0x8825);
  if (gpsEntrada === undefined) return null;
  const gps = u32(gpsEntrada + 8);
  const campos = new Map(entradas(gps).map((e) => [u16(e), e]));
  const ref = (tag: number) => {
    const e = campos.get(tag);
    return e === undefined ? null : String.fromCharCode(v.getUint8(tiff + e + 8));
  };
  const grados = (tag: number) => {
    const e = campos.get(tag);
    if (e === undefined) return null;
    const off = u32(e + 8);
    const racional = (i: number) => u32(off + i * 8) / (u32(off + i * 8 + 4) || 1);
    return racional(0) + racional(1) / 60 + racional(2) / 3600;
  };
  const lat = grados(2);
  const lng = grados(4);
  if (lat === null || lng === null) return null;
  const firma = (r: string | null, negativo: string) => (r === negativo ? -1 : 1);
  const resultado = { lat: lat * firma(ref(1), 'S'), lng: lng * firma(ref(3), 'W') };
  if (Math.abs(resultado.lat) > 90 || Math.abs(resultado.lng) > 180) return null;
  if (resultado.lat === 0 && resultado.lng === 0) return null;
  return resultado;
}

/**
 * Tamaño guardado (el del SOF, antes de girar) y orientación EXIF (1–8; 1 si no hay) de un JPEG,
 * leídos de la cabecera sin decodificar la imagen. Null si no es un JPEG o no se encuentra el SOF.
 * Solo lee; nunca lanza.
 */
export function cabeceraJpeg(datos: ArrayBuffer): { ancho: number; alto: number; orientacion: number } | null {
  try {
    const v = new DataView(datos);
    if (v.getUint16(0) !== 0xffd8) return null;
    let orientacion = 1;
    let pos = 2;
    while (pos + 4 <= v.byteLength) {
      const marca = v.getUint16(pos);
      if ((marca & 0xff00) !== 0xff00 || marca === 0xffda) return null;
      const largo = v.getUint16(pos + 2);
      if (marca === 0xffe1 && v.getUint32(pos + 4) === 0x45786966) orientacion = orientacionDeTiff(v, pos + 10);
      // SOF0–SOF15, salvo DHT (C4), JPG (C8) y DAC (CC), que comparten el rango.
      if (marca >= 0xffc0 && marca <= 0xffcf && marca !== 0xffc4 && marca !== 0xffc8 && marca !== 0xffcc) {
        const alto = v.getUint16(pos + 5);
        const ancho = v.getUint16(pos + 7);
        return ancho && alto ? { ancho, alto, orientacion } : null;
      }
      pos += 2 + largo;
    }
    return null;
  } catch {
    return null;
  }
}

function orientacionDeTiff(v: DataView, tiff: number): number {
  try {
    const le = v.getUint16(tiff) === 0x4949;
    const ifd0 = tiff + v.getUint32(tiff + 4, le);
    const n = v.getUint16(ifd0, le);
    for (let i = 0; i < n; i++) {
      const e = ifd0 + 2 + i * 12;
      if (v.getUint16(e, le) === 0x0112) {
        const o = v.getUint16(e + 8, le);
        return o >= 1 && o <= 8 ? o : 1;
      }
    }
  } catch {
    // EXIF raro: sin orientación
  }
  return 1;
}

/**
 * Cómo pedir la imagen al navegador (docs/31 RV-157). Una foto de 50 o 108 MP decodificada entera
 * puede cerrar la pestaña en un Android medio: si es más grande que lo que se va a guardar, se pide
 * ya reducida al tamaño final. El tamaño es el de la foto girada (orientación 5–8: de pie), porque
 * 'from-image' gira antes de reducir.
 */
export function opcionesDecodificar(
  cabecera: { ancho: number; alto: number; orientacion: number } | null,
  perfil: PerfilFoto,
): ImageBitmapOptions {
  // 'from-image' aplica la orientación EXIF de la cámara al dibujar (es el valor por defecto).
  const base: ImageBitmapOptions = { imageOrientation: 'from-image' };
  if (!cabecera) return base;
  const girada = cabecera.orientacion >= 5;
  const ancho = girada ? cabecera.alto : cabecera.ancho;
  const alto = girada ? cabecera.ancho : cabecera.alto;
  const final = dimensiones(ancho, alto, perfil.ladoMaximo);
  if (final.ancho >= ancho) return base;
  // Solo el ancho: el navegador guarda la proporción. Si alguno redujera antes de girar, la foto
  // saldría más pequeña, nunca deformada (con alto y ancho a la vez, sí lo estaría).
  return { ...base, resizeWidth: final.ancho, resizeQuality: 'high' };
}

/**
 * Tamaño final. Con la cabecera, el de la foto girada: al reducir solo por el ancho, el navegador
 * puede redondear el alto un píxel (961 en vez de 960 en Chromium de Linux). Si la imagen
 * decodificada no tiene esa proporción (cabecera rara), manda la imagen.
 */
function tamanoFinal(
  cabecera: { ancho: number; alto: number; orientacion: number } | null,
  imagen: { width: number; height: number },
  perfil: PerfilFoto,
): { ancho: number; alto: number } {
  const deLaImagen = dimensiones(imagen.width, imagen.height, perfil.ladoMaximo);
  if (!cabecera) return deLaImagen;
  const girada = cabecera.orientacion >= 5;
  const ancho = girada ? cabecera.alto : cabecera.ancho;
  const alto = girada ? cabecera.ancho : cabecera.alto;
  if (Math.abs(ancho / alto - imagen.width / imagen.height) > 0.01 * (ancho / alto)) return deLaImagen;
  return dimensiones(ancho, alto, perfil.ladoMaximo);
}

/** Endereza, reduce y recomprime. El resultado nunca lleva EXIF ni pasa de 5 MB. */
export async function procesarFoto(archivo: Blob, perfil: PerfilFoto = PERFIL_CONEXION): Promise<FotoProcesada> {
  const cabecera = await archivo.slice(0, 256 * 1024).arrayBuffer();
  const exif = leerGpsExif(cabecera);
  // El tamaño de la cabecera, JPEG o HEIC (la HEIC, sin orientación EXIF que leer).
  const heic = cabeceraJpeg(cabecera) ? null : cabeceraHeic(cabecera);
  const datos = cabeceraJpeg(cabecera) ?? (heic && { ...heic, orientacion: 1 });
  const opciones = opcionesDecodificar(datos, perfil);
  // Una foto enorme en un navegador que no reduce al decodificar puede cerrar la pestaña: se avisa
  // antes de abrirla (docs/32 RV-244). El tamaño sale de la cabecera, JPEG o HEIC, sin decodificar.
  await comprobarTamano(datos);
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo, opciones);
  } catch (e) {
    // Un navegador que no sabe reducir al decodificar: como antes, entera. Pero no una enorme: es
    // justo lo que puede cerrar la pestaña (RV-244).
    if (opciones.resizeWidth === undefined) throw e;
    if (datos && datos.ancho * datos.alto > MAXIMO_SIN_REDUCIR) {
      throw new FotoDemasiadoGrande(Math.round((datos.ancho * datos.alto) / 1e6));
    }
    imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  }
  const lienzo = document.createElement('canvas');
  let ancho: number;
  let alto: number;
  try {
    ({ ancho, alto } = tamanoFinal(datos, imagen, perfil));
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('Sin lienzo 2D');
    ctx.drawImage(imagen, 0, 0, ancho, alto);
  } finally {
    // La memoria de la imagen decodificada se suelta siempre, también si el dibujo falla.
    imagen.close();
  }

  let blob: Blob | null = null;
  for (const calidad of CALIDADES) {
    blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/jpeg', calidad));
    if (blob && blob.size <= perfil.objetivoBytes) break;
  }
  if (!blob || blob.size > MAXIMO_BYTES) throw new Error('Foto demasiado grande');
  return { blob, ancho, alto, exif };
}

/**
 * Hacer o repetir una foto (docs/31 RV-157). Mientras se prepara la nueva, el hueco se queda sin
 * foto: dice «Preparando la foto…» y Enviar espera. Si la nueva falla, vuelve la anterior (y el
 * hueco lo dice). Devuelve si salió bien.
 */
export async function cambiarFoto(
  anterior: FotoProcesada | null,
  preparar: () => Promise<FotoProcesada>,
  alCambiar: (f: FotoProcesada | null) => void,
): Promise<boolean> {
  if (anterior) alCambiar(null);
  try {
    alCambiar(await preparar());
    return true;
  } catch {
    if (anterior) alCambiar(anterior);
    return false;
  }
}
