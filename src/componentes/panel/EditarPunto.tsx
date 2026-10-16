import { Lock, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { ConfirmarDescartar, type EstadoEditar } from './descartar';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { Campo, PildorasCaudal, Segmentado, SelectorRacor } from '@/componentes/operaciones/Campos';
import { SelectorPin } from '@/componentes/operaciones/SelectorPin';
import { FotoPanel } from './FotoPanel';
import { usePosicion } from '@/hooks/estado';
import { bandaDe, nombreCaudal, nombreRacor } from '@/lib/ficha';
import { useModal } from '@/lib/foco-modal';
import { LIMITES } from '@/lib/limites';
import { distancia } from '@/lib/formato';
import { anotarError } from '@/lib/errores';
import { textoError } from '@/lib/panel/errores';
import { MARCA, marcaActual } from '@/lib/panel/historial-editar';
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
  fusionarConNuevo,
  movidoM,
  PARTES_CAMPO,
  valoresDe,
} from '@/lib/panel/inventario';
import type { Posicion } from '@/lib/posicion';
import { type Punto, estadoPuntos, sincronizar } from '@/lib/puntos';
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
  nuevo = false,
  escrito,
  children,
}: {
  campo: CampoEditado | 'tipo';
  etiqueta: string;
  cambia: boolean;
  antes?: string;
  /** Lo ha cambiado otro administrador y sale su valor, tras «Ver lo nuevo» (docs/36 RV-471). */
  nuevo?: boolean;
  /** Lo que se había puesto en este campo, si el otro también lo cambió (no se pierde sin verse). */
  escrito?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-campo={campo}
      data-cambia={cambia}
      data-nuevo={nuevo || undefined}
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
        {nuevo && (
          <span className="bg-tinte-oro border-oro-600 text-tinte-oro-texto rounded-tarjeta self-start border px-2 py-0.5 text-[13px]">
            {T.panelEditar.valorNuevo}
            {escrito !== undefined && (
              <>
                <br />
                {T.panelEditar.loQueEscribiste(escrito)}
              </>
            )}
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
  nuevos = [],
  escritos = {},
}: {
  punto: Punto;
  v: Valores;
  cambiar: (c: Partial<Valores>) => void;
  gps: Posicion | null;
  /** Los campos que ha cambiado otro administrador, tras «Ver lo nuevo» (docs/36 RV-471). */
  nuevos?: CampoEditado[];
  /** Lo que se había puesto en los campos que el otro también cambió. */
  escritos?: Partial<Record<CampoEditado, string>>;
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
      <Marcado
        campo="ubicacion"
        nuevo={nuevos.includes('ubicacion')}
        escrito={escritos.ubicacion}
        etiqueta={T.panelEditar.ubicacion}
        cambia={marcados.has('ubicacion')}
      >
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
          <p className="bg-tinte-oro border-oro-600 text-tinte-oro-texto rounded-tarjeta border px-2.5 py-2 text-sm">
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
        nuevo={nuevos.includes('diametro')}
        escrito={escritos.diametro}
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
          nuevo={nuevos.includes('enganche')}
          escrito={escritos.enganche}
          etiqueta={T.formulario.racor}
          cambia={marcados.has('enganche')}
          antes={punto.racor ? nombreRacor(punto.racor) : T.panelEditar.vacio}
        >
          <SelectorRacor valor={v.racor ?? undefined} alCambiar={(racor) => cambiar({ racor })} />
        </Marcado>
      )}

      <Marcado
        campo="estado"
        nuevo={nuevos.includes('estado')}
        escrito={escritos.estado}
        etiqueta={T.formulario.caudal}
        cambia={marcados.has('estado')}
        antes={nombreCaudal(punto.caudal)}
      >
        <PildorasCaudal valor={v.caudal} alCambiar={(caudal) => cambiar({ caudal })} etiqueta={T.formulario.caudal} />
      </Marcado>

      {v.caudal === 'no_funciona' && (
        <Marcado
          campo="fallo"
          nuevo={nuevos.includes('fallo')}
          escrito={escritos.fallo}
          etiqueta={T.formulario.descripcionFallo}
          cambia={marcados.has('fallo')}
          antes={vacio(punto.descripcion_fallo)}
        >
          <input
            value={v.fallo}
            onChange={(e) => cambiar({ fallo: e.target.value })}
            placeholder={T.operaciones.phFallo}
            aria-label={T.formulario.descripcionFallo}
            maxLength={LIMITES.descripcion_fallo}
            className={areaTexto}
          />
        </Marcado>
      )}

      <Marcado
        campo="direccion"
        nuevo={nuevos.includes('direccion')}
        escrito={escritos.direccion}
        etiqueta={T.ficha.direccion}
        cambia={marcados.has('direccion')}
        antes={vacio(punto.direccion)}
      >
        <input
          value={v.direccion}
          onChange={(e) => cambiar({ direccion: e.target.value })}
          aria-label={T.ficha.direccion}
          maxLength={LIMITES.direccion}
          className={areaTexto}
        />
        {/* La dirección no cambia sola al mover el punto: se avisa para que se revise. */}
        {movido > REVISAR_DIRECCION_DESDE_M && (
          <span className="text-texto-suave text-[13px]">{T.panelEditar.revisaDireccion(distancia(movido))}</span>
        )}
      </Marcado>

      <Marcado
        campo="descripcion"
        nuevo={nuevos.includes('descripcion')}
        escrito={escritos.descripcion}
        etiqueta={T.formulario.descripcionOpcional}
        cambia={marcados.has('descripcion')}
        antes={vacio(punto.descripcion)}
      >
        <input
          value={v.descripcion}
          onChange={(e) => cambiar({ descripcion: e.target.value })}
          placeholder={T.formulario.descripcionAyuda}
          aria-label={T.formulario.descripcionOpcional}
          maxLength={LIMITES.descripcion}
          className={areaTexto}
        />
      </Marcado>
    </>
  );
}

/** Lo que se había puesto en un campo, en palabras, para enseñarlo si el otro lo cambió (RV-471). */
function textoEscrito(campo: CampoEditado, v: Valores): string {
  const texto = (s: string) => s.trim() || T.panelEditar.vacio;
  switch (campo) {
    case 'ubicacion':
      return T.panelEditar.otraPosicion;
    case 'diametro':
      if (v.diametro === 'otro')
        return v.diametroOtro.trim() ? T.formato.mm(v.diametroOtro.trim()) : T.panelEditar.vacio;
      return v.diametro === undefined ? T.panelEditar.vacio : T.formato.mm(v.diametro);
    case 'enganche':
      return v.racor ? nombreRacor(v.racor) : T.panelEditar.vacio;
    case 'estado':
      return nombreCaudal(v.caudal);
    case 'fallo':
      return texto(v.fallo);
    case 'direccion':
      return texto(v.direccion);
    case 'descripcion':
      return texto(v.descripcion);
  }
}

type Pregunta = { para: 'cerrar' } | { para: 'salir'; destino: string } | { para: 'nuevo' };

/**
 * Editar un punto: la banda del estado guardado, el mapa, los campos y el pie fijo con el recuento y
 * Guardar.
 * - `alEstado` avisa al Inventario de los cambios sin guardar y de si está guardando, para preguntar
 *   (o no hacer nada) antes de pasar a otro punto.
 * - `enPausa`: hay otro diálogo encima (Retirar, Borrar, Historial, la pregunta de cambiar de punto).
 *   Esc, el velo y "atrás" son de ese diálogo, no de Editar.
 * - `alCerrar(id)`: el Inventario solo cierra si sigue abierto ese mismo punto.
 * - `actual`: ese punto tal como está ahora en el inventario. Si cambia por fuera (otro
 *   administrador; se nota por `actualizado_en`), sin cambios sin guardar Editar se pone al día; con
 *   cambios, avisa y "Ver lo nuevo" los descarta tras preguntar (docs/31 RV-165). Hasta entonces,
 *   "antes" y la comparación siguen siendo con el punto que se abrió.
 */
export default function EditarPunto({
  punto: abierto,
  actual,
  alCerrar,
  alEstado,
  enPausa = false,
}: {
  punto: Punto;
  actual?: Punto;
  alCerrar: (id: string) => void;
  alEstado?: (e: EstadoEditar) => void;
  enPausa?: boolean;
}) {
  // El punto con el que se compara: el que se abrió, o lo nuevo cuando se carga.
  const [punto, setPunto] = useState(abierto);
  const { avisar } = usePanel();
  const navegar = useNavigate();
  const posicion = usePosicion();
  const forma = useFormaEditar();
  const titulo = useId();
  const idResumen = useId();
  const idFalta = useId();
  const dialogo = useRef<HTMLDivElement>(null);
  // Con velo o a pantalla completa es modal y deja el resto inert; al lado de la tabla, no: la tabla
  // sigue a mano (DEC-169). Al cambiar de forma sin cerrar se activa o se desactiva (RV-128).
  useModal(dialogo, forma !== 'lateral');
  // Una marca por apertura: en StrictMode el efecto se monta dos veces y no debe apilar dos entradas.
  const [marca] = useState(() => `${punto.id}:${Math.random().toString(36).slice(2)}`);
  const [v, setV] = useState<Valores>(() => valoresDe(punto));
  const [ocupado, setOcupado] = useState(false);
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  // Al guardar, el servidor ha dicho que otro lo ha cambiado (PUNTO_CAMBIADO, docs/36 RV-471): no se
  // guarda hasta ver lo nuevo; `desaparecido` si al releer el punto ya no está. `nuevos`: los campos
  // que trajo lo nuevo, marcados; `escritos`: lo que se había puesto en los que también cambió el otro.
  const [cambiado, setCambiado] = useState<null | 'cambiado' | 'desaparecido'>(null);
  const [cargandoNuevo, setCargandoNuevo] = useState(false);
  const [nuevos, setNuevos] = useState<CampoEditado[]>([]);
  const [escritos, setEscritos] = useState<Partial<Record<CampoEditado, string>>>({});
  const idCambiado = useId();
  // Con el aviso, el foco va a «Ver lo nuevo»: Guardar, que lo tenía, queda deshabilitado.
  const botonVerNuevo = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (cambiado === 'cambiado') botonVerNuevo.current?.focus({ preventScroll: true });
  }, [cambiado]);
  const vActual = useRef(v);
  useEffect(() => {
    vActual.current = v;
  }, [v]);
  // Dónde estaba el foco al preguntar: si se sigue en Editar, vuelve ahí (o, si ya no está, al título
  // del panel, docs/33 RV-333), en vez de quedarse en <body> detrás del panel (RV-128, docs/31 RV-165).
  const focoAntes = useRef<HTMLElement | null>(null);
  const preguntar = useCallback((p: Pregunta) => {
    focoAntes.current = document.activeElement as HTMLElement | null;
    setPregunta(p);
  }, []);

  const formulario = formularioDe(v);
  const cambios = cambiosDe(punto, formulario);
  const campos = camposCambiados(cambios);
  const n = campos.length;
  const falta = faltaEnEdicion(punto, formulario);
  const cambiar = useCallback((c: Partial<Valores>) => {
    setV((x) => ({ ...x, ...c }));
    // Tocado a mano, un campo deja de ir marcado como «lo nuevo» (RV-471).
    const tocaA = (campo: CampoEditado) => PARTES_CAMPO[campo].some((k) => k in c);
    setNuevos((l) => (l.some(tocaA) ? l.filter((campo) => !tocaA(campo)) : l));
    setEscritos((e) =>
      (Object.keys(e) as CampoEditado[]).some(tocaA)
        ? Object.fromEntries(Object.entries(e).filter(([campo]) => !tocaA(campo as CampoEditado)))
        : e,
    );
  }, []);
  const olvidarMarcas = () => {
    setNuevos([]);
    setEscritos({});
  };

  // Cambiado por fuera: sin nada propio (ni guardando ni preguntando), se carga lo nuevo al momento,
  // durante el render, como recomienda React para un estado que sigue a una prop.
  const nuevo = actual && actual.actualizado_en !== punto.actualizado_en ? actual : null;
  if (nuevo && n === 0 && !ocupado && !pregunta && !cargandoNuevo) {
    setPunto(nuevo);
    setV(valoresDe(nuevo));
    olvidarMarcas();
    // Sin nada propio que guardar, el aviso de RV-471 ya no hace falta (salvo si el punto ya no está).
    if (cambiado === 'cambiado') setCambiado(null);
  }
  const cargarNuevo = () => {
    if (!nuevo) return;
    setPunto(nuevo);
    setV(valoresDe(nuevo));
    olvidarMarcas();
  };

  useEffect(() => alEstado?.({ pendientes: n, ocupado }), [n, ocupado, alEstado]);

  // Lo que leen los manejadores de teclado, historial y enlaces sin volver a suscribirse.
  const estado = useRef({ n, ocupado, enPausa, pregunta: false, montado: true });
  useEffect(() => {
    estado.current = { ...estado.current, n, ocupado, enPausa, pregunta: !!pregunta };
  }, [n, ocupado, enPausa, pregunta]);
  const cerrarRef = useRef(alCerrar);
  useEffect(() => {
    cerrarRef.current = alCerrar;
  }, [alCerrar]);
  useEffect(() => {
    estado.current.montado = true;
    return () => {
      estado.current.montado = false;
    };
  }, []);

  /** Cierra de verdad: quita la entrada de historial propia, si es la de arriba, y avisa al Inventario. */
  const cerrar = useCallback(() => {
    if (marcaActual() === marca) window.history.back();
    cerrarRef.current(punto.id);
  }, [marca, punto.id]);

  /** Mientras guarda no se cierra; con cambios sin guardar, pregunta antes. */
  const intentarCerrar = useCallback(() => {
    const e = estado.current;
    if (e.ocupado || e.enPausa || e.pregunta) return;
    if (e.n > 0) preguntar({ para: 'cerrar' });
    else cerrar();
  }, [cerrar, preguntar]);

  // El foco entra en el título del panel (docs/33 RV-333): el primer control es «Mi posición» y con el
  // teclado un Intro de más movería el pin. Al cerrar lo devuelve el Inventario al "Editar" de la fila.
  const cabecera = useRef<HTMLHeadingElement>(null);
  const alTitulo = useCallback(() => {
    cabecera.current?.focus({ preventScroll: true });
  }, []);
  useEffect(alTitulo, [alTitulo]);

  // Cerrada la pregunta sin cerrar Editar ("Seguir editando", o "Ver lo nuevo" → "Descartar"). Va en
  // un efecto: hasta que la pregunta se desmonta, Editar está inert y no aceptaría el foco.
  useEffect(() => {
    if (pregunta || !focoAntes.current) return;
    const antes = focoAntes.current;
    focoAntes.current = null;
    if (!estado.current.montado) return;
    if (antes.isConnected && dialogo.current?.contains(antes)) antes.focus({ preventScroll: true });
    else alTitulo();
  }, [pregunta, alTitulo]);

  // Esc cierra (con la pregunta si hay cambios), salvo con otro diálogo encima.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') intentarCerrar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [intentarCerrar]);

  // "Atrás" cierra Editar y no sale del Inventario: una entrada de historial propia, con el estado del
  // router para que no navegue. En el móvil es el "atrás" de Android (pantalla completa); en el
  // ordenador evita perder los cambios con el botón del navegador. Con cambios (o guardando, o con
  // otro diálogo encima) se vuelve a poner la entrada y, si toca, se pregunta. Al pasar de un punto a
  // otro, el nuevo reemplaza la entrada del anterior en vez de apilar otra.
  useEffect(() => {
    if (marcaActual() !== marca) {
      const con = { ...(window.history.state as object | null), [MARCA]: marca };
      if (marcaActual()) window.history.replaceState(con, '');
      else window.history.pushState(con, '');
    }
    const atras = () => {
      const e = estado.current;
      if (e.ocupado || e.enPausa || e.pregunta || e.n > 0) {
        window.history.pushState({ ...(window.history.state as object | null), [MARCA]: marca }, '');
        if (!e.ocupado && !e.enPausa && !e.pregunta) preguntar({ para: 'cerrar' });
        return;
      }
      cerrarRef.current(punto.id);
    };
    window.addEventListener('popstate', atras);
    return () => window.removeEventListener('popstate', atras);
  }, [marca, punto.id, preguntar]);

  /** Salir del Inventario por un enlace del panel: la entrada de Editar se reemplaza por el destino. */
  const salirA = useCallback(
    (destino: string) => {
      const arriba = marcaActual() === marca;
      cerrarRef.current(punto.id);
      navegar(destino, { replace: arriba });
    },
    [marca, punto.id, navegar],
  );

  // Salir del Inventario con cambios sin guardar pregunta: los enlaces del panel (pestañas, "Ir al
  // mapa") se paran aquí. Es un BrowserRouter, sin useBlocker. Cerrar o recargar la pestaña, con el
  // aviso del navegador.
  useEffect(() => {
    const enlace = (ev: MouseEvent) => {
      const a = (ev.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || dialogo.current?.contains(a) || ev.defaultPrevented) return;
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      ev.preventDefault();
      ev.stopPropagation();
      const e = estado.current;
      const destino = url.pathname + url.search + url.hash;
      if (e.ocupado || e.pregunta) return;
      if (e.n > 0) preguntar({ para: 'salir', destino });
      else salirA(destino);
    };
    const recargar = (ev: BeforeUnloadEvent) => {
      if (estado.current.n === 0) return;
      ev.preventDefault();
      ev.returnValue = '';
    };
    document.addEventListener('click', enlace, true);
    window.addEventListener('beforeunload', recargar);
    return () => {
      document.removeEventListener('click', enlace, true);
      window.removeEventListener('beforeunload', recargar);
    };
  }, [salirA, preguntar]);

  async function guardar() {
    setOcupado(true);
    estado.current.ocupado = true;
    try {
      // lat y lng solo si se ha movido: cambiosDe ya los deja fuera si no. Con la versión del punto
      // que se está editando: si otro lo ha cambiado, no se pisa (DEC-208).
      const r = await editarPunto(punto.id, cambios, punto.datos_cambiados_en);
      if (!r.ok && r.codigo === 'PUNTO_CAMBIADO') {
        // Cerrado mientras guardaba: el aviso del panel, para que no parezca guardado.
        if (!estado.current.montado) return avisar(textoError(r.codigo), 'error');
        setCambiado('cambiado');
        return;
      }
      if (!r.ok) return avisar(textoError(r.codigo), 'error');
      avisar(T.panelInventario.guardado(punto.codigo));
      if (!estado.current.montado) return;
      estado.current.n = 0;
      cerrar();
    } finally {
      estado.current.ocupado = false;
      if (estado.current.montado) setOcupado(false);
    }
  }

  /**
   * «Ver lo nuevo» tras PUNTO_CAMBIADO: vuelve a leer el inventario y carga el punto de ahora,
   * conservando lo escrito en lo que el otro no ha tocado (fusionarConNuevo).
   */
  async function verLoNuevo() {
    setCargandoNuevo(true);
    try {
      const leer = () => estadoPuntos().puntos.find((p) => p.id === punto.id);
      const igual = () => {
        const p = leer();
        return !!p && p.datos_cambiados_en === punto.datos_cambiados_en;
      };
      let r = await sincronizar(null);
      // Una lectura que ya estaba en marcha puede traer el punto de antes: se repite una vez.
      if (r.ok && igual()) r = await sincronizar(null);
      if (!estado.current.montado) return;
      if (!r.ok) return avisar(textoError(r.codigo), 'error');
      const ahora = leer();
      if (!ahora) {
        // Retirado o borrado: no hay nada que guardar. Lo escrito sigue a la vista hasta cerrar.
        setCambiado('desaparecido');
        return;
      }
      // Todavía no llega lo nuevo: el aviso sigue y se puede volver a probar.
      if (igual()) return avisar(T.panelEditar.aunNoSeVe, 'error');
      const { valores, tocados, pisados } = fusionarConNuevo(punto, ahora, vActual.current);
      setV(valores);
      setNuevos(tocados);
      setEscritos(Object.fromEntries(pisados.map((c) => [c, textoEscrito(c, vActual.current)])));
      setPunto(ahora);
      setCambiado(null);
      if (!tocados.length) avisar(T.panelEditar.cambioFuera);
      alTitulo();
    } catch (e) {
      anotarError(e, 'editar-ver-lo-nuevo');
      if (estado.current.montado) avisar(textoError('ERROR_INTERNO'), 'error');
    } finally {
      if (estado.current.montado) setCargandoNuevo(false);
    }
  }

  const banda = bandaDe(punto.caudal);
  const motivo = falta && falta !== T.avisosFormulario.sinCambios ? falta : null;

  return createPortal(
    <>
      {/* El velo y el panel van juntos en un solo hijo de <body>: con Editar modal, el resto queda inert
          (RV-128) y el velo tiene que seguir recibiendo el toque que cierra. La pregunta de descartar
          es otro hijo de <body>, encima. */}
      <div>
        {forma === 'velo' && (
          <div className="fixed inset-0 z-[940] bg-[rgba(14,27,48,.25)]" onClick={intentarCerrar} aria-hidden />
        )}
        <div
          ref={dialogo}
          role="dialog"
          aria-modal={forma !== 'lateral'}
          aria-labelledby={titulo}
          aria-busy={ocupado || undefined}
          data-forma={forma}
          className="bg-papel text-texto fixed inset-y-0 right-0 z-[950] flex w-full flex-col shadow-[0_6px_24px_rgba(14,27,48,.28)] md:max-[1100px]:w-[500px] min-[1100px]:w-[540px]"
        >
          {/* La banda enseña el estado guardado, no el que se está eligiendo. */}
          <div className={cn('flex min-h-14 shrink-0 items-center gap-3 px-4', banda.clase)}>
            <h2 id={titulo} ref={cabecera} tabIndex={-1} className="flex min-w-0 items-baseline gap-2 outline-none">
              <span className="font-datos text-[18px] font-semibold">{punto.codigo}</span>
              <span className="text-[13px]">{T.panelEditar.editar}</span>
            </h2>
            <span className="ml-auto text-[14px] font-semibold">{nombreCaudal(punto.caudal)}</span>
            {/* Mientras guarda, la X no cierra: el motivo es "Guardando…" en el botón de guardar. */}
            <button
              type="button"
              onClick={intentarCerrar}
              disabled={ocupado}
              aria-label={T.ficha.cerrar}
              className="-mr-2 flex size-11 items-center justify-center disabled:opacity-50"
            >
              <X size={20} aria-hidden />
            </button>
          </div>

          {/* Cambiado por fuera con cambios propios sin guardar (RV-165). Mientras guarda no sale:
              "Ver lo nuevo" no podría hacer nada. */}
          {/* Al guardar, el servidor ha dicho que otro lo ha cambiado (docs/36 RV-471): no se ha guardado
              nada y lo escrito sigue aquí. «Ver lo nuevo» lo carga sin perderlo. */}
          {cambiado && (
            <div
              role="alert"
              id={idCambiado}
              className="bg-tinte-oro border-oro-600 text-tinte-oro-texto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                {cambiado === 'cambiado' ? T.panelEditar.puntoCambiado : T.panelEditar.yaNoEsta}
              </span>
              {cambiado === 'cambiado' && (
                <Boton
                  ref={botonVerNuevo}
                  variante="secundario"
                  disabled={cargandoNuevo}
                  onClick={() => void verLoNuevo()}
                >
                  {cargandoNuevo ? T.panelEditar.cargandoNuevo : T.panelEditar.verLoNuevo}
                </Boton>
              )}
            </div>
          )}
          {nuevo && !ocupado && !cambiado && (
            <div
              role="status"
              className="bg-tinte-oro border-oro-600 text-tinte-oro-texto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">{T.panelEditar.otroAdministrador}</span>
              <Boton variante="secundario" onClick={() => preguntar({ para: 'nuevo' })}>
                {T.panelEditar.verLoNuevo}
              </Boton>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-2">
            {/* docs/39 RV-523 (DEC-222): las fotos del punto, en solo lectura; se piden al abrir Editar. */}
            <FotosDelPunto punto={punto} />
            <CamposEditar
              punto={punto}
              v={v}
              cambiar={cambiar}
              gps={posicion.tipo === 'ok' ? posicion.posicion : null}
              nuevos={nuevos}
              escritos={escritos}
            />
          </div>

          <div className="border-linea flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3">
            <ResumenCambios campos={campos} id={idResumen} />
            <div className="flex flex-col items-end gap-1 max-md:ml-auto">
              <div className="flex gap-3">
                <Boton variante="secundario" disabled={ocupado} onClick={intentarCerrar}>
                  {T.panelCola.cancelar}
                </Boton>
                {/* Tras PUNTO_CAMBIADO no se guarda hasta ver lo nuevo: el motivo es el aviso de arriba. */}
                <Boton
                  disabled={ocupado || !!falta || !!cambiado}
                  aria-describedby={cambiado ? idCambiado : motivo ? idFalta : idResumen}
                  onClick={() => void guardar()}
                >
                  {ocupado ? T.panelEditar.guardando : T.panel.guardarCambios}
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
      </div>
      {pregunta && (
        <ConfirmarDescartar
          n={n}
          alDescartar={() => {
            setPregunta(null);
            if (pregunta.para === 'nuevo') return cargarNuevo();
            estado.current.n = 0;
            if (pregunta.para === 'salir') salirA(pregunta.destino);
            else cerrar();
          }}
          alSeguir={() => setPregunta(null)}
        />
      )}
    </>,
    document.body,
  );
}

/** Alto de las fotos de Editar: 150 px a pantalla completa (móvil), 160 en el panel lateral (docs/39 RV-523). */
const ALTO_FOTO_EDITAR = 'h-[150px] md:h-[160px]';

/** La foto de la conexión y la del sitio, lado a lado; una sola, a todo el ancho (DEC-222). */
function FotosDelPunto({ punto }: { punto: Punto }) {
  const fotos: { path: string; etiqueta: string }[] = [];
  if (punto.foto_path) fotos.push({ path: punto.foto_path, etiqueta: T.formulario.conexion });
  if (punto.foto_sitio_path) fotos.push({ path: punto.foto_sitio_path, etiqueta: T.formulario.sitio });
  if (!fotos.length) return null;
  return (
    <div className={cn('grid gap-2', fotos.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
      {fotos.map((f) => (
        <FotoPanel key={f.path} path={f.path} etiqueta={f.etiqueta} alto={ALTO_FOTO_EDITAR} donde="de Editar" />
      ))}
    </div>
  );
}
