import { ChevronDown, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HojaDeCampo } from './HojaDeCampo';
import { usePuntos } from '@/hooks/estado';
import { fechaCorta, hace } from '@/lib/formato';
import { nombreCaudal, nombreTipo } from '@/lib/ficha';
import { type GrupoCaducadas, caducadasPorNucleo } from '@/lib/panel/inventario';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

/** Revisiones caducadas por núcleo (FR-121, FL-25) y la hoja de campo imprimible (FR-122). */
export default function Caducadas() {
  const { puntos } = usePuntos();
  const grupos = useMemo(() => caducadasPorNucleo(puntos), [puntos]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [hoja, setHoja] = useState<GrupoCaducadas[] | null>(null);
  const caducadas = grupos.reduce((n, g) => n + g.puntos.length, 0);

  if (!grupos.length) {
    return <p className="text-texto-suave p-6 text-center text-sm">{T.panelCaducadas.vacio}</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-linea bg-fondo flex flex-wrap items-center gap-3 border-b px-3 py-2 text-sm">
        <span>{T.panelCaducadas.resumen(caducadas)}</span>
        <button
          type="button"
          onClick={() => setHoja(grupos)}
          className="border-linea bg-papel rounded-campo flex min-h-9 items-center gap-1.5 border px-3 text-[13px] font-semibold"
        >
          <Printer size={15} aria-hidden />
          {T.panelCaducadas.hojaDeTodos}
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-auto">
        {grupos.map((g) => (
          <li key={g.nucleo} className="border-linea bg-papel border-b">
            <div className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="text-naranja-600 font-titulo w-6 text-lg font-bold">{g.puntos.length}</span>
              <div className="min-w-40 flex-1">
                <p className="font-semibold">{g.nucleo}</p>
                <p className="text-texto-suave text-[13px]">{T.panelCaducadas.dePuntos(g.total)}</p>
              </div>
              <div className="bg-linea hidden h-2 w-40 overflow-hidden rounded-full md:block" aria-hidden>
                <div className="bg-naranja-600 h-full" style={{ width: `${(g.puntos.length / g.total) * 100}%` }} />
              </div>
              <button
                type="button"
                onClick={() => setHoja([g])}
                className="border-linea rounded-campo flex min-h-9 items-center gap-1.5 border px-3 text-[13px] font-semibold"
              >
                <Printer size={15} aria-hidden />
                {T.panelCaducadas.hoja}
              </button>
              <button
                type="button"
                aria-expanded={abierto === g.nucleo}
                onClick={() => setAbierto(abierto === g.nucleo ? null : g.nucleo)}
                className="flex min-h-9 items-center gap-1 px-2 text-[13px]"
              >
                {T.panelCaducadas.verPuntos}
                <ChevronDown size={16} aria-hidden className={cn(abierto === g.nucleo && 'rotate-180')} />
              </button>
            </div>
            {abierto === g.nucleo && (
              <ul className="border-linea border-t px-3 py-2 text-[13px]">
                {g.puntos.map((p) => (
                  <li key={p.id} className="py-0.5">
                    <span className="font-datos">{p.codigo}</span>
                    <span className="text-texto-suave">
                      {' · '}
                      {nombreTipo[p.tipo]} {T.formato.mm(p.diametro_mm)} · {p.direccion ?? T.ficha.sinDireccion} ·{' '}
                      {nombreCaudal[p.caudal]} ·{' '}
                      {T.panelCaducadas.revisado(hace(p.fecha_ultima_revision), fechaCorta(p.fecha_ultima_revision))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <p className="text-texto-suave px-3 py-2 text-[13px]">{T.panelCaducadas.ayudaHoja}</p>
      {hoja && <HojaDeCampo grupos={hoja} alCerrar={() => setHoja(null)} />}
    </div>
  );
}
