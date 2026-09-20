import { useMemo, useState } from 'react';
import { Dialogo } from './Dialogo';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { useCarga } from '@/hooks/carga';
import { nombreCaudal, nombreRacor, nombreTipo } from '@/lib/ficha';
import { fechaCorta, hace } from '@/lib/formato';
import {
  type CambiosPunto,
  borrarPunto,
  cambiosDe,
  editarPunto,
  historialPunto,
  nombreAccion,
  retirarPunto,
} from '@/lib/panel/inventario';
import { textoError } from '@/lib/panel/errores';
import type { Caudal, Punto, Racor, TipoPunto } from '@/lib/puntos';
import { T } from '@/lib/textos';

const CAUDALES: Caudal[] = ['bueno', 'regular', 'malo', 'no_funciona'];
const RACORES: Racor[] = ['granada', 'barcelona', 'otro'];

const campo = 'border-linea rounded-campo min-h-9 w-full border px-2';
const etiqueta = 'text-texto-suave text-[13px]';

/** Editar un punto desde el inventario: se aplica al momento y consta como acción de jefatura (FR-151). */
export function DialogoEditar({
  punto,
  alCerrar,
  alHecho,
}: {
  punto: Punto;
  alCerrar: () => void;
  alHecho: () => void;
}) {
  const { avisar } = usePanel();
  const [v, setV] = useState<CambiosPunto>({
    tipo: punto.tipo,
    diametro_mm: punto.diametro_mm,
    caudal: punto.caudal,
    racor: punto.racor,
    descripcion_fallo: punto.descripcion_fallo ?? '',
    descripcion: punto.descripcion ?? '',
    direccion: punto.direccion ?? '',
  });
  const [ocupado, setOcupado] = useState(false);
  const cambios = cambiosDe(punto, v);
  const tipo = v.tipo ?? punto.tipo;
  const falta =
    tipo === 'boca_riego' && !v.racor
      ? T.avisosFormulario.eligeRacor
      : v.caudal === 'no_funciona' && !v.descripcion_fallo?.trim()
        ? T.avisosFormulario.describeFallo
        : !Object.keys(cambios).length
          ? T.avisosFormulario.sinCambios
          : null;

  async function guardar() {
    setOcupado(true);
    const r = await editarPunto(punto.id, cambios);
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelInventario.guardado(punto.codigo));
    alHecho();
    alCerrar();
  }

  return (
    <Dialogo titulo={`${punto.codigo} · ${T.panel.editar}`} alCerrar={alCerrar}>
      <div className="grid gap-2 text-sm">
        <label>
          <span className={etiqueta}>{T.panelCola.campoTipo}</span>
          <select
            className={campo}
            value={tipo}
            onChange={(e) => {
              const t = e.target.value as TipoPunto;
              setV((x) => ({
                ...x,
                tipo: t,
                diametro_mm: t === 'boca_riego' ? 45 : x.diametro_mm === 45 ? 70 : x.diametro_mm,
                racor: t === 'boca_riego' ? (x.racor ?? 'granada') : null,
              }));
            }}
          >
            <option value="hidrante">{nombreTipo.hidrante}</option>
            <option value="boca_riego">{nombreTipo.boca_riego}</option>
          </select>
        </label>
        {tipo === 'hidrante' ? (
          <label>
            <span className={etiqueta}>{T.panelCola.campoDiametro}</span>
            <select
              className={campo}
              value={v.diametro_mm}
              onChange={(e) => setV((x) => ({ ...x, diametro_mm: Number(e.target.value) }))}
            >
              <option value="70">{T.formulario.d70}</option>
              <option value="100">{T.formulario.d100}</option>
            </select>
          </label>
        ) : (
          <label>
            <span className={etiqueta}>{T.panelCola.campoRacor}</span>
            <select
              className={campo}
              value={v.racor ?? ''}
              onChange={(e) => setV((x) => ({ ...x, racor: (e.target.value || null) as Racor | null }))}
            >
              {RACORES.map((r) => (
                <option key={r} value={r}>
                  {nombreRacor(r)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className={etiqueta}>{T.panelCola.campoEstado}</span>
          <select
            className={campo}
            value={v.caudal}
            onChange={(e) => setV((x) => ({ ...x, caudal: e.target.value as Caudal }))}
          >
            {CAUDALES.map((c) => (
              <option key={c} value={c}>
                {nombreCaudal[c]}
              </option>
            ))}
          </select>
        </label>
        {v.caudal === 'no_funciona' && (
          <label>
            <span className={etiqueta}>{T.panelCola.campoFallo}</span>
            <input
              className={campo}
              value={v.descripcion_fallo ?? ''}
              onChange={(e) => setV((x) => ({ ...x, descripcion_fallo: e.target.value }))}
            />
          </label>
        )}
        <label>
          <span className={etiqueta}>{T.ficha.direccion}</span>
          <input
            className={campo}
            value={v.direccion ?? ''}
            onChange={(e) => setV((x) => ({ ...x, direccion: e.target.value }))}
          />
        </label>
        <label>
          <span className={etiqueta}>{T.panelCola.campoDescripcion}</span>
          <input
            className={campo}
            value={v.descripcion ?? ''}
            onChange={(e) => setV((x) => ({ ...x, descripcion: e.target.value }))}
          />
        </label>
        <div className="mt-1 flex flex-wrap items-start gap-3">
          <div>
            <Boton disabled={ocupado || !!falta} onClick={() => void guardar()}>
              {T.panel.guardarCambios}
            </Boton>
            {falta && <p className="text-texto-suave mt-1 max-w-56 text-[11px]">{falta}</p>}
          </div>
          <Boton variante="secundario" onClick={alCerrar}>
            {T.panelCola.cancelar}
          </Boton>
        </div>
      </div>
    </Dialogo>
  );
}

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
      {intentado && !motivo.trim() && <p className="text-rojo-700 mt-1 text-[12px]">{T.panelInventario.sinMotivo}</p>}
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
            </li>
          ))}
        </ol>
      )}
    </Dialogo>
  );
}
