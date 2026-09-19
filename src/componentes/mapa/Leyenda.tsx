import { MarcadorSvg } from './MarcadorSvg';
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

/** Leyenda fija de 06 §4.5: forma, color, sin revisar y la línea del tamaño. */
export function Leyenda() {
  return (
    <section
      aria-label={T.mapa.leyenda}
      className="bg-[var(--control-mapa)] rounded-tarjeta pointer-events-none px-2 py-1.5 text-[11px] leading-tight shadow-[0_1px_5px_rgba(0,0,0,.18)] sm:text-xs"
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
    </section>
  );
}
