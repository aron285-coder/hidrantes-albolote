import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Boton } from '@/componentes/Boton';
import { nombreCaudal, nombreRacor, nombreTipo } from '@/lib/ficha';
import { fechaCorta } from '@/lib/formato';
import type { GrupoCaducadas } from '@/lib/panel/inventario';
import { T } from '@/lib/textos';

/**
 * Hoja de campo imprimible (FR-122, FL-25): una página por núcleo con código, dirección o
 * coordenadas, tipo, diámetro, último estado y una casilla en blanco para anotar la revisión.
 * Al imprimir, el CSS de index.css deja solo esta hoja.
 */
export function HojaDeCampo({ grupos, alCerrar }: { grupos: GrupoCaducadas[]; alCerrar: () => void }) {
  useEffect(() => {
    document.body.classList.add('imprimiendo');
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', tecla);
    return () => {
      document.body.classList.remove('imprimiendo');
      window.removeEventListener('keydown', tecla);
    };
  }, [alCerrar]);

  const hoy = fechaCorta(new Date());

  return createPortal(
    <div className="hoja-campo fixed inset-0 z-[1100] overflow-auto bg-white p-6 text-black print:static print:p-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex gap-3 print:hidden">
          <Boton onClick={() => window.print()}>{T.panelCaducadas.imprimir}</Boton>
          <Boton variante="secundario" onClick={alCerrar}>
            {T.panelCaducadas.cerrarHoja}
          </Boton>
        </div>
        {grupos.map((g) => (
          <section key={g.nucleo} className="mb-8 break-after-page last:break-after-auto">
            <h2 className="font-titulo text-xl font-bold">{T.panelCaducadas.tituloHoja(g.nucleo)}</h2>
            <p className="mb-2 text-[13px]">{T.panelCaducadas.subtituloHoja(g.puntos.length, hoy)}</p>
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  {[
                    T.panelInventario.colCodigo,
                    T.panelCaducadas.colSitio,
                    T.panelInventario.colTipo,
                    T.panelInventario.colDiametro,
                    T.panelCaducadas.colUltimoEstado,
                    T.panelCaducadas.colAnotar,
                  ].map((c) => (
                    <th key={c} className="border border-black px-1.5 py-1 text-left">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.puntos.map((p) => (
                  <tr key={p.id}>
                    <td className="border border-black px-1.5 py-1 whitespace-nowrap">{p.codigo}</td>
                    <td className="border border-black px-1.5 py-1">
                      {p.direccion ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}
                    </td>
                    <td className="border border-black px-1.5 py-1">
                      {nombreTipo[p.tipo]}
                      {p.racor ? ` · ${nombreRacor(p.racor)}` : ''}
                    </td>
                    <td className="border border-black px-1.5 py-1 whitespace-nowrap">{T.formato.mm(p.diametro_mm)}</td>
                    <td className="border border-black px-1.5 py-1 whitespace-nowrap">
                      {nombreCaudal[p.caudal]} · {fechaCorta(p.fecha_ultima_revision)}
                    </td>
                    <td className="h-8 w-40 border border-black px-1.5 py-1" />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
