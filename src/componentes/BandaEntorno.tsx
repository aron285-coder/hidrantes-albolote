import { T } from '@/lib/textos';

/** Banda naranja permanente en staging y local (04 §4). En producción no se monta. */
export function BandaEntorno() {
  return (
    <div
      role="status"
      className="bg-naranja-600 font-titulo text-papel py-0.5 text-center text-[13px] font-semibold tracking-[0.12em]"
    >
      {T.app.entornoPruebas}
    </div>
  );
}
