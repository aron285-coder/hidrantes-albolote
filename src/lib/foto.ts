// Foto de una propuesta (FR-21, TR-15, TR-47). En el móvil: se endereza según la orientación de la
// cámara, se reduce a ≤ 1600 px en el lado mayor y se recomprime en JPEG. El lienzo no copia
// metadatos: la foto que sube no lleva EXIF. La posición EXIF, si la hay, se lee antes y viaja
// aparte como dato de la propuesta (exif_lat/exif_lng).

export const LADO_MAXIMO = 1600;
/** Objetivo medio de TR-15 (≈ 250 kB); se baja la calidad hasta acercarse. */
export const OBJETIVO_BYTES = 300 * 1024;
export const MAXIMO_BYTES = 5 * 1024 * 1024;
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

/** Endereza, reduce y recomprime. El resultado nunca lleva EXIF ni pasa de 5 MB. */
export async function procesarFoto(archivo: Blob): Promise<FotoProcesada> {
  const exif = leerGpsExif(await archivo.slice(0, 256 * 1024).arrayBuffer());
  // 'from-image' aplica la orientación EXIF de la cámara al dibujar (es el valor por defecto).
  const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  const { ancho, alto } = dimensiones(imagen.width, imagen.height);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Sin lienzo 2D');
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();

  let blob: Blob | null = null;
  for (const calidad of CALIDADES) {
    blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/jpeg', calidad));
    if (blob && blob.size <= OBJETIVO_BYTES) break;
  }
  if (!blob || blob.size > MAXIMO_BYTES) throw new Error('Foto demasiado grande');
  return { blob, ancho, alto, exif };
}
