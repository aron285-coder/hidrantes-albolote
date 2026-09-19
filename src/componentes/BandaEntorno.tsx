import { T } from '@/lib/textos';

/** Banda naranja permanente en staging y local (04 §4). En producción no se monta. */
export function BandaEntorno() {
  return (
    <div
      role="status"
      className="bg-naranja-600 font-titulo py-0.5 text-white text-center text-[13px] font-semibold tracking-[0.12em]"
    >
      {T.app.entornoPruebas}
    </div>
  );
}
