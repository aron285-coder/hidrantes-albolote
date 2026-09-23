import { Boton } from '../Boton';
import type { LatLng } from '@/lib/coordenadas';
import { distancia } from '@/lib/formato';
import { puedeDeshacer, resumen } from '@/lib/medicion';
import { T } from '@/lib/textos';

/**
 * Barra de la medición (FR-76, docs/18 GM-06): la distancia total y los tramos de manguera que hacen
 * falta, que se leen al cambiar (aria-live). "Borrar" queda a ≥ 12 px de "Terminar" (UI-13) y
 * "Deshacer" no se oculta: con menos de dos puntos se deshabilita y dice por qué (UI-02).
 */
export function BarraMedicion({
  vertices,
  metrosTramo,
  alDeshacer,
  alBorrar,
  alTerminar,
}: {
  vertices: LatLng[];
  metrosTramo: number;
  alDeshacer: () => void;
  alBorrar: () => void;
  alTerminar: () => void;
}) {
  const r = resumen(vertices, metrosTramo);
  const puede = puedeDeshacer(vertices);
  return (
    <section
      aria-label={T.medir.titulo}
      className="bg-fondo absolute inset-x-0 bottom-0 z-[650] flex flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(14,27,48,.22)]"
    >
      <p aria-live="polite" className="font-datos text-center text-[17px] font-semibold">
        {vertices.length < 2 ? T.medir.empezar : T.medir.resultado(distancia(r.metros), r.tramos, metrosTramo)}
      </p>
      {/* ≥ 12 px entre "Borrar" y las otras dos (UI-13). */}
      <div className="flex items-center gap-3">
        <Boton variante="secundario" disabled={!puede} onClick={alDeshacer} aria-describedby="motivo-deshacer">
          {T.medir.deshacer}
        </Boton>
        <Boton variante="destructivo" disabled={vertices.length === 0} onClick={alBorrar}>
          {T.medir.borrar}
        </Boton>
        <Boton className="ml-auto" onClick={alTerminar}>
          {T.medir.terminar}
        </Boton>
      </div>
      {!puede && (
        <p id="motivo-deshacer" className="text-texto-suave text-[13px]">
          {vertices.length === 0 ? T.medir.motivoBorrar : T.medir.motivoDeshacer}
        </p>
      )}
    </section>
  );
}
