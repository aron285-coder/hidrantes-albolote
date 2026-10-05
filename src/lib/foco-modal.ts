// Las ventanas modales del panel dejan el resto de la página `inert` (docs/30 RV-128): con Tab el foco
// no sale de la ventana y el lector de pantalla no lee lo de detrás. El foco inicial y la vuelta del
// foco no se tocan aquí: siguen en cada componente.
//
// Una pila de ventanas: solo la de arriba queda viva. "Arriba" es la que va más abajo entre los hijos
// de <body>, porque cada portal se añade al final al abrirse; así, si una ventana de abajo pasa a ser
// modal sin cerrarse (Editar al girar la tableta con Retirar encima), no se pone encima de la otra.

import { type RefObject, useLayoutEffect } from 'react';

/**
 * Un hijo de <body> con este atributo no se inertiza nunca. Lo lleva el aviso del panel ("Guardado…",
 * los errores): tiene que verse, anunciarse y poder cerrarse aunque haya una ventana abierta.
 */
export const FUERA_DE_MODAL = 'data-fuera-de-modal';

/** Los hijos de <body> que son ventanas activas, en el orden en que se activaron (puede repetirse uno). */
const activos: Element[] = [];
/** Los elementos a los que este módulo ha puesto `inert`. A ningún otro se le quita. */
const puestos = new Set<Element>();

/** El hijo de <body> que contiene `el` (el propio `el` si ya lo es), o null si no está en <body>. */
function hijoDeBody(el: Element, body: Element): Element | null {
  let h: Element | null = el;
  while (h && h.parentElement !== body) h = h.parentElement;
  return h;
}

function aplicar(body: Element) {
  const hijos = Array.from(body.children);
  const arriba = hijos.filter((h) => activos.includes(h)).at(-1) ?? null;
  for (const el of [...puestos]) {
    if (el === arriba || !arriba || !hijos.includes(el)) {
      el.removeAttribute('inert');
      puestos.delete(el);
    }
  }
  if (!arriba) return;
  for (const h of hijos) {
    if (h === arriba || puestos.has(h)) continue;
    // Ya era inert antes de abrir (no es nuestro) o es el aviso: no se toca.
    if (h.hasAttribute('inert') || h.hasAttribute(FUERA_DE_MODAL)) continue;
    h.setAttribute('inert', '');
    puestos.add(h);
  }
}

/**
 * Marca la ventana que contiene `el` como modal: todos los demás hijos de <body> quedan `inert`.
 * Devuelve la función que la desactiva. Si `el` no está dentro de <body>, no hace nada.
 */
export function activarModal(el: Element, body: Element = el.ownerDocument.body): () => void {
  const hijo = hijoDeBody(el, body);
  if (!hijo) return () => {};
  activos.push(hijo);
  aplicar(body);
  let hecho = false;
  return () => {
    if (hecho) return;
    hecho = true;
    const i = activos.lastIndexOf(hijo);
    if (i >= 0) activos.splice(i, 1);
    aplicar(body);
  };
}

/**
 * La ventana de `ref` es modal mientras está montada y `activo` es verdadero. Al cambiar `activo`
 * (Editar al pasar de al lado de la tabla a velo o a pantalla completa) se activa o se desactiva sin
 * cerrar. Con `useLayoutEffect`, el resto queda inert antes de pintarse y se libera al desmontar antes
 * de que corran los efectos que devuelven el foco.
 */
export function useModal(ref: RefObject<Element | null>, activo = true) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!activo || !el) return;
    return activarModal(el);
  }, [ref, activo]);
}
