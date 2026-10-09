import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MarcadorSvg } from './MarcadorSvg';
import { escribir, leer } from '@/lib/almacen';
import type { Simbolo } from '@/lib/simbologia';
import { T } from '@/lib/textos';

// En dos grupos (docs/33 RV-319, U10): el tipo, que dice la forma, y el estado, que dice el color.
const TIPOS: [Simbolo, string][] = [
  [{ tipo: 'hidrante', caudal: 'bueno', radio_px: 7, revision_caducada: false }, T.formulario.hidrante],
  [{ tipo: 'boca_riego', caudal: 'bueno', radio_px: 5.5, revision_caducada: false }, T.formulario.bocaRiego],
];
const ESTADOS: [Simbolo, string][] = [
  [{ tipo: 'hidrante', caudal: 'bueno', radio_px: 6, revision_caducada: false }, T.formulario.bueno],
  [{ tipo: 'hidrante', caudal: 'regular', radio_px: 6, revision_caducada: false }, T.formulario.regular],
  [{ tipo: 'hidrante', caudal: 'malo', radio_px: 6, revision_caducada: false }, T.formulario.malo],
  // Barro y No funciona algo mayores: a 18 px su «B» y su aspa se leen mejor.
  [{ tipo: 'hidrante', caudal: 'barro', radio_px: 7, revision_caducada: false }, T.formulario.barro],
  [{ tipo: 'hidrante', caudal: 'no_funciona', radio_px: 7, revision_caducada: false }, T.formulario.noFunciona],
  [{ tipo: 'hidrante', caudal: 'bueno', radio_px: 6, revision_caducada: true }, T.mapa.sinRevisar],
];

/** Si la leyenda está desplegada; `null` es que nunca se ha tocado. */
export const CLAVE_LEYENDA = 'leyenda_abierta';

/**
 * Plegada por defecto, también el primer uso (docs/33 RV-310 y RV-319): desplegada tapaba media
 * pantalla del móvil. Si el voluntario la abre, se recuerda (RV-82).
 */
const abiertaAlEmpezar = (): boolean => leer<boolean>(CLAVE_LEYENDA) ?? false;

const SOMBRA = 'shadow-[0_1px_5px_rgba(0,0,0,.18)]';

/**
 * Leyenda de 06 §4.5 (forma, color, sin revisar y la línea del tamaño), plegable (docs/21 RV-82,
 * DEC-123): plegada es una ficha "Leyenda" de 44 px; se cierra con la X o tocando fuera.
 */
export function Leyenda() {
  const [abierta, setAbierta] = useState(abiertaAlEmpezar);
  const caja = useRef<HTMLElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);
  // Con teclado o lector de pantalla, el foco sigue al control que sustituye al pulsado.
  const enfocar = useRef(false);
  const cambiar = (a: boolean) => {
    enfocar.current = true;
    setAbierta(a);
    escribir(CLAVE_LEYENDA, a);
  };

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) {
        setAbierta(false);
        escribir(CLAVE_LEYENDA, false);
      }
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierta]);

  useEffect(() => {
    if (!enfocar.current) return;
    enfocar.current = false;
    (abierta ? cerrar : chip).current?.focus();
  }, [abierta]);

  if (!abierta) {
    return (
      <button
        type="button"
        ref={chip}
        aria-expanded={false}
        onClick={() => cambiar(true)}
        className={`text-texto rounded-tarjeta flex h-11 items-center gap-1.5 bg-[var(--control-mapa)] px-3 text-[13px] font-semibold ${SOMBRA}`}
      >
        <MarcadorSvg punto={TIPOS[0]![0]} tamano={16} />
        {T.mapa.leyenda}
      </button>
    );
  }
  return (
    <section
      ref={caja}
      aria-label={T.mapa.leyenda}
      className={`rounded-tarjeta relative bg-[var(--control-mapa)] py-1.5 pr-9 pl-2 text-[11px] leading-tight sm:text-xs ${SOMBRA}`}
    >
      {(
        [
          [T.mapa.leyendaTipo, TIPOS],
          [T.mapa.leyendaEstado, ESTADOS],
        ] as const
      ).map(([grupo, filas], i) => (
        <ul
          key={grupo}
          aria-label={grupo}
          className={`grid grid-cols-2 gap-x-2.5 gap-y-0.5 ${i > 0 ? 'border-linea mt-1 border-t pt-1' : ''}`}
        >
          {filas.map(([s, texto]) => (
            <li key={texto} className="flex items-center gap-1">
              <MarcadorSvg punto={s} tamano={18} />
              {texto}
            </li>
          ))}
        </ul>
      ))}
      <p className="text-texto-suave mt-0.5">{T.mapa.leyendaTamano}</p>
      {/* 44 px de objetivo táctil (UI-15) sobre la esquina, con el aspa pequeña dentro. */}
      <button
        type="button"
        ref={cerrar}
        aria-label={T.mapa.cerrarLeyenda}
        title={T.mapa.cerrarLeyenda}
        onClick={() => cambiar(false)}
        className="absolute -top-1.5 -right-1.5 flex size-11 items-center justify-center"
      >
        <X size={16} aria-hidden />
      </button>
    </section>
  );
}
