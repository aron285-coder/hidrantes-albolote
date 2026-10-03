// Fotos de referencia del racor (FR-20, docs/24 RV-104). Las pone el desarrollador en
// public/racores (scripts/preparar-racores.ts) y entran en el precache. «Otro» no tiene foto.

export const URL_FOTO_RACOR = { granada: '/racores/granada.webp', barcelona: '/racores/barcelona.webp' } as const;
export type RacorConFoto = keyof typeof URL_FOTO_RACOR;
export type EstadoFoto = 'ok' | 'falta';

// Lo que ya se sabe de cada foto en esta sesión: el formulario no vuelve a pedirla escondida al abrirse otra vez.
const estadoFotos: Partial<Record<RacorConFoto, EstadoFoto>> = {};

export const estadoFotoRacor = (r: RacorConFoto): EstadoFoto | undefined => estadoFotos[r];

export function marcarFotoRacor(r: RacorConFoto, e: EstadoFoto): void {
  estadoFotos[r] = e;
}

/** Solo para los tests. */
export function olvidarFotosRacor(): void {
  delete estadoFotos.granada;
  delete estadoFotos.barcelona;
}
