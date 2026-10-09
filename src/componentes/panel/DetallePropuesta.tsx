import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePanel } from './usar-panel';
import { MinimapaPropuesta } from './MinimapaPropuesta';
import { Boton } from '@/componentes/Boton';
import { distancia, fechaCorta, hace } from '@/lib/formato';
import { esCaudalConocido } from '@/lib/caudal';
import { anotarError } from '@/lib/errores';
import { claseChip, nombreCaudal, nombreRacor, nombreTipo, urlFoto } from '@/lib/ficha';
import { ETIQUETA_OPERACION } from '@/lib/nombres-operacion';
import {
  type CampoFicha,
  type FotoDetalle,
  type CampoFusion,
  type PropuestaPanel,
  type Prevalece,
  type ValoresPunto,
  aprobar,
  autor,
  conDireccion,
  conUbicacion,
  correccionesDe,
  deducirDireccion,
  diferenciasFusion,
  etiquetaCampo,
  faltaEnCorrecciones,
  fichaCompleta,
  fotosDe,
  fusionar,
  planMapa,
  rechazar,
  valoresPropuestos,
  ponerAlDia,
  cambiosDecision,
  recortarOpcion,
  MAXIMO_OPCION,
  bloqueoPorMedida,
} from '@/lib/panel/cola';
import { LIMITES } from '@/lib/limites';
import { ORDEN_RACORES } from '@/lib/racores';
import { textoError } from '@/lib/panel/errores';
import type { Caudal, Punto, Racor, TipoPunto } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

type Modo = null | 'corregir' | 'rechazar' | 'fusionar';

/**
 * Detalle de una propuesta (FR-102–FR-109, FL-21; docs/25 RV-110, DEC-158), igual en las seis
 * operaciones y a todo el ancho: el título, el mapa, todos los datos del punto con lo que
 * cambia primero y marcado, las fotos y, fijos abajo, los botones. El historial usa el mismo detalle
 * en solo lectura. Con `alVolver` (tableta y móvil) ocupa la pantalla entera, con "‹" para volver.
 */
export function DetallePropuesta({
  p,
  puntos,
  radioDuplicado,
  alHecho,
  alRecargar,
  alVolver,
}: {
  p: PropuestaPanel;
  puntos: Punto[];
  radioDuplicado: number | null;
  /** La acción ha terminado de verdad (aprobada, rechazada, fusionada): en el móvil, vuelve a la cola. */
  alHecho: () => void;
  /** Un error que pide ver el estado real (otra persona, el punto cambió): se recarga sin cerrar nada. */
  alRecargar: () => Promise<boolean>;
  alVolver?: () => void;
}) {
  const { avisar } = usePanel();
  const punto = useMemo(() => puntos.find((x) => x.id === p.punto_id), [puntos, p.punto_id]);
  const duplicado = useMemo(() => puntos.find((x) => x.id === p.duplicado_de), [puntos, p.duplicado_de]);
  const plan = useMemo(() => planMapa(p, punto), [p, punto]);
  const ficha = useMemo(() => fichaCompleta(p, punto), [p, punto]);
  const [modo, setModo] = useState<Modo>(null);
  const [ocupado, setOcupado] = useState(false);
  // El servidor ha dicho PROPUESTA_DESACTUALIZADA: lo siguiente es "Confirmar y aprobar" con
  // confirmación expresa (FR-108, docs/32 RV-251), cuando haya llegado el punto de hoy.
  const [puntoCambiado, setPuntoCambiado] = useState(false);
  // La recarga que sigue a un error al decidir: mientras no llega, no se aprueba.
  const [recarga, setRecarga] = useState<'lista' | 'cargando' | 'error'>('lista');
  const desactualizada = p.desactualizada || puntoCambiado;
  // La dirección que se enseña al abrir: la sugerida (o la deducida, que llega después) y, si no la hay,
  // la del punto. Es con lo que se compara al aprobar: lo que no se toca no es una corrección (RV-162).
  const [ensenada, setEnsenada] = useState(
    () => p.direccion_sugerida ?? (p.operacion === 'alta' ? null : p.direccion_actual) ?? '',
  );
  const [direccion, setDireccion] = useState(ensenada);
  const tocada = useRef(false);
  const escribirDireccion = (v: string) => {
    tocada.current = true;
    setDireccion(v);
  };
  const formulario = useRef<HTMLDivElement>(null);
  const volver = useRef<HTMLButtonElement>(null);
  const pendiente = p.estado === 'pendiente';
  const editable = pendiente && conUbicacion(p);
  const pantalla = !!alVolver;

  // Dirección deducida (FR-105): si aún no la hay, se pide a Nominatim sin bloquear nada.
  useEffect(() => {
    if (!editable || p.direccion_sugerida) return;
    let vigente = true;
    void deducirDireccion(p).then((d) => {
      if (!vigente || !d || tocada.current) return;
      setDireccion(d.direccion);
      // Guardada en el servidor como sugerida, es la que se aplica sin tocarla: pasa a ser la enseñada.
      // Si no se pudo guardar, se queda la de antes como referencia y la deducida va como corrección.
      if (d.guardada) setEnsenada(d.direccion);
    });
    return () => {
      vigente = false;
    };
    // Una vez por propuesta: el componente se monta con key = id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A pantalla completa, el foco entra en la pantalla nueva, por su "‹" (TR-35).
  useEffect(() => {
    if (pantalla) volver.current?.focus();
  }, [pantalla]);

  // Al abrir corregir, rechazar o fusionar, el formulario se pone a la vista (va debajo de las fotos).
  useEffect(() => {
    if (modo) formulario.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [modo]);

  async function ejecutar(
    accion: () => Promise<{ ok: true; datos?: unknown } | { ok: false; codigo: string }>,
    exito: string,
  ) {
    setOcupado(true);
    const r = await accion();
    setOcupado(false);
    if (!r.ok) {
      avisar(textoError(r.codigo), 'error');
      // El punto cambió: lo escrito se queda y se pide confirmación expresa (docs/32 RV-251).
      if (r.codigo.startsWith('PROPUESTA_DESACTUALIZADA')) setPuntoCambiado(true);
      // Otra persona la resolvió o el punto cambió: se recarga para ver el estado real. Con un error el
      // detalle no se cierra (RV-252): si otra persona la resolvió, se va de la lista y entonces sí.
      if (/PROPUESTA_NO_PENDIENTE|PROPUESTA_DESACTUALIZADA|PUNTO_NO_ACTIVO/.test(r.codigo)) void verDeNuevo();
      return;
    }
    avisar(exito);
    alHecho();
  }

  // Hasta que llega la lista nueva no se aprueba: la confirmación expresa (FR-108) es sobre lo que se ve.
  async function verDeNuevo() {
    setRecarga('cargando');
    setRecarga((await alRecargar()) ? 'lista' : 'error');
  }
  const esperando = recarga !== 'lista';
  const avisoEspera = esperando && (
    <div role={recarga === 'error' ? 'alert' : 'status'} className="text-texto-suave mb-1.5 text-[12px]">
      {recarga === 'cargando' ? (
        T.panelCola.cargandoPunto
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          {T.panelCola.puntoNoCarga}
          <Boton variante="secundario" onClick={() => void verDeNuevo()}>
            {T.mapa.reintentar}
          </Boton>
        </span>
      )}
    </div>
  );

  const aprobarTalCual = () =>
    ejecutar(
      async () => {
        const r = await aprobar(p.id, conDireccion({}, direccion, ensenada), desactualizada);
        return r.ok ? { ok: true as const, datos: r.datos } : r;
      },
      T.panelCola.aprobada(p.codigo ?? T.panelCola.nuevo),
    );

  const titulo = `${p.codigo ?? T.panelCola.nuevo} · ${ETIQUETA_OPERACION[p.operacion]}`;
  // Solo un hidrante de "otra medida" impide aprobar tal cual; una boca se aprueba con su número (DEC-144).
  const bloqueoAprobar = bloqueoPorMedida(p, punto);
  const comparar = pendiente && p.operacion === 'alta' && duplicado;

  return (
    <article className={cn('flex flex-col text-sm', pantalla ? 'h-full' : 'min-h-full')}>
      {pantalla && (
        <div className="bg-barra flex min-h-12 flex-none items-center gap-1 px-1 text-white">
          <button
            type="button"
            ref={volver}
            onClick={alVolver}
            aria-label={T.panelCola.volverCola}
            className="grid size-11 place-items-center rounded hover:bg-white/10"
          >
            <ChevronLeft size={24} aria-hidden />
          </button>
          <h2 className="font-titulo truncate text-[18px] font-semibold">{titulo}</h2>
        </div>
      )}
      <div className={cn('flex-1', pantalla && 'overflow-y-auto')}>
        <div className="grid gap-3.5 px-4 py-4 min-[1100px]:px-5">
          <header>
            {!pantalla && (
              <h2 className="font-titulo text-texto mr-3 inline text-[22px] leading-tight font-semibold">{titulo}</h2>
            )}
            <span className="text-texto-suave text-[13.5px]">
              {T.panelCola.propuestoPor(autor(p), `${hace(p.creada_en)} (${fechaCorta(p.creada_en)})`, dondeEsta(p))}
            </span>
          </header>

          {/* En el móvil, el mapa de borde a borde y fijo arriba mientras se desplaza lo demás. */}
          <MinimapaPropuesta
            plan={plan}
            radioDuplicado={radioDuplicado}
            className="max-md:bg-fondo max-md:sticky max-md:top-0 max-md:z-10 max-md:order-first max-md:-mx-4 max-md:-mt-4 max-md:pb-1"
          />

          {comparar && <Comparacion p={p} existente={duplicado} direccion={direccion} />}
          {/* El duplicado no está en el inventario cargado: no se puede comparar ni fusionar, pero se dice. */}
          {pendiente && p.operacion === 'alta' && p.duplicado_de && !duplicado && (
            <p className="border-oro-600 bg-oro-100 text-ambar-700 rounded-campo border px-3 py-2 text-[13px]">
              {T.panelCola.duplicadoSinComparar(
                p.codigo_duplicado ?? '—',
                p.distancia_duplicado_m == null ? '—' : distancia(p.distancia_duplicado_m),
              )}
            </p>
          )}

          <DatosDelPunto
            campos={ficha.campos}
            cambios={ficha.alta ? null : ficha.cambios}
            direccion={editable ? { valor: direccion, cambiar: escribirDireccion } : null}
          />

          <Fotos p={p} punto={punto} />

          <div ref={formulario} className="scroll-mb-28">
            {pendiente ? (
              <>
                {desactualizada && (modo === 'corregir' || modo === 'fusionar') && <AvisoDesactualizada p={p} />}
                {modo === 'corregir' && (
                  <FormularioCorrecciones
                    p={p}
                    punto={punto}
                    direccion={direccion}
                    ocupado={ocupado || esperando}
                    espera={avisoEspera}
                    desactualizada={desactualizada}
                    puntoCambiado={puntoCambiado}
                    alCancelar={() => setModo(null)}
                    alGuardar={(c, dir) =>
                      void ejecutar(
                        async () => {
                          const r = await aprobar(p.id, conDireccion(c, dir, ensenada), desactualizada);
                          return r.ok ? { ok: true as const } : r;
                        },
                        T.panelCola.aprobadaConCorrecciones(p.codigo ?? T.panelCola.nuevo),
                      )
                    }
                  />
                )}
                {modo === 'rechazar' && (
                  <FormularioRechazo
                    ocupado={ocupado}
                    alCancelar={() => setModo(null)}
                    alConfirmar={(m) => void ejecutar(() => rechazar(p.id, m), T.panelCola.rechazadaAviso)}
                  />
                )}
                {modo === 'fusionar' && duplicado && (
                  <FormularioFusion
                    p={p}
                    existente={duplicado}
                    ocupado={ocupado}
                    alCancelar={() => setModo(null)}
                    alConfirmar={(prev) =>
                      void ejecutar(async () => {
                        // La dirección editada en el detalle, si se ha cambiado (docs/32 RV-253).
                        const { direccion: dir } = conDireccion({}, direccion, ensenada) as {
                          direccion?: string | null;
                        };
                        const r = await fusionar(p.id, duplicado.id, prev, dir);
                        return r.ok ? { ok: true as const } : r;
                      }, T.panelCola.fusionada(duplicado.codigo))
                    }
                  />
                )}
              </>
            ) : (
              <Decision p={p} puntos={puntos} />
            )}
          </div>
        </div>
      </div>

      {/* Fijos abajo del detalle aunque el contenido se desplace (RV-110); en el historial, ninguno. */}
      {pendiente && modo === null && (
        <div
          data-testid="acciones-propuesta"
          className={cn(
            'border-linea bg-papel z-20 flex-none border-t px-4 py-3 min-[1100px]:px-5',
            !pantalla && 'sticky bottom-0',
          )}
        >
          {desactualizada && <AvisoDesactualizada p={p} />}
          {bloqueoAprobar && <p className="text-texto-suave mb-1.5 text-[12px]">{bloqueoAprobar}</p>}
          {avisoEspera}
          <div className="flex gap-3 max-[1099px]:[&>*]:flex-1 max-[1099px]:[&>*]:px-2">
            <Boton
              className={desactualizada ? 'bg-rojo-700' : 'bg-verde-600'}
              disabled={ocupado || !!bloqueoAprobar || esperando}
              onClick={() => void aprobarTalCual()}
            >
              {desactualizada ? T.panelCola.confirmarYAprobar : T.panelCola.aprobar}
            </Boton>
            {p.operacion !== 'retirada' && (
              <Boton
                variante="secundario"
                disabled={ocupado}
                onClick={() => setModo('corregir')}
                aria-label={T.panelCola.aprobarConCorrecciones}
              >
                <span className="md:hidden">{T.panelCola.corregirCorto}</span>
                <span className="max-md:hidden">{T.panelCola.aprobarConCorrecciones}</span>
              </Boton>
            )}
            {comparar && (
              <Boton
                variante="secundario"
                className="border-oro-600 text-ambar-texto"
                disabled={ocupado}
                onClick={() => setModo('fusionar')}
              >
                {T.panelCola.fusionarCon(duplicado.codigo)}
              </Boton>
            )}
            <Boton
              variante="secundario"
              className="border-rojo-texto text-rojo-texto"
              disabled={ocupado}
              onClick={() => setModo('rechazar')}
            >
              {T.panelCola.rechazar}
            </Boton>
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * "Datos del punto" (RV-110): todos los campos, en dos columnas en tableta y ordenador y en una en el
 * móvil. Lo que cambia, primero, con fondo cálido, banda naranja, "Cambia" y antes → después.
 */
function DatosDelPunto({
  campos,
  cambios,
  direccion,
}: {
  campos: CampoFicha[];
  /** Cuántos campos cambian; `null` en un alta, que lleva solo el título. */
  cambios: number | null;
  direccion: { valor: string; cambiar: (v: string) => void } | null;
}) {
  return (
    <section aria-labelledby="datos-del-punto">
      <h3 id="datos-del-punto" className="mb-1.5 flex flex-wrap items-baseline gap-x-2.5">
        <span className="font-titulo text-texto text-[17px] font-bold">{T.panelCola.datosDelPunto}</span>
        {/* En un alta, solo el título: todo es nuevo (docs/28 RV-115). */}
        {cambios !== null && (
          <small className="text-texto-suave text-[13px]">
            <b className="text-naranja-texto font-bold">{T.panelCola.cambios(cambios)}</b>
            {' · '}
            {T.panelCola.restoIgual}
          </small>
        )}
      </h3>
      <div className="border-linea bg-linea rounded-tarjeta grid gap-px overflow-hidden border md:grid-cols-2">
        {campos.map((c) => (
          <div
            key={c.clave}
            data-campo={c.clave}
            data-cambia={c.cambia}
            className={cn(
              'grid grid-cols-[minmax(7rem,38%)_minmax(0,1fr)] items-baseline gap-2.5 px-3 py-2',
              c.cambia
                ? 'bg-[color-mix(in_srgb,#FFB000_8%,var(--papel))] shadow-[inset_4px_0_0_var(--naranja-600)]'
                : 'bg-papel',
              (c.clave === 'nota' || c.clave === 'motivo') && 'md:col-span-2',
            )}
          >
            <span className={cn('text-[13.5px]', c.cambia ? 'text-texto font-semibold' : 'text-texto-suave')}>
              {c.etiqueta}
              {c.cambia && (
                <span className="text-naranja-texto block text-[10.5px] font-bold tracking-wide uppercase">
                  {T.panelCola.cambia}
                </span>
              )}
            </span>
            <span className="min-w-0 text-[14.5px] break-words">
              {c.clave === 'direccion' && direccion ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {c.antes && <Antes texto={c.antes} />}
                  <input
                    value={direccion.valor}
                    maxLength={LIMITES.direccion}
                    onChange={(e) => direccion.cambiar(e.target.value)}
                    placeholder={T.ficha.sinDireccion}
                    aria-label={T.ficha.direccion}
                    className="border-linea bg-papel rounded-campo min-h-9 min-w-0 flex-1 border px-2"
                  />
                  <small className="text-texto-suave text-[12px]">{T.panelCola.deducidaEditable}</small>
                </span>
              ) : (
                <>
                  {c.antes !== undefined && <Antes texto={c.antes} />}
                  <Valor campo={c} />
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Antes({ texto }: { texto: string }) {
  return (
    <>
      <del className="text-rojo-texto">{texto}</del>
      <span aria-hidden> → </span>
    </>
  );
}

function Valor({ campo: c }: { campo: CampoFicha }) {
  const datos = c.clave === 'codigo' || c.clave === 'wgs84' || c.clave === 'utm';
  if (c.clave === 'caudal' && c.caudal) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-px text-[13.5px] font-semibold',
          claseChip(c.caudal),
          c.cambia && c.antes !== undefined && 'ring-verde-600 ring-1',
        )}
      >
        {c.valor}
      </span>
    );
  }
  return (
    <span
      className={cn(
        datos && !c.suave && 'font-datos',
        c.suave
          ? 'text-texto-suave text-[13px]'
          : c.cambia && c.antes !== undefined && 'text-verde-texto font-semibold',
      )}
    >
      {c.valor}
    </span>
  );
}

/**
 * Las fotos a todo el ancho y lado a lado (RV-110): en un alta, conexión y sitio; si trae nuevas de un
 * punto que existe, la actual delante; sin nuevas, las actuales y "no trae nuevas". Tocar amplía.
 */
function Fotos({ p, punto }: { p: PropuestaPanel; punto?: Punto }) {
  const { fotos, nuevas } = fotosDe(p, punto);
  const conActual = nuevas && p.operacion !== 'alta' && fotos.some((f) => !f.nueva);
  return (
    <section aria-labelledby="fotos-propuesta">
      <h3 id="fotos-propuesta" className="mb-1.5 flex flex-wrap items-baseline gap-x-2.5">
        <span className="font-titulo text-texto text-[17px] font-bold">{T.panelCola.fotos}</span>
        {(!nuevas || conActual) && (
          <small className="text-texto-suave text-[13px]">
            {nuevas ? T.panelCola.fotosConActual : T.panelCola.noTraeNuevas}
          </small>
        )}
        {/* La mandó la versión anterior de la app (docs/24 RV-103): se dice aquí, no con un chip (DEC-166). */}
        {p.sin_foto_sitio && <small className="text-texto-suave text-[13px]">{T.panelCola.sinFotoSitio}</small>}
      </h3>
      {fotos.length ? (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${fotos.length}, minmax(0, 1fr))` }}>
          {fotos.map((f) => (
            <UnaFoto key={f.path} foto={f} />
          ))}
        </div>
      ) : (
        <p className="text-texto-suave text-[13px]">{T.panelCola.sinFotos}</p>
      )}
    </section>
  );
}

/** Núcleo y, si lo está, "Fuera de zona", también cuando hay núcleo (DEC-166: ya no hay chip). */
function dondeEsta(p: PropuestaPanel): string {
  if (!p.fuera_de_zona) return p.nucleo ?? T.panelCola.sinNucleo;
  return p.nucleo ? `${p.nucleo} · ${T.panelCola.fueraDeZona}` : T.panelCola.fueraDeZona;
}

/** El punto cambió después de la propuesta (FR-108): encima de los botones y de Corregir y Fusionar. */
function AvisoDesactualizada({ p }: { p: PropuestaPanel }) {
  return (
    <p className="border-rojo-700 bg-rojo-100 text-rojo-700 rounded-campo mb-2 border px-3 py-2 text-[13px]">
      {T.panelCola.desactualizada(p.punto_actualizado_en ? hace(p.punto_actualizado_en) : '—')}
    </p>
  );
}

const ALTO_FOTO = 'h-[110px] md:max-[1099px]:h-[220px] min-[1100px]:h-[200px]';

/** Una foto del detalle. Si no carga, lo dice con palabras en su hueco y queda anotado (UI-04). */
function UnaFoto({ foto: f }: { foto: FotoDetalle }) {
  const url = urlFoto(f.path);
  const [fallo, setFallo] = useState(false);
  return (
    <figure className="relative min-w-0">
      {url && !fallo ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-tarjeta block overflow-hidden"
          aria-label={T.panelCola.ampliarFoto(f.etiqueta)}
        >
          <img
            // CORS: la caché del Service Worker guarda la respuesta completa, no una opaca (RV-12).
            crossOrigin="anonymous"
            src={url}
            alt={f.etiqueta}
            onError={() => {
              setFallo(true);
              anotarError(new Error('panel: una foto de la cola no carga'));
            }}
            className={cn('w-full bg-[linear-gradient(180deg,#C6D2DA,#8C968F)] object-cover', ALTO_FOTO)}
          />
        </a>
      ) : (
        <div
          className={cn(
            'bg-linea text-texto rounded-tarjeta flex items-center justify-center px-2 pb-8 text-center text-[13px]',
            ALTO_FOTO,
          )}
        >
          {T.panelCola.fotoNoCarga}
        </div>
      )}
      <figcaption
        className={cn(
          'pointer-events-none absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[12px] text-white',
          f.nueva ? 'bg-naranja-600' : 'bg-[rgba(14,27,48,.8)]',
        )}
      >
        {f.etiqueta}
      </figcaption>
    </figure>
  );
}

/** Dos columnas, propuesta y existente, con lo que difiere en ámbar (FR-106, FL-21). */
function Comparacion({ p, existente, direccion }: { p: PropuestaPanel; existente: Punto; direccion: string }) {
  const v = valoresPropuestos(p);
  const filas: [string, string, string][] = [
    [T.panelCola.campoTipo, nombreTipo[v.tipo], nombreTipo[existente.tipo]],
    [
      T.panelCola.campoDiametro,
      v.diametro_mm == null
        ? T.panelCola.otraMedida(String(p.datos.diametro_otro ?? '?'))
        : T.formato.mm(v.diametro_mm),
      T.formato.mm(existente.diametro_mm),
    ],
    [
      T.panelCola.campoRacor,
      v.racor ? nombreRacor(v.racor) : '—',
      existente.racor ? nombreRacor(existente.racor) : '—',
    ],
    [T.panelCola.campoEstado, nombreCaudal(v.caudal), nombreCaudal(existente.caudal)],
    [T.panelCola.campoRevision, fechaCorta(p.creada_en), fechaCorta(existente.fecha_ultima_revision)],
    [T.ficha.direccion, direccion || T.ficha.sinDireccion, existente.direccion ?? T.ficha.sinDireccion],
  ];
  const lejos = p.distancia_duplicado_m ?? 0;
  return (
    <div className="mb-2">
      <p className="text-texto-suave mb-1 text-[13px]">{T.panelCola.posibleDuplicado}</p>
      <table className="border-linea bg-papel w-full border text-[13px]">
        <thead>
          <tr className="text-left">
            <th className="border-linea border-b px-2 py-1" />
            <th className="border-linea border-b px-2 py-1">{T.panelCola.propuesta}</th>
            <th className="border-linea border-b px-2 py-1">
              {T.panelCola.existente(existente.codigo, distancia(lejos))}
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map(([k, a, b]) => (
            <tr key={k}>
              <th scope="row" className="text-texto-suave border-linea border-b px-2 py-1 text-left font-normal">
                {k}
              </th>
              {[a, b].map((x, i) => (
                <td
                  key={i}
                  className={cn(
                    'border-linea border-b px-2 py-1',
                    a !== b && 'text-ambar-texto bg-[color-mix(in_srgb,var(--oro-600)_14%,var(--papel))] font-semibold',
                  )}
                >
                  {x}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Solo lectura del historial (FR-109): quién decidió, cuándo, el motivo o las correcciones. */
function Decision({ p, puntos }: { p: PropuestaPanel; puntos: Punto[] }) {
  const quien = p.revisada_por ?? '—';
  const cuando = p.revisada_en ? `${hace(p.revisada_en)} (${fechaCorta(p.revisada_en)})` : '—';
  const c = p.correcciones ?? {};
  const puntoId = c.punto_id as string | undefined;
  const fusionadaCon = c.fusionada_con as string | undefined;
  const codigo = puntoId && p.operacion === 'alta' ? puntos.find((x) => x.id === puntoId)?.codigo : undefined;
  // En palabras, como en el Registro: "Dirección → —", no "null" ni "granada" (docs/32 RV-255).
  const cambios = cambiosDecision(c);
  return (
    <div className="border-linea bg-papel rounded-campo border px-3 py-2">
      <p className="font-semibold">
        {p.estado === 'aprobada'
          ? T.panelCola.decididaAprobada(quien, cuando)
          : p.estado === 'rechazada'
            ? T.panelCola.decididaRechazada(quien, cuando)
            : T.panelCola.decididaRetirada(cuando)}
      </p>
      {p.motivo_rechazo && <p>{T.panelCola.motivo(p.motivo_rechazo)}</p>}
      {cambios && <p>{T.panelCola.conCorrecciones(cambios)}</p>}
      {fusionadaCon && <p>{T.panelCola.fusionadaCon(fusionadaCon)}</p>}
      {codigo && <p>{T.panelCola.codigoAsignado(codigo)}</p>}
      <p className="text-texto-suave mt-1 text-[12px]">{T.panelCola.constaRegistro}</p>
    </div>
  );
}

const CAUDALES: Caudal[] = ['bueno', 'regular', 'malo', 'barro', 'no_funciona'];
// El mismo orden que el formulario del voluntario (docs/25 RV-112, docs/29 RV-121): ORDEN_RACORES.

function FormularioCorrecciones({
  p,
  punto,
  direccion,
  ocupado,
  espera,
  desactualizada,
  puntoCambiado,
  alGuardar,
  alCancelar,
}: {
  p: PropuestaPanel;
  punto?: Punto;
  direccion: string;
  ocupado: boolean;
  /** Por qué no se puede aprobar todavía (se espera el punto de hoy), o nada. */
  espera: React.ReactNode;
  /** Se aprueba con confirmación expresa: el botón dice "Confirmar y aprobar" (FR-108). */
  desactualizada: boolean;
  /** El servidor ha dicho que el punto cambió con esto abierto (PROPUESTA_DESACTUALIZADA). */
  puntoCambiado: boolean;
  alGuardar: (correcciones: Record<string, unknown>, direccion: string) => void;
  alCancelar: () => void;
}) {
  const propuesto = useMemo(() => valoresPropuestos(p, punto), [p, punto]);
  // Lo que jefatura vio al abrir (o al ponerse al día): con eso se sabe qué ha tocado (docs/32 RV-251).
  const [visto, setVisto] = useState<ValoresPunto>(propuesto);
  const [v, setV] = useState<ValoresPunto>(propuesto);
  const [alDia, setAlDia] = useState(false);
  // Cambia lo propuesto con el formulario abierto (la cola se recarga): lo tocado se queda y lo demás
  // pasa a lo nuevo. Se compara por contenido: cada recarga trae objetos nuevos aunque nada cambie.
  if (JSON.stringify(propuesto) !== JSON.stringify(visto)) {
    setV(ponerAlDia(visto, v, propuesto));
    setVisto(propuesto);
    // Solo avisa si lo que cambia es la fila del punto que trae la cola, no el inventario que llega
    // después (la vista de antes, sin `punto`).
    if (p.punto) setAlDia(true);
  }
  // Sin tocar aquí (null), la del detalle tal como esté, también si la deducida llega con esto abierto.
  const [escrita, setEscrita] = useState<string | null>(null);
  const dir = escrita ?? direccion;
  const falta = faltaEnCorrecciones(v);
  const cambia = <K extends keyof ValoresPunto>(k: K, valor: ValoresPunto[K]) => setV((x) => ({ ...x, [k]: valor }));

  return (
    <form
      className="border-linea bg-papel rounded-campo grid gap-2 border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!falta) alGuardar(correccionesDe(propuesto, v), dir);
      }}
    >
      <p className="font-semibold">{T.panelCola.corrigeYAprueba}</p>
      {(puntoCambiado || alDia) && (
        <p
          role="status"
          className="border-rojo-700 bg-rojo-100 text-rojo-700 rounded-campo border px-3 py-2 text-[13px]"
        >
          {T.panelCola.puntoHaCambiado}
        </p>
      )}
      <Fila etiqueta={T.panelCola.campoTipo}>
        {/* Fuera de un alta el tipo no cambia (DEC-090): se enseña sin selector. */}
        {p.operacion !== 'alta' ? (
          <span className="min-h-9 flex-1 py-2">{nombreTipo[v.tipo]}</span>
        ) : (
          <select
            value={v.tipo}
            onChange={(e) => {
              const tipo = e.target.value as TipoPunto;
              setV((x) => ({
                ...x,
                tipo,
                diametro_mm:
                  tipo === 'boca_riego' ? 45 : x.diametro_mm === 70 || x.diametro_mm === 100 ? x.diametro_mm : null,
                racor: tipo === 'boca_riego' ? x.racor : null,
              }));
            }}
            className="border-linea rounded-campo min-h-9 flex-1 border px-2"
          >
            <option value="hidrante">{nombreTipo.hidrante}</option>
            <option value="boca_riego">{nombreTipo.boca_riego}</option>
          </select>
        )}
      </Fila>
      {v.tipo === 'hidrante' ? (
        <Fila etiqueta={T.panelCola.campoDiametro}>
          <select
            value={v.diametro_mm ?? ''}
            onChange={(e) => cambia('diametro_mm', e.target.value ? Number(e.target.value) : null)}
            className="border-linea rounded-campo min-h-9 flex-1 border px-2"
          >
            {v.diametro_mm == null && (
              <option value="">{T.panelCola.otraMedida(String(p.datos.diametro_otro ?? '?'))}</option>
            )}
            <option value="70">{T.formulario.d70}</option>
            <option value="100">{T.formulario.d100}</option>
          </select>
        </Fila>
      ) : (
        <>
          {/* Jefatura corrige el diámetro de una boca con cualquier entero de 20 a 150 (DEC-144). */}
          <Fila etiqueta={T.panelCola.campoDiametro}>
            <input
              type="number"
              inputMode="numeric"
              min={20}
              max={150}
              step={1}
              value={v.diametro_mm ?? ''}
              onChange={(e) => cambia('diametro_mm', e.target.value === '' ? null : Number(e.target.value))}
              aria-label={T.panelCola.campoDiametro}
              className="border-linea rounded-campo min-h-9 flex-1 border px-2"
            />
          </Fila>
          <Fila etiqueta={T.panelCola.campoRacor}>
            <select
              value={v.racor ?? ''}
              onChange={(e) => cambia('racor', (e.target.value || null) as Racor | null)}
              className="border-linea rounded-campo min-h-9 flex-1 border px-2"
            >
              {!v.racor && <option value="">—</option>}
              {ORDEN_RACORES.map((r) => (
                <option key={r} value={r}>
                  {nombreRacor(r)}
                </option>
              ))}
            </select>
          </Fila>
        </>
      )}
      <Fila etiqueta={T.panelCola.campoEstado}>
        <select
          value={v.caudal}
          onChange={(e) => cambia('caudal', e.target.value as Caudal)}
          className="border-linea rounded-campo min-h-9 flex-1 border px-2"
        >
          {/* Un estado que esta versión no conoce no se cambia por otro sin querer (docs/24 RV-102a). */}
          {!esCaudalConocido(v.caudal) && (
            <option value={String(v.caudal)} disabled>
              {T.ficha.estadoDesconocido}
            </option>
          )}
          {CAUDALES.map((c) => (
            <option key={c} value={c}>
              {nombreCaudal(c)}
            </option>
          ))}
        </select>
      </Fila>
      {v.caudal === 'no_funciona' && (
        <Fila etiqueta={T.panelCola.campoFallo}>
          <input
            value={v.descripcion_fallo}
            maxLength={LIMITES.descripcion_fallo}
            onChange={(e) => cambia('descripcion_fallo', e.target.value)}
            className="border-linea rounded-campo min-h-9 flex-1 border px-2"
          />
        </Fila>
      )}
      <Fila etiqueta={T.panelCola.campoDescripcion}>
        <input
          value={v.descripcion}
          maxLength={LIMITES.descripcion}
          onChange={(e) => cambia('descripcion', e.target.value)}
          className="border-linea rounded-campo min-h-9 flex-1 border px-2"
        />
      </Fila>
      <Fila etiqueta={T.ficha.direccion}>
        <input
          value={dir}
          maxLength={LIMITES.direccion}
          onChange={(e) => setEscrita(e.target.value)}
          className="border-linea rounded-campo min-h-9 flex-1 border px-2"
        />
      </Fila>
      {espera}
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <Boton
            type="submit"
            className={desactualizada ? 'bg-rojo-700' : 'bg-verde-600'}
            disabled={ocupado || !!falta}
          >
            {desactualizada ? T.panelCola.confirmarYAprobar : T.panelCola.guardarYAprobar}
          </Boton>
          {falta && <p className="text-texto-suave mt-1 max-w-56 text-[11px]">{falta}</p>}
        </div>
        <Boton variante="secundario" onClick={alCancelar}>
          {T.panelCola.cancelar}
        </Boton>
      </div>
    </form>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-texto-suave w-[30%] shrink-0 text-[13px]">{etiqueta}</span>
      {children}
    </label>
  );
}

function FormularioRechazo({
  ocupado,
  alConfirmar,
  alCancelar,
}: {
  ocupado: boolean;
  alConfirmar: (motivo: string) => void;
  alCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [intentado, setIntentado] = useState(false);
  return (
    <div className="border-linea bg-papel rounded-campo border p-3">
      <label className="block">
        <span className="text-texto-suave text-[13px]">{T.panelCola.motivoRechazo}</span>
        <textarea
          value={motivo}
          maxLength={LIMITES.motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={T.panelCola.phMotivo}
          rows={3}
          className="border-linea rounded-campo mt-1 block w-full border p-2"
        />
      </label>
      <p className="text-texto-suave mt-1 text-[12px]">{T.panelCola.avisoNombres}</p>
      {intentado && !motivo.trim() && <p className="text-rojo-texto mt-1 text-[12px]">{T.panelCola.sinMotivo}</p>}
      <div className="mt-2 flex gap-3">
        <Boton
          variante="destructivo"
          disabled={ocupado}
          onClick={() => {
            setIntentado(true);
            if (motivo.trim()) alConfirmar(motivo);
          }}
        >
          {T.panelCola.confirmarRechazo}
        </Boton>
        <Boton variante="secundario" onClick={alCancelar}>
          {T.panelCola.cancelar}
        </Boton>
      </div>
    </div>
  );
}

function FormularioFusion({
  p,
  existente,
  ocupado,
  alConfirmar,
  alCancelar,
}: {
  p: PropuestaPanel;
  existente: Punto;
  ocupado: boolean;
  alConfirmar: (prevalece: Partial<Record<CampoFusion, Prevalece>>) => void;
  alCancelar: () => void;
}) {
  const difs = useMemo(() => diferenciasFusion(p, existente), [p, existente]);
  const [elegido, setElegido] = useState<Partial<Record<CampoFusion, Prevalece>>>({});
  return (
    <div className="border-oro-600 rounded-campo border bg-[color-mix(in_srgb,var(--oro-600)_10%,var(--papel))] p-3">
      <p className="font-semibold">{T.panelCola.fusionTitulo(existente.codigo)}</p>
      <p className="mb-2 text-[13px]">{T.panelCola.fusionExplica(existente.codigo)}</p>
      {difs.map((d) => {
        // Entero (para `title`) y corto: se recorta el valor, no "(existente)" ni "(propuesta)".
        const opcion = (valor: string, marca: (v: string) => string) =>
          d.campo === 'ubicacion'
            ? { entero: valor, corto: recortarOpcion(valor) }
            : { entero: marca(valor), corto: marca(recortarOpcion(valor, MAXIMO_OPCION - marca('').length)) };
        const existente = opcion(d.existente, T.panelCola.valorExistente);
        const propuesta = opcion(d.propuesta, T.panelCola.valorPropuesta);
        const valor = elegido[d.campo] ?? 'existente';
        return (
          <Fila key={d.campo} etiqueta={d.campo === 'ubicacion' ? T.panelCola.campoUbicacion : etiquetaCampo(d.campo)}>
            {/* Una descripción de 500 caracteres no cabe a 412 px: la opción va recortada y entera en
                `title`, también en el select para la elegida (docs/32 RV-254). */}
            <select
              value={valor}
              title={valor === 'propuesta' ? propuesta.entero : existente.entero}
              onChange={(e) => setElegido((x) => ({ ...x, [d.campo]: e.target.value as Prevalece }))}
              className="border-linea bg-papel rounded-campo min-h-9 w-0 min-w-0 flex-1 border px-2"
            >
              <option value="existente" title={existente.entero}>
                {existente.corto}
              </option>
              <option value="propuesta" title={propuesta.entero}>
                {propuesta.corto}
              </option>
            </select>
          </Fila>
        );
      })}
      <div className="mt-2 flex gap-3">
        <Boton
          variante="secundario"
          className="border-oro-600 text-ambar-texto"
          disabled={ocupado}
          onClick={() => alConfirmar(elegido)}
        >
          {T.panelCola.fusionar}
        </Boton>
        <Boton variante="secundario" onClick={alCancelar}>
          {T.panelCola.cancelar}
        </Boton>
      </div>
    </div>
  );
}
