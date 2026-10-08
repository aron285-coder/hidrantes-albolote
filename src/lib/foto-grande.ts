// docs/32 RV-244: fotos enormes en navegadores que no reducen al decodificar. Si createImageBitmap no
// admite `resizeWidth`, una foto de 50 o 108 MP se decodifica entera y puede cerrar la pestaña en un
// Android medio. Se leen las dimensiones de la cabecera (JPEG o HEIC) sin decodificar y, por encima de
// 24 MP sin reducción, se avisa en vez de arriesgarse.

/** Por encima de esto, sin reducir al decodificar, la foto no se abre (24 MP). */
export const MAXIMO_SIN_REDUCIR = 24_000_000;

/** La foto pasa de lo que este móvil puede abrir sin reducirla al decodificar. */
export class FotoDemasiadoGrande extends Error {
  constructor(readonly megapixeles: number) {
    super('FOTO_DEMASIADO_GRANDE');
    this.name = 'FotoDemasiadoGrande';
  }
}

const tipo = (v: DataView, o: number) =>
  String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

/**
 * Ancho y alto de una foto HEIC/HEIF (ISO BMFF) leídos de las cajas `ispe` de la cabecera, sin
 * decodificar. Una HEIC de móvil es una rejilla de teselas: cada tesela y la imagen entera llevan su
 * `ispe`; la de más área es la imagen entera. Null si no es HEIF o no hay `ispe`. Nunca lanza.
 */
export function cabeceraHeic(datos: ArrayBuffer): { ancho: number; alto: number } | null {
  try {
    const v = new DataView(datos);
    if (v.byteLength < 12 || tipo(v, 4) !== 'ftyp') return null;
    let mejor: { ancho: number; alto: number } | null = null;
    // `ispe`: tamaño (4) + 'ispe' (4) + versión y banderas (4) + ancho (4) + alto (4).
    for (let o = 4; o + 16 <= v.byteLength; o++) {
      if (v.getUint8(o) !== 0x69 || tipo(v, o) !== 'ispe') continue;
      const ancho = v.getUint32(o + 8);
      const alto = v.getUint32(o + 12);
      if (ancho && alto && (!mejor || ancho * alto > mejor.ancho * mejor.alto)) mejor = { ancho, alto };
    }
    return mejor;
  } catch {
    return null;
  }
}

let reduce: Promise<boolean> | null = null;

/** Un PNG de 1 × 1 px: lo justo para preguntar al navegador. */
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * Si este navegador cambia el tamaño al decodificar: unos rechazan `resizeWidth` y otros lo ignoran y
 * devuelven la imagen tal cual. Se prueba una vez, pidiendo un PNG de 1 × 1 a 2 × 2.
 */
export function reduceAlDecodificar(): Promise<boolean> {
  reduce ??= (async () => {
    try {
      const png = Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0));
      const b = await createImageBitmap(new Blob([png], { type: 'image/png' }), { resizeWidth: 2, resizeHeight: 2 });
      const bien = b.width === 2;
      b.close();
      return bien;
    } catch {
      return false;
    }
  })();
  return reduce;
}

/** Para los tests: olvida la prueba hecha. */
export function _reiniciarReduce() {
  reduce = null;
}

/**
 * Lanza FotoDemasiadoGrande si la foto de `dimensiones` pasa de 24 MP y el navegador no la puede
 * reducir al decodificar. Sin dimensiones (cabecera rara) no se puede saber: sigue como antes.
 */
export async function comprobarTamano(dimensiones: { ancho: number; alto: number } | null): Promise<void> {
  if (!dimensiones) return;
  const pixeles = dimensiones.ancho * dimensiones.alto;
  if (pixeles <= MAXIMO_SIN_REDUCIR) return;
  if (await reduceAlDecodificar()) return;
  throw new FotoDemasiadoGrande(Math.round(pixeles / 1e6));
}
