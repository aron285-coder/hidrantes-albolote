// Las seis casillas del código de acceso (FL-01, 07 §7.1). docs/36 RV-470: un código que entra de golpe
// en una casilla (pegado, sugerido por el teclado o por el sistema) se reparte entero, no se queda en una cifra.

export const CIFRAS_CODIGO = 6;

/** Adónde va el foco tras escribir: una casilla, o fuera del código cuando ya está completo. */
export type Foco = number | 'completo' | null;

export interface Reparto {
  cifras: string[];
  foco: Foco;
}

/**
 * Lo que de verdad se ha escrito en la casilla, a partir de lo que tenía (`previo`) y de lo que trae
 * ahora (`valor`). Una cifra tecleada encima de otra llega como dos caracteres; un código insertado
 * detrás de la cifra que ya había llega con ella delante.
 */
export function textoEscrito(previo: string, valor: string, quedan: number): string {
  if (valor.length <= 1) return valor;
  if (previo && valor.length === 2 && valor.includes(previo)) {
    return valor.startsWith(previo) ? valor.slice(1) : valor.slice(0, 1);
  }
  const digitos = valor.replace(/\D/g, '');
  if (previo && digitos.length > quedan && digitos.startsWith(previo)) return digitos.slice(previo.length);
  return valor;
}

/**
 * Reparte `texto` desde la casilla `desde`. Devuelve null si no trae ninguna cifra (se ignora); con
 * texto vacío, borra la casilla. Si llegan varias cifras y el código queda completo, el foco sale.
 */
export function repartir(cifras: readonly string[], desde: number, texto: string): Reparto | null {
  const digitos = texto.replace(/\D/g, '');
  if (!digitos && texto) return null;
  const nuevas = [...cifras];
  if (!digitos) {
    nuevas[desde] = '';
    return { cifras: nuevas, foco: null };
  }
  for (let i = 0; i < digitos.length && desde + i < CIFRAS_CODIGO; i++) nuevas[desde + i] = digitos[i];
  const completo = digitos.length > 1 && nuevas.every(Boolean);
  return { cifras: nuevas, foco: completo ? 'completo' : Math.min(CIFRAS_CODIGO - 1, desde + digitos.length) };
}

/** Lo que pasa al cambiar el valor de la casilla `i` (evento de entrada, no de pegar). */
export function escribirEnCasilla(cifras: readonly string[], i: number, valor: string): Reparto | null {
  return repartir(cifras, i, textoEscrito(cifras[i] ?? '', valor, CIFRAS_CODIGO - i));
}
