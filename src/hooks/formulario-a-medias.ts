// docs/32 RV-239: volver atrás desde un formulario a medias pregunta antes de tirar lo escrito y las
// fotos. La flecha de la barra lo pregunta directamente; para el "atrás" de Android (y el del
// navegador) el formulario pone una entrada de historial propia, como Editar en el panel (docs/29
// RV-124): el "atrás" la quita a ella y no a la pantalla, y si hay algo rellenado se vuelve a poner y
// se pregunta.

import { useCallback, useEffect, useRef, useState } from 'react';
import { type NavigateOptions, useNavigate } from 'react-router';

/** La entrada de historial del formulario lleva este campo, con un valor distinto en cada formulario. */
const MARCA = 'formularioProponer';
const marcaActual = () => (window.history.state as Record<string, unknown> | null)?.[MARCA];
/** El índice de react-router de la entrada actual: 0 si es la primera de la pestaña. */
const indice = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) as number;

/**
 * La salida del formulario. `sucio`: hay algo rellenado o alguna foto. `preguntar`: enseña "¿Salir sin
 * enviar?". Devuelve `salir` (salir sin preguntar, para "Salir" o con el formulario limpio) y
 * `reemplazarPor` (ir a otra pantalla en lugar del formulario, para la de resultado tras enviar).
 */
export function useSalidaFormulario(sucio: boolean, preguntar: () => void) {
  const navegar = useNavigate();
  const [marca] = useState(() => `${Date.now()}-${Math.random()}`);
  const sucioRef = useRef(sucio);
  const preguntarRef = useRef(preguntar);
  useEffect(() => {
    sucioRef.current = sucio;
    preguntarRef.current = preguntar;
  }, [sucio, preguntar]);
  /** Lo que hay que hacer cuando el navegador termine de quitar la entrada propia. */
  const despues = useRef<(() => void) | null>(null);
  /**
   * Ya se está saliendo: React puede tardar en desmontar el formulario (la navegación va en una
   * transición) y el popstate de esa salida no debe tomarse por otro "atrás".
   */
  const saliendo = useRef(false);

  /** Atrás de verdad: a la pantalla anterior o, si el formulario se abrió el primero, al mapa. */
  const volver = useCallback(() => {
    saliendo.current = true;
    if (indice() > 0) navegar(-1);
    else navegar('/', { replace: true });
  }, [navegar]);

  useEffect(() => {
    // Tras recargar, la entrada de antes sigue arriba con su marca vieja: se reutiliza, no se apila otra.
    if (marcaActual() !== marca) {
      const con = { ...(window.history.state as object | null), [MARCA]: marca };
      if (marcaActual()) window.history.replaceState(con, '');
      else window.history.pushState(con, '');
    }
    const atras = () => {
      const tarea = despues.current;
      if (tarea) {
        despues.current = null;
        tarea();
        return;
      }
      if (saliendo.current) return;
      // Hacia delante a la entrada propia (el botón "adelante"): no es salir.
      if (marcaActual() === marca) return;
      if (sucioRef.current) {
        window.history.pushState({ ...(window.history.state as object | null), [MARCA]: marca }, '');
        preguntarRef.current();
        return;
      }
      volver();
    };
    window.addEventListener('popstate', atras);
    return () => window.removeEventListener('popstate', atras);
  }, [marca, volver]);

  /** Quita la entrada propia (si es la de arriba) y después hace `tarea`. */
  const quitarYLuego = useCallback(
    (tarea: () => void) => {
      if (marcaActual() === marca) {
        despues.current = tarea;
        window.history.back();
      } else tarea();
    },
    [marca],
  );

  const salir = useCallback(() => quitarYLuego(volver), [quitarYLuego, volver]);
  const reemplazarPor = useCallback(
    (ruta: string, opciones: NavigateOptions = {}) =>
      quitarYLuego(() => {
        saliendo.current = true;
        navegar(ruta, { ...opciones, replace: true });
      }),
    [quitarYLuego, navegar],
  );
  return { salir, reemplazarPor };
}
