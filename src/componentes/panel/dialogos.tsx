import { useMemo, useState } from 'react';
import { Dialogo } from './Dialogo';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { useCarga } from '@/hooks/carga';
import { fechaCorta, hace } from '@/lib/formato';
import { borrarPunto, historialPunto, nombreAccion, retirarPunto } from '@/lib/panel/inventario';
import { textoError } from '@/lib/panel/errores';
import { detalleLegible } from '@/lib/panel/registro-legible';
import type { Punto } from '@/lib/puntos';
import { T } from '@/lib/textos';

// Editar ya no es un diálogo: es el panel lateral de EditarPunto.tsx (docs/29 RV-124).

const campo = 'border-linea rounded-campo min-h-9 w-full border px-2';
const etiqueta = 'text-texto-suave text-[13px]';

/** Retirar o borrar: acción destructiva, con el efecto escrito y motivo obligatorio (UI-06, FR-124). */
export function DialogoMotivo({
  punto,
  accion,
  alCerrar,
  alHecho,
}: {
  punto: Punto;
  accion: 'retirar' | 'borrar';
  alCerrar: () => void;
  alHecho: () => void;
}) {
  const { avisar } = usePanel();
  const [motivo, setMotivo] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const retirar = accion === 'retirar';

  async function confirmar() {
    setIntentado(true);
    if (!motivo.trim()) return;
    setOcupado(true);
    const r = retirar ? await retirarPunto(punto.id, motivo) : await borrarPunto(punto.id, motivo);
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(retirar ? T.panelInventario.retirado(punto.codigo) : T.panelInventario.borrado(punto.codigo));
    alHecho();
    alCerrar();
  }

  return (
    <Dialogo titulo={`${punto.codigo} · ${retirar ? T.panel.retirar : T.panel.borrar}`} alCerrar={alCerrar}>
      <p className="text-sm">{retirar ? T.panelInventario.avisoRetirar : T.panelInventario.avisoBorrar}</p>
      <label className="mt-2 block text-sm">
        <span className={etiqueta}>{T.panelInventario.motivo}</span>
        <textarea className={`${campo} p-2`} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {intentado && !motivo.trim() && <p className="text-rojo-texto mt-1 text-[12px]">{T.panelInventario.sinMotivo}</p>}
      <div className="mt-3 flex gap-3">
        <Boton variante="destructivo" disabled={ocupado} onClick={() => void confirmar()}>
          {retirar ? T.panel.retirar : T.panel.borrar}
        </Boton>
        <Boton variante="secundario" onClick={alCerrar}>
          {T.panelCola.cancelar}
        </Boton>
      </div>
    </Dialogo>
  );
}

/** Historial de un punto: todo lo que le ha pasado, en solo lectura (FR-123). */
export function DialogoHistorial({ punto, alCerrar }: { punto: Punto; alCerrar: () => void }) {
  const carga = useCarga(() => historialPunto(punto.id), [punto.id]);
  const filas = useMemo(() => (Array.isArray(carga.datos) ? carga.datos : []), [carga.datos]);
  return (
    <Dialogo titulo={`${punto.codigo} · ${T.panel.historial}`} ancho="max-w-2xl" alCerrar={alCerrar}>
      {carga.estado === 'cargando' && !filas.length && (
        <p className="text-texto-suave text-sm">{T.panelCola.cargando}</p>
      )}
      {carga.estado === 'error' && !filas.length && (
        <p role="alert" className="text-sm">
          {textoError(carga.codigo)}
        </p>
      )}
      {carga.estado !== 'cargando' && !filas.length && (
        <p className="text-texto-suave text-sm">{T.panelRegistro.vacio}</p>
      )}
      {filas.length > 0 && (
        <ol className="text-sm">
          {filas.map((e) => (
            <li key={e.id} className="border-linea border-b py-1.5 last:border-b-0">
              <span className="text-texto-suave">
                {hace(e.momento)} ({fechaCorta(e.momento)}) ·{' '}
              </span>
              <strong>{nombreAccion(e.accion)}</strong>
              <span className="text-texto-suave"> · {e.actor}</span>
              {/* Qué cambió, con palabras (docs/30 RV-127). */}
              <p className="text-texto-suave mt-0.5 [overflow-wrap:anywhere]">{detalleLegible(e)}</p>
            </li>
          ))}
        </ol>
      )}
    </Dialogo>
  );
}
