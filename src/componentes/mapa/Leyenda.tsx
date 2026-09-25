import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MarcadorSvg } from './MarcadorSvg';
import { escribir, leer } from '@/lib/almacen';
import type { Simbolo } from '@/lib/simbologia';
import { T } from '@/lib/textos';

const FILAS: [Simbolo, string][] = [
  [{ tipo: 'hidrante', caudal: 'bueno', radio_px: 7, revision_caducada: false }, T.formulario.hidrante],
  [{ tipo: 'boca_riego', caudal: 'bueno', radio_px: 5.5, revision_caducada: false }, T.formulario.bocaRiego],
  [{ tipo: 'hidrante', caudal: 'regular', radio_px: 6, revision_caducada: false }, T.formulario.regular],
  [{ tipo: 'hidrante', caudal: 'malo', radio_px: 6, revision_caducada: false }, T.formulario.malo],
  [{ tipo: 'hidrante', caudal: 'no_funciona', radio_px: 6, revision_caducada: false }, T.formulario.noFunciona],
  [{ tipo: 'hidrante', caudal: 'bueno', radio_px: 6, revision_caducada: true }, T.mapa.sinRevisar],
];

/** Si la leyenda está desplegada; `null` es que nunca se ha visto (primer uso). */
export const CLAVE_LEYENDA = 'leyenda_abierta';

/** Primer uso: desplegada esta vez, y plegada las siguientes salvo que el voluntario la abra (RV-82). */
function abiertaAlEmpezar(): boolean {
  const guardada = leer<boolean>(CLAVE_LEYENDA);
  if (guardada !== null) return guardada;
  escribir(CLAVE_LEYENDA, false);
  return true;
}

const SOMBRA = 'shadow-[0_1px_5px_rgba(0,0,0,.18)]';

/**
 * Leyenda de 06 §4.5 (forma, color, sin revisar y la línea del tamaño), plegable (docs/21 RV-82,
 * DEC-123): plegada es una ficha "Leyenda" de 44 px; se cierra con la X o tocando fuera.
 */
export function Leyenda() {
  const [abierta, setAbierta] = useState(abiertaAlEmpezar);
  const caja = useRef<HTMLElement>(null);
  const cambiar = (a: boolean) => {
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

  if (!abierta) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => cambiar(true)}
        className={`text-texto rounded-tarjeta flex h-11 items-center gap-1.5 bg-[var(--control-mapa)] px-3 text-[13px] font-semibold ${SOMBRA}`}
      >
        <MarcadorSvg punto={FILAS[0]![0]} tamano={16} />
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
      <ul className="grid grid-cols-2 gap-x-2.5 gap-y-0.5">
        {FILAS.map(([s, texto]) => (
          <li key={texto} className="flex items-center gap-1">
            <MarcadorSvg punto={s} tamano={18} />
            {texto}
          </li>
        ))}
      </ul>
      <p className="text-texto-suave mt-0.5">{T.mapa.leyendaTamano}</p>
      {/* 44 px de objetivo táctil (UI-15) sobre la esquina, con el aspa pequeña dentro. */}
      <button
        type="button"
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
