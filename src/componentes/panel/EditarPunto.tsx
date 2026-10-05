import { Lock, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { Campo, PildorasCaudal, Segmentado, SelectorRacor } from '@/componentes/operaciones/Campos';
import { SelectorPin } from '@/componentes/operaciones/SelectorPin';
import { usePosicion } from '@/hooks/estado';
import { bandaDe, nombreCaudal, nombreRacor } from '@/lib/ficha';
import { distancia } from '@/lib/formato';
import { textoError } from '@/lib/panel/errores';
import {
  type CampoEditado,
  MOVIDO_DESDE_M,
  REVISAR_DIRECCION_DESDE_M,
  cambiosDe,
  camposCambiados,
  editarPunto,
  type Valores,
  faltaEnEdicion,
  formularioDe,
  movidoM,
  valoresDe,
} from '@/lib/panel/inventario';
import type { Posicion } from '@/lib/posicion';
import type { Punto } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';
import { dentroDeZona } from '@/lib/zona';

// Editar un punto desde el Inventario (FR-120, FR-151; docs/29 RV-124, DEC-169): un panel lateral
// con el mapa y los mismos controles que el alta, con lo que cambia marcado como en la cola (06 §5).
// Se aplica al momento y consta en el Registro como edición directa.

/** Cómo se abre: ≥ 1100 px al lado de la tabla y sin velo; 768–1099 px con velo; < 768 px a pantalla completa. */
export type Forma = 'lateral' | 'velo' | 'completa';

const LATERAL = '(min-width: 1100px)';
const VELO = '(min-width: 768px)';

function formaActual(): Forma {
  if (window.matchMedia(LATERAL).matches) return 'lateral';
  return window.matchMedia(VELO).matches ? 'velo' : 'completa';
}

function suscribirForma(aviso: () => void) {
  const q = [window.matchMedia(LATERAL), window.matchMedia(VELO)];
  q.forEach((m) => m.addEventListener('change', aviso));
  return () => q.forEach((m) => m.removeEventListener('change', aviso));
}

const useFormaEditar = () => useSyncExternalStore(suscribirForma, formaActual, () => 'lateral' as Forma);

const NOMBRE_CAMPO: Record<CampoEditado, string> = {
  ubicacion: T.panelEditar.campoUbicacion,
  diametro: T.panelEditar.campoDiametro,
  enganche: T.panelEditar.campoEnganche,
  estado: T.panelEditar.campoEstado,
  fallo: T.panelEditar.campoFallo,
  direccion: T.panelEditar.campoDireccion,
  descripcion: T.panelEditar.campoDescripcion,
};

/** El pie: "2 cambios · ubicación, enganche" (el recuento en naranja), o "No has cambiado nada". */
export function ResumenCambios({ campos, id }: { campos: CampoEditado[]; id?: string }) {
  return (
    <p id={id} className="text-texto-suave min-w-0 flex-1 text-[13px] max-md:basis-full">
      {campos.length ? (
        <>
          <b className="text-naranja-texto font-bold">{T.panelCola.cambios(campos.length)}</b>
          {T.panelEditar.resumen('', campos.map((c) => NOMBRE_CAMPO[c]).join(', '))}
        </>
      ) : (
        T.avisosFormulario.sinCambios
      )}
    </p>
  );
}

/**
 * Un campo de Editar: el `Campo` del alta y, si cambia, fondo cálido, banda naranja de 4 px, "· cambia"
 * en la etiqueta y debajo "antes: …" tachado (06 §5, "Panel: detalle de la cola").
 */
function Marcado({
  campo,
  etiqueta,
  cambia,
  antes,
  children,
}: {
  campo: CampoEditado | 'tipo';
  etiqueta: string;
  cambia: boolean;
  antes?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-campo={campo}
      data-cambia={cambia}
      className={cn(
        '-mx-4 px-4 py-2',
        cambia && 'bg-[color-mix(in_srgb,#FFB000_8%,var(--papel))] shadow-[inset_4px_0_0_var(--naranja-600)]',
      )}
    >
      <Campo etiqueta={cambia ? T.panelEditar.conCambio(etiqueta) : etiqueta}>
        {children}
        {cambia && antes !== undefined && (
          <span className="text-texto-suave text-[13px]">
            {T.panelEditar.antes} <del className="text-rojo-texto">{antes}</del>
          </span>
        )}
      </Campo>
    </div>
  );
}

const areaTexto = 'border-linea bg-papel text-texto rounded-campo min-h-11 w-full border px-3 text-[15px]';

/** De la ubicación a la descripción: los controles del alta con lo que cambia marcado. */
export function CamposEditar({
  punto,
  v,
  cambiar,
  gps,
}: {
  punto: Punto;
  v: Valores;
  cambiar: (c: Partial<Valores>) => void;
  gps: Posicion | null;
}) {
  const marcados = new Set(camposCambiados(cambiosDe(punto, formularioDe(v))));
  const movido = movidoM(punto, formularioDe(v));
  const boca = punto.tipo === 'boca_riego';
  const vacio = (s: string | null) => s?.trim() || T.panelEditar.vacio;
  const opcionesDiametro: [number | 'otro', string][] = boca
    ? [
        [45, T.formulario.d45],
        [70, T.formulario.d70],
        ['otro', T.formulario.otraMedida],
      ]
    : [
        [70, T.formulario.d70],
        [100, T.formulario.d100],
      ];

  return (
    <>
      <Marcado campo="ubicacion" etiqueta={T.panelEditar.ubicacion} cambia={marcados.has('ubicacion')}>
        <SelectorPin
          pin={v.pin}
          gps={gps}
          original={{ lat: punto.lat, lng: punto.lng }}
          alMover={(pin) => cambiar({ pin })}
          // Como en el alta: "Mi posición" lleva el pin a donde estás (jefatura en la calle).
          alUsarMiPosicion={() => gps && cambiar({ pin: { lat: gps.lat, lng: gps.lng } })}
          etiqueta={T.panelEditar.ubicacion}
          alto="h-[200px] md:h-[230px]"
          rotuloOriginal={movido >= MOVIDO_DESDE_M ? T.panelEditar.antesMetros(distancia(movido)) : undefined}
        />
        <p className="text-texto-suave text-center text-[13px]">{T.avisosFormulario.ajustaPin}</p>
        {!dentroDeZona(v.pin.lat, v.pin.lng) && (
          <p className="bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta border px-2.5 py-2 text-sm">
            {T.panelEditar.fueraDeZona}
          </p>
        )}
      </Marcado>

      {/* El tipo no se cambia (FR-11, DEC-090): el Segmentado del alta, bloqueado, con un candado en el
          guardado y el otro apagado. */}
      <Marcado campo="tipo" etiqueta={T.formulario.tipoElemento} cambia={false}>
        <fieldset disabled className="relative [&_[aria-checked=false]]:opacity-45">
          <Segmentado
            opciones={[
              ['hidrante', T.formulario.hidrante],
              ['boca_riego', T.formulario.bocaRiego],
            ]}
            valor={punto.tipo}
            alCambiar={() => undefined}
            etiqueta={T.formulario.tipoElemento}
          />
          <Lock
            size={15}
            aria-hidden
            className={cn(
              'text-fondo pointer-events-none absolute top-1/2 -translate-y-1/2',
              boca ? 'left-[calc(50%+12px)]' : 'left-3',
            )}
          />
        </fieldset>
        <p className="text-texto-suave text-[13px]">{T.panelErrores.tipoNoModificable}</p>
      </Marcado>

      <Marcado
        campo="diametro"
        etiqueta={T.formulario.diametro}
        cambia={marcados.has('diametro')}
        antes={T.formato.mm(punto.diametro_mm)}
      >
        <Segmentado
          opciones={opcionesDiametro}
          valor={v.diametro}
          alCambiar={(d) => cambiar({ diametro: d })}
          etiqueta={T.formulario.diametro}
        />
        {v.diametro === 'otro' && (
          <input
            value={v.diametroOtro}
            onChange={(e) => cambiar({ diametroOtro: e.target.value })}
            inputMode="numeric"
            placeholder={T.operaciones.phOtraMedidaBoca}
            aria-label={T.formulario.otraMedida}
            className={cn(areaTexto, 'mt-1')}
          />
        )}
      </Marcado>

      {boca && (
        <Marcado
          campo="enganche"
          etiqueta={T.formulario.racor}
          cambia={marcados.has('enganche')}
          antes={punto.racor ? nombreRacor(punto.racor) : T.panelEditar.vacio}
        >
          <SelectorRacor valor={v.racor ?? undefined} alCambiar={(racor) => cambiar({ racor })} />
        </Marcado>
      )}

      <Marcado
        campo="estado"
        etiqueta={T.formulario.caudal}
        cambia={marcados.has('estado')}
        antes={nombreCaudal(punto.caudal)}
      >
        <PildorasCaudal valor={v.caudal} alCambiar={(caudal) => cambiar({ caudal })} etiqueta={T.formulario.caudal} />
      </Marcado>

      {v.caudal === 'no_funciona' && (
        <Marcado
          campo="fallo"
          etiqueta={T.formulario.descripcionFallo}
          cambia={marcados.has('fallo')}
          antes={vacio(punto.descripcion_fallo)}
        >
          <input
            value={v.fallo}
            onChange={(e) => cambiar({ fallo: e.target.value })}
            placeholder={T.operaciones.phFallo}
            aria-label={T.formulario.descripcionFallo}
            maxLength={500}
            className={areaTexto}
          />
        </Marcado>
      )}

      <Marcado
        campo="direccion"
        etiqueta={T.ficha.direccion}
        cambia={marcados.has('direccion')}
        antes={vacio(punto.direccion)}
      >
        <input
          value={v.direccion}
          onChange={(e) => cambiar({ direccion: e.target.value })}
          aria-label={T.ficha.direccion}
          className={areaTexto}
        />
        {/* La dirección no cambia sola al mover el punto: se avisa para que se revise. */}
        {movido > REVISAR_DIRECCION_DESDE_M && (
          <span className="text-texto-suave text-[13px]">{T.panelEditar.revisaDireccion(distancia(movido))}</span>
        )}
      </Marcado>

      <Marcado
        campo="descripcion"
        etiqueta={T.formulario.descripcionOpcional}
        cambia={marcados.has('descripcion')}
        antes={vacio(punto.descripcion)}
      >
        <input
          value={v.descripcion}
          onChange={(e) => cambiar({ descripcion: e.target.value })}
          placeholder={T.formulario.descripcionAyuda}
          aria-label={T.formulario.descripcionOpcional}
          maxLength={500}
          className={areaTexto}
        />
      </Marcado>
    </>
  );
}

/** "¿Descartar N cambios?" antes de cerrar Editar o de pasar a otro punto con cambios sin guardar. */
export function ConfirmarDescartar({
  n,
  alDescartar,
  alSeguir,
}: {
  n: number;
  alDescartar: () => void;
  alSeguir: () => void;
}) {
  const titulo = useId();
  const seguir = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    seguir.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      alSeguir();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [alSeguir]);
  return createPortal(
    <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(14,27,48,.38)]" onClick={alSeguir} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titulo}
        className="bg-papel rounded-tarjeta relative w-full max-w-sm p-4 shadow-[0_6px_24px_rgba(14,27,48,.28)]"
      >
        <h2 id={titulo} className="font-titulo mb-4 text-[17px] font-semibold">
          {T.panelEditar.descartarN(n)}
        </h2>
        <div className="flex flex-wrap justify-end gap-3">
          <Boton variante="secundario" onClick={alDescartar}>
            {T.panelEditar.descartar}
          </Boton>
          {/* Seguir editando es lo seguro: recibe el foco y es lo que hace Esc. */}
          <button
            ref={seguir}
            type="button"
            onClick={alSeguir}
            className="rounded-boton bg-naranja-600 min-h-11 min-w-11 px-4 text-[15px] font-semibold text-white"
          >
            {T.panelEditar.seguirEditando}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Editar un punto: la banda del estado guardado, el mapa, los campos y el pie fijo con el recuento y
 * Guardar. `alPendientes` avisa al Inventario de cuántos cambios hay sin guardar, para preguntar
 * antes de pasar a otro punto.
 */
export function EditarPunto({
  punto,
  alCerrar,
  alPendientes,
}: {
  punto: Punto;
  alCerrar: () => void;
  alPendientes?: (n: number) => void;
}) {
  const { avisar } = usePanel();
  const posicion = usePosicion();
  const forma = useFormaEditar();
  const titulo = useId();
  const idResumen = useId();
  const idFalta = useId();
  const cuerpo = useRef<HTMLDivElement>(null);
  const [v, setV] = useState<Valores>(() => valoresDe(punto));
  const [ocupado, setOcupado] = useState(false);
  const [preguntar, setPreguntar] = useState(false);

  const formulario = formularioDe(v);
  const cambios = cambiosDe(punto, formulario);
  const campos = camposCambiados(cambios);
  const n = campos.length;
  const falta = faltaEnEdicion(punto, formulario);
  const cambiar = useCallback((c: Partial<Valores>) => setV((x) => ({ ...x, ...c })), []);

  useEffect(() => alPendientes?.(n), [n, alPendientes]);

  const nRef = useRef(n);
  useEffect(() => {
    nRef.current = n;
  }, [n]);

  // Cerrar con cambios sin guardar pregunta antes.
  const intentarCerrar = useCallback(() => {
    if (nRef.current > 0) setPreguntar(true);
    else alCerrar();
  }, [alCerrar]);

  // El foco entra en el primer control; al cerrar lo devuelve el Inventario al "Editar" de la fila.
  useEffect(() => {
    cuerpo.current?.querySelector<HTMLElement>('button:not(:disabled), input, select, textarea')?.focus({
      preventScroll: true,
    });
  }, []);

  // Esc y la X cierran (con la pregunta si hay cambios). La pregunta abierta se queda Esc para sí.
  useEffect(() => {
    if (preguntar) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') intentarCerrar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [intentarCerrar, preguntar]);

  const cerrarRef = useRef(alCerrar);
  useEffect(() => {
    cerrarRef.current = alCerrar;
  }, [alCerrar]);

  // A pantalla completa, el "atrás" de Android cierra Editar y no sale del panel: una entrada de
  // historial propia, con el mismo estado del router para que no navegue. Con cambios, pregunta y
  // vuelve a poner la entrada. Al cerrar por la X, Cancelar o Guardar, se quita la entrada para que
  // "atrás" no la repita.
  useEffect(() => {
    if (forma !== 'completa') return;
    const marca = { ...(window.history.state as object | null), editarPunto: punto.id };
    window.history.pushState(marca, '');
    let activa = true;
    const atras = () => {
      if (!activa) return;
      if (nRef.current > 0) {
        window.history.pushState(marca, '');
        setPreguntar(true);
      } else {
        activa = false;
        cerrarRef.current();
      }
    };
    window.addEventListener('popstate', atras);
    return () => {
      window.removeEventListener('popstate', atras);
      if (activa && (window.history.state as { editarPunto?: string } | null)?.editarPunto === punto.id) {
        window.history.back();
      }
    };
  }, [forma, punto.id]);

  async function guardar() {
    setOcupado(true);
    try {
      // lat y lng solo si se ha movido: cambiosDe ya los deja fuera si no.
      const r = await editarPunto(punto.id, cambios);
      if (!r.ok) return avisar(textoError(r.codigo), 'error');
      avisar(T.panelInventario.guardado(punto.codigo));
      nRef.current = 0;
      alCerrar();
    } finally {
      setOcupado(false);
    }
  }

  const banda = bandaDe(punto.caudal);
  const motivo = falta && falta !== T.avisosFormulario.sinCambios ? falta : null;

  return createPortal(
    <>
      {forma === 'velo' && (
        <div className="fixed inset-0 z-[940] bg-[rgba(14,27,48,.25)]" onClick={intentarCerrar} aria-hidden />
      )}
      <div
        role="dialog"
        aria-modal={forma !== 'lateral'}
        aria-labelledby={titulo}
        data-forma={forma}
        className="bg-papel text-texto fixed inset-y-0 right-0 z-[950] flex w-full flex-col shadow-[0_6px_24px_rgba(14,27,48,.28)] md:max-[1099px]:w-[500px] min-[1100px]:w-[540px]"
      >
        {/* La banda enseña el estado guardado, no el que se está eligiendo. */}
        <div className={cn('flex min-h-14 shrink-0 items-center gap-3 px-4', banda.clase)}>
          <h2 id={titulo} className="flex min-w-0 items-baseline gap-2">
            <span className="font-datos text-[18px] font-semibold">{punto.codigo}</span>
            <span className="text-[13px]">{T.panelEditar.editar}</span>
          </h2>
          <span className="ml-auto text-[14px] font-semibold">{nombreCaudal(punto.caudal)}</span>
          <button
            type="button"
            onClick={intentarCerrar}
            aria-label={T.ficha.cerrar}
            className="-mr-2 flex size-11 items-center justify-center"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <div ref={cuerpo} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-2">
          <CamposEditar punto={punto} v={v} cambiar={cambiar} gps={posicion.tipo === 'ok' ? posicion.posicion : null} />
        </div>

        <div className="border-linea flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3">
          <ResumenCambios campos={campos} id={idResumen} />
          <div className="flex flex-col items-end gap-1 max-md:ml-auto">
            <div className="flex gap-3">
              <Boton variante="secundario" onClick={intentarCerrar}>
                {T.panelCola.cancelar}
              </Boton>
              <Boton
                disabled={ocupado || !!falta}
                aria-describedby={motivo ? idFalta : idResumen}
                onClick={() => void guardar()}
              >
                {T.panel.guardarCambios}
              </Boton>
            </div>
            {motivo && (
              <p id={idFalta} className="text-texto-suave text-[11px]">
                {motivo}
              </p>
            )}
          </div>
        </div>
      </div>
      {preguntar && (
        <ConfirmarDescartar
          n={n}
          alDescartar={() => {
            setPreguntar(false);
            nRef.current = 0;
            alCerrar();
          }}
          alSeguir={() => setPreguntar(false)}
        />
      )}
    </>,
    document.body,
  );
}
