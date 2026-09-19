// Solo para pruebas: construye un bloque APP1/EXIF con posición GPS para insertarlo tras el SOI de
// un JPEG. Así los tests comprueban que se lee la posición y que la foto procesada no la conserva.

function racionales(grados: number): number[] {
  const g = Math.floor(grados);
  const mTotal = (grados - g) * 60;
  const m = Math.floor(mTotal);
  const s = Math.round((mTotal - m) * 60 * 10000);
  return [g, 1, m, 1, s, 10000];
}

/** Segmento APP1 completo (FFE1 + largo + "Exif\0\0" + TIFF big-endian con IFD0 → GPS). */
export function segmentoExifGps(lat: number, lng: number): Uint8Array {
  const tiff: number[] = [];
  const u16 = (n: number) => tiff.push((n >> 8) & 255, n & 255);
  const u32 = (n: number) => tiff.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  // Cabecera TIFF: MM, 42, IFD0 en 8
  tiff.push(0x4d, 0x4d);
  u16(42);
  u32(8);
  // IFD0: una entrada GPSInfo (0x8825, LONG) → IFD GPS en 26
  u16(1);
  u16(0x8825);
  u16(4);
  u32(1);
  u32(26);
  u32(0);
  // IFD GPS en 26: 4 entradas; datos racionales a partir de 26 + 2 + 4*12 + 4 = 80
  u16(4);
  const latR = racionales(Math.abs(lat));
  const lngR = racionales(Math.abs(lng));
  u16(1);
  u16(2);
  u32(2);
  tiff.push(lat < 0 ? 83 : 78, 0, 0, 0); // 'S' o 'N'
  u16(2);
  u16(5);
  u32(3);
  u32(80);
  u16(3);
  u16(2);
  u32(2);
  tiff.push(lng < 0 ? 87 : 69, 0, 0, 0); // 'W' o 'E'
  u16(4);
  u16(5);
  u32(3);
  u32(104);
  u32(0);
  for (const n of [...latR, ...lngR]) u32(n);

  const cuerpo = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const largo = cuerpo.length + 2;
  return Uint8Array.from([0xff, 0xe1, (largo >> 8) & 255, largo & 255, ...cuerpo]);
}

/** Inserta el segmento EXIF justo después del SOI de un JPEG. */
export function conExif(jpeg: Uint8Array, lat: number, lng: number): Uint8Array {
  const seg = segmentoExifGps(lat, lng);
  const salida = new Uint8Array(jpeg.length + seg.length);
  salida.set(jpeg.subarray(0, 2), 0);
  salida.set(seg, 2);
  salida.set(jpeg.subarray(2), 2 + seg.length);
  return salida;
}
