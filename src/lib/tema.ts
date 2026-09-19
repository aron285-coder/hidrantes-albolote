// Modo oscuro (FR-71, TR-34): según el móvil por defecto, o fijado a mano. Los tokens de cada modo
// están en index.css (06 §2.4).

import { escribir, leer } from './almacen';

export type Tema = 'sistema' | 'claro' | 'oscuro';

export function leerTema(): Tema {
  const t = leer<Tema>('tema');
  return t === 'claro' || t === 'oscuro' ? t : 'sistema';
}

export function aplicarTema(tema: Tema = leerTema()): void {
  const raiz = document.documentElement;
  if (tema === 'sistema') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', tema);
}

export function guardarTema(tema: Tema): void {
  escribir('tema', tema);
  aplicarTema(tema);
}
