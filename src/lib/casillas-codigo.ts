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
 * Lo escrito en la casilla cuando el navegador no dice qué se ha insertado (una sugerencia que
 * sustituye el valor entero, un teclado que compone): se deduce de lo que tenía (`previo`) y de lo
 * que trae ahora (`valor`). Una cifra tecleada encima de otra llega como dos caracteres, uno de
 * ellos el anterior; lo demás se toma tal cual.
 */
export function textoEscrito(previo: string, valor: string): string {
  if (previo && valor.length === 2 && valor.includes(previo)) {
    return valor.startsWith(previo) ? valor.slice(1) : valor.slice(0, 1);
  }
  return valor;
}

/**
 * Reparte `texto` desde la casilla `desde`. Devuelve null si no trae ninguna cifra (se ignora); con
 * texto vacío, borra la casilla. Un código entero (seis cifras) va siempre desde la primera casilla,
 * entre en la que entre. Si llegan varias cifras, caben y el código queda completo, el foco sale; si
 * sobran cifras, el foco se queda en las casillas para que se vea lo que ha entrado.
 */
export function repartir(cifras: readonly string[], desde: number, texto: string): Reparto | null {
  const digitos = texto.replace(/\D/g, '');
  if (!digitos && texto) return null;
  const nuevas = [...cifras];
  if (!digitos) {
    nuevas[desde] = '';
    return { cifras: nuevas, foco: null };
  }
  const inicio = digitos.length === CIFRAS_CODIGO ? 0 : desde;
  for (let i = 0; i < digitos.length && inicio + i < CIFRAS_CODIGO; i++) nuevas[inicio + i] = digitos[i];
  const caben = digitos.length <= CIFRAS_CODIGO - inicio;
  const completo = digitos.length > 1 && caben && nuevas.every(Boolean);
  return { cifras: nuevas, foco: completo ? 'completo' : Math.min(CIFRAS_CODIGO - 1, inicio + digitos.length) };
}

/**
 * Lo que pasa al cambiar el valor de la casilla `i` (evento de entrada, no de pegar). `insertado` es
 * lo que el navegador dice que se ha insertado (`InputEvent.data`); si lo dice, manda sobre el valor,
 * que puede llevar delante o detrás la cifra que ya había.
 */
export function escribirEnCasilla(
  cifras: readonly string[],
  i: number,
  valor: string,
  insertado: string | null = null,
): Reparto | null {
  if (insertado && valor) return repartir(cifras, i, insertado);
  return repartir(cifras, i, textoEscrito(cifras[i] ?? '', valor));
}
