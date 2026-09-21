// Modo oscuro (FR-71, TR-34): según el móvil por defecto, o fijado a mano. Los tokens de cada modo
// están en index.css (06 §2.4); el mapa base cambia de estilo con el modo efectivo.

import { escribir, leer } from './almacen';

export type Tema = 'sistema' | 'claro' | 'oscuro';

const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((o) => o());

export function leerTema(): Tema {
  const t = leer<Tema>('tema');
  return t === 'claro' || t === 'oscuro' ? t : 'sistema';
}

export function aplicarTema(tema: Tema = leerTema()): void {
  const raiz = document.documentElement;
  if (tema === 'sistema') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', tema);
  avisar();
}

export function guardarTema(tema: Tema): void {
  escribir('tema', tema);
  aplicarTema(tema);
}

const consultaOscuro = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Modo que se ve ahora mismo, resolviendo "según el móvil". */
export function modoEfectivo(): 'claro' | 'oscuro' {
  const t = leerTema();
  if (t !== 'sistema') return t;
  return consultaOscuro().matches ? 'oscuro' : 'claro';
}

export function suscribirTema(o: () => void): () => void {
  oyentes.add(o);
  const q = consultaOscuro();
  q.addEventListener('change', o);
  return () => {
    oyentes.delete(o);
    q.removeEventListener('change', o);
  };
}
