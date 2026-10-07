// Dibujos de referencia del racor (FR-20, docs/24 RV-104, docs/29 RV-121, docs/31 RV-157b). Están en
// public/racores, hechos con scripts/preparar-racores.ts (DEC-152, DEC-178), y entran en el precache.
// «Otro» no tiene dibujo. Si uno no carga, la tarjeta se ve solo con el nombre.

import type { Racor } from '../tipos/punto';

/**
 * El orden de las opciones del tipo de enganche en todas partes (DEC-163, DEC-170): Barcelona,
 * Granada, Directo, Otro. Para cualquier selector de enganche, también los del panel.
 */
export const ORDEN_RACORES: readonly Racor[] = ['barcelona', 'granada', 'directo', 'otro'];

export const URL_FOTO_RACOR = {
  granada: '/racores/granada.webp',
  barcelona: '/racores/barcelona.webp',
  directo: '/racores/directo.webp',
} as const;
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
  for (const r of Object.keys(estadoFotos) as RacorConFoto[]) delete estadoFotos[r];
}
