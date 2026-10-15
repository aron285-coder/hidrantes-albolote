import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CodigoQR } from './CodigoQR';
import { Dialogo } from './Dialogo';
import { ErrorReintentar } from './dialogos';
import { BotonMas, EtiquetaAcceso, EtiquetaPedido, EtiquetaPequena } from './piezas';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { SelectorPin } from '@/componentes/operaciones/SelectorPin';
import { useCarga } from '@/hooks/carga';
import { useAcceso, usePosicion, usePuntos } from '@/hooks/estado';
import { dejarJefatura } from '@/lib/acceso';
import { ENTORNO } from '@/lib/entorno';
import { anotarError } from '@/lib/errores';
import { fechaCorta, hace } from '@/lib/formato';
import { textoError } from '@/lib/panel/errores';
import {
  type ClaveParametro,
  type Parametros,
  type Workflow,
  clavesParametros,
  PARAMETROS_POR_DEFECTO,
  anadirNucleo,
  avisoPedido,
  avisoQuitarAcceso,
  cambiarCodigo,
  cambiosParametros,
  cargarAdministradores,
  cargarCodigo,
  cargarNovedades,
  cargarNucleos,
  cargarParametros,
  cargarPedidos,
  motivoPedido,
  revocarDispositivo,
  cargarSalud,
  origenTareas,
  pendienteDeVincular,
  contarDispositivos,
  contarDesde,
  DIAS_REVOCAR_DESDE,
  leerFechaLocal,
  motivoDesde,
  revocarDesde,
  valorFechaLocal,
  esUnoMismo,
  faltaEnParametros,
  generarCodigo,
  gestionarAdministrador,
  guardarParametros,
  lanzarWorkflow,
  leerRadios,
  renombrarNucleo,
  sugerenciasUniformidad,
  textoRadios,
  NOMBRE_PARAMETRO,
  NOMBRE_TRABAJO,
} from '@/lib/panel/ajustes';
import { type TemaJefatura, cargarTemas, estadoPushJefatura, fijarTemas } from '@/lib/panel/push-jefatura';
import {
  type EstadoEntrada,
  abiertaHasta,
  abrirEntrada,
  cargarEntrada,
  cerrarEntrada,
  diaYHora,
} from '@/lib/panel/entrada';
import { atencionSalud, filasSalud, nombreTarea, tareasVisibles } from '@/lib/panel/salud';
import type { Coordenadas } from '@/lib/propuestas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

// Toques de 44 px por debajo de 1.100 px y de 36 desde ahí (UI-15, docs/38 RV-509).
const toque = 'min-h-11 min-[1100px]:min-h-9';
const campo = `border-linea rounded-campo ${toque} border px-2`;

function Tarjeta({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="border-linea bg-papel rounded-tarjeta mb-4 break-inside-avoid border p-4">
      <h2 className="font-titulo text-[17px] font-semibold">{titulo}</h2>
      {ayuda && <p className="text-texto-suave mt-0.5 mb-2 text-[13px]">{ayuda}</p>}
      <div className={ayuda ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

/** Ajustes del panel (FR-140–FR-145, FR-162–FR-167; FL-29–FL-31, FL-33, FL-34). */
export default function Ajustes() {
  // La entrada del lanzamiento se abre desde Código de acceso o desde Salud (RV-338): al cambiarla en
  // una, las dos se vuelven a leer.
  const [marcaEntrada, setMarcaEntrada] = useState(0);
  const entradaCambiada = useCallback(() => setMarcaEntrada((m) => m + 1), []);
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {/* Una columna por debajo de 1.100 px, dos hasta 1.599 y tres desde 1.600, cada una a su ritmo y sin huecos
          (docs/38 RV-509); el orden de lectura y del tabulador es el de aquí. */}
      <div className="gap-4 min-[1100px]:columns-2 min-[1600px]:columns-3">
        <CodigoDeAcceso marcaEntrada={marcaEntrada} entradaCambiada={entradaCambiada} />
        <Administradores />
        <SaludDelSistema marcaEntrada={marcaEntrada} entradaCambiada={entradaCambiada} />
        <AvisosJefatura />
        <ParametrosTarjeta />
        <Nucleos />
        <Mantenimiento />
        <Tarjeta titulo={T.panelAjustes.codigoQr} ayuda={T.panelAjustes.ayudaQr}>
          <CodigoQR />
        </Tarjeta>
        <Novedades />
      </div>
    </div>
  );
}

// ---------- código de acceso (FR-140, FL-29) ----------

interface ConEntrada {
  marcaEntrada: number;
  entradaCambiada: () => void;
}

function CodigoDeAcceso({ marcaEntrada, entradaCambiada }: ConEntrada) {
  const { avisar } = usePanel();
  const carga = useCarga(() => cargarCodigo(), []);
  // Cada minuto: la franja de «abierta» se quita sola al pasar la hora (RV-338).
  const entrada = useCarga(() => cargarEntrada(), [marcaEntrada], 60_000);
  // Revocando todos, la entrada solo se abre si se marca (docs/35 RV-433, DEC-201). Sin saber si la
  // base tiene la entrada (no ha cargado, o no la tiene), no se ofrece.
  const hayEntrada = entrada.estado !== 'error' && !!entrada.datos?.disponible;
  const [visible, setVisible] = useState(false);
  const [revocar, setRevocar] = useState(false);
  const [abrir, setAbrir] = useState(false);
  const abrirAlRevocar = revocar && abrir && hayEntrada;
  const idAyudaAbrir = useId();
  // El código que espera confirmación y si abre la entrada, fijado al pedirlo: lo que dice la ventana
  // es lo que se envía, aunque entretanto falle la lectura de la entrada.
  const [confirmar, setConfirmar] = useState<{ codigo: string; abrir: boolean } | null>(null);
  // Cuántos móviles tienen acceso; null si no se ha podido saber (docs/32 RV-261): entonces no se
  // dice ningún número, y la ventana de revocar avisa de que no se sabe, sin impedir seguir.
  const cuenta = useCarga(() => contarDispositivos(), []);
  const moviles = cuenta.estado === 'error' ? null : cuenta.datos;
  const [ocupado, setOcupado] = useState(false);

  async function generar() {
    setConfirmar({ codigo: generarCodigo(), abrir: abrirAlRevocar });
  }

  async function aplicar({ codigo: nuevo, abrir: abrirEntrada }: { codigo: string; abrir: boolean }) {
    setOcupado(true);
    const r = await cambiarCodigo(nuevo, revocar, abrirEntrada);
    setOcupado(false);
    setConfirmar(null);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    setVisible(true);
    setAbrir(false);
    avisar(T.panelAjustes.codigoCambiado(nuevo));
    if (abrirEntrada) entradaCambiada();
    await Promise.all([carga.recargar(), cuenta.recargar()]);
  }

  const datos = carga.datos;
  const fecha = datos?.cambiadoEn ? fechaCorta(datos.cambiadoEn) : null;
  // Sin el número de móviles: está en Salud y en la ventana de revocar (docs/38 RV-509).
  const ayuda = fecha
    ? T.panelAjustes.cambiadoPorSinCuenta(fecha, datos?.cambiadoPor ?? '—')
    : T.panelAjustes.sinCambiosSinCuenta;
  return (
    <Tarjeta titulo={T.panelAjustes.codigoAcceso} ayuda={ayuda}>
      {/* El código que no se ha podido leer se dice, con Reintentar; nunca «—» (docs/32 RV-261). Si
          falla una recarga (tras cambiarlo, por ejemplo), tampoco se enseña el de antes como vigente. */}
      {carga.estado === 'error' ? (
        <ErrorReintentar
          texto={`${T.panelAjustes.codigoNoCarga} ${textoError(carga.codigo)}`}
          reintentar={carga.recargar}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <output
            className={cn(campo, 'font-datos flex min-w-32 items-center bg-[var(--fondo)] text-lg tracking-[0.3em]')}
          >
            {!datos ? T.panelCola.cargando : visible ? (datos.codigo ?? T.panelAjustes.sinDato) : '••••••'}
          </output>
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className={cn('text-texto-suave flex items-center gap-1 px-2 underline', toque)}
          >
            {visible ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            {visible ? T.panelAjustes.ocultar : T.panelAjustes.ver}
          </button>
        </div>
      )}
      <label className={cn('mt-3 flex items-center gap-2 text-sm', toque)}>
        <input
          type="checkbox"
          className="size-4"
          checked={revocar}
          onChange={(e) => {
            setRevocar(e.target.checked);
            // La casilla de abrir la entrada sale siempre sin marcar (DEC-201).
            setAbrir(false);
          }}
        />
        {T.panel.revocarTodos}
      </label>
      {revocar && hayEntrada && (
        <div className="mt-2 ml-6">
          <label className={cn('flex items-center gap-2 text-sm', toque)}>
            <input
              type="checkbox"
              className="size-4"
              checked={abrir}
              onChange={(e) => setAbrir(e.target.checked)}
              aria-describedby={idAyudaAbrir}
            />
            {T.panelAjustes.abrirEntradaAlRevocar}
          </label>
          <p id={idAyudaAbrir} className="text-texto-suave mt-0.5 ml-6 text-[13px]">
            {T.panelAjustes.ayudaAbrirEntradaAlRevocar}
          </p>
        </div>
      )}
      <Boton className="mt-3" disabled={ocupado} onClick={() => void generar()}>
        {T.panel.generarNuevo}
      </Boton>
      <p className="text-texto-suave mt-2 text-[13px]">
        {revocar ? T.panelAjustes.explicaRevocando : T.panelAjustes.explicaSinRevocar}
      </p>
      <SeccionEntrada entrada={entrada} entradaCambiada={entradaCambiada} />
      <RevocarDesde alRevocar={() => void cuenta.recargar()} />

      {confirmar && (
        <Dialogo titulo={T.panel.generarNuevo} alCerrar={() => setConfirmar(null)}>
          <p className="text-sm">
            {!revocar
              ? T.panelAjustes.avisoSinRevocar
              : moviles === null
                ? T.panelAjustes.avisoRevocandoSinCuenta
                : T.panelAjustes.avisoRevocando(moviles)}
          </p>
          {confirmar.abrir && <p className="mt-2 text-sm">{T.panelAjustes.avisoEntradaAlRevocar}</p>}
          <div className="mt-3 flex gap-3">
            <Boton variante="destructivo" disabled={ocupado} onClick={() => void aplicar(confirmar)}>
              {T.panelAjustes.confirmarCodigo}
            </Boton>
            <Boton variante="secundario" onClick={() => setConfirmar(null)}>
              {T.panelCola.cancelar}
            </Boton>
          </div>
        </Dialogo>
      )}
    </Tarjeta>
  );
}

/**
 * La entrada del día del lanzamiento (docs/33 RV-338): cerrada, el botón que la abre 24 h con su
 * explicación; abierta, una franja verde con hasta cuándo y «Cerrar ahora». Sin 0044 en la base no se
 * dibuja (UI-01); si no se puede leer, se dice con Reintentar.
 */
/** El aviso al abrir la entrada, con la hora que devuelve el servidor (si no es una fecha, sin hora). */
function useAvisarAbierta() {
  const { avisar } = usePanel();
  return (hasta: unknown) => {
    const valida = abiertaHasta(hasta);
    if (!valida) return avisar(T.panelAjustes.entradaAbierta);
    const { dia, hora } = diaYHora(valida);
    avisar(T.panelAjustes.entradaAbiertaHasta(dia, hora));
  };
}

function SeccionEntrada({
  entrada,
  entradaCambiada,
}: {
  entrada: ReturnType<typeof useCarga<EstadoEntrada>>;
  entradaCambiada: () => void;
}) {
  const { avisar } = usePanel();
  const avisarAbierta = useAvisarAbierta();
  const [ocupado, setOcupado] = useState(false);
  const idExplica = useId();

  async function cambiar(abrir: boolean) {
    setOcupado(true);
    try {
      if (abrir) {
        const r = await abrirEntrada();
        if (!r.ok) return avisar(textoError(r.codigo), 'error');
        avisarAbierta(r.datos);
      } else {
        const r = await cerrarEntrada();
        if (!r.ok) return avisar(textoError(r.codigo), 'error');
        avisar(T.panelAjustes.entradaCerrada);
      }
      entradaCambiada();
    } finally {
      setOcupado(false);
    }
  }

  if (entrada.estado === 'error')
    return (
      <section aria-label={T.panelAjustes.entrada} className="border-linea mt-4 border-t pt-3">
        <h3 className="text-sm font-semibold">{T.panelAjustes.entrada}</h3>
        <ErrorReintentar
          texto={`${T.panelAjustes.entradaNoCarga} ${textoError(entrada.codigo)}`}
          reintentar={entrada.recargar}
          className="mt-1"
        />
      </section>
    );
  const d = entrada.datos;
  if (!d?.disponible) return null;
  const abierta = d.hasta ? diaYHora(d.hasta) : null;
  return (
    <section aria-label={T.panelAjustes.entrada} className="border-linea mt-4 border-t pt-3">
      <h3 className="text-sm font-semibold">{T.panelAjustes.entrada}</h3>
      {abierta ? (
        <div className="bg-tinte-verde text-tinte-verde-texto rounded-campo mt-2 flex flex-wrap items-center gap-2 p-2 text-sm ring-1 ring-tinte-verde-borde ring-inset">
          <span role="status" className="flex-1 font-semibold">
            {T.panelAjustes.entradaAbiertaHasta(abierta.dia, abierta.hora)}
          </span>
          <Boton variante="secundario" disabled={ocupado} onClick={() => void cambiar(false)}>
            {T.panelAjustes.cerrarAhora}
          </Boton>
        </div>
      ) : (
        <>
          <Boton
            variante="secundario"
            className="mt-2"
            disabled={ocupado}
            aria-describedby={idExplica}
            onClick={() => void cambiar(true)}
          >
            {T.panelAjustes.abrirEntrada}
          </Boton>
          <p id={idExplica} className="text-texto-suave mt-1 text-[13px]">
            {T.panelAjustes.explicaEntrada}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Revocar solo los móviles que han entrado desde una hora (docs/35 RV-433, DEC-201): por defecto,
 * hace 24 h. Antes de confirmar, la ventana dice cuántos son (`fn_contar_desde`); con ninguno, el
 * botón de confirmar queda deshabilitado con su motivo.
 */
function RevocarDesde({ alRevocar }: { alRevocar: () => void }) {
  const { avisar } = usePanel();
  const [texto, setTexto] = useState(() => valorFechaLocal(new Date(Date.now() - 86_400_000)));
  // null: ventana cerrada; si no, lo que dice el servidor de cuántos son.
  const [cuenta, setCuenta] = useState<
    | { desde: Date; estado: 'cargando' }
    | { desde: Date; n: number }
    | {
        desde: Date;
        codigo: string;
      }
    | null
  >(null);
  const [ocupado, setOcupado] = useState(false);
  const idMotivo = useId();
  const desde = leerFechaLocal(texto);
  const motivo = motivoDesde(desde);
  const ahora = new Date();

  // Cada apertura o cierre de la ventana cambia la vuelta: una cuenta que llega con la ventana ya
  // cerrada (o de una apertura anterior) no la vuelve a abrir.
  const vuelta = useRef(0);
  const cerrar = () => {
    vuelta.current++;
    setCuenta(null);
  };

  async function contar(fecha: Date) {
    const esta = ++vuelta.current;
    setCuenta({ desde: fecha, estado: 'cargando' });
    const r = await contarDesde(fecha);
    if (esta !== vuelta.current) return;
    setCuenta(r.ok ? { desde: fecha, n: r.datos } : { desde: fecha, codigo: r.codigo });
  }

  async function revocar(fecha: Date) {
    setOcupado(true);
    const r = await revocarDesde(fecha);
    setOcupado(false);
    if (!r.ok) {
      cerrar();
      return avisar(textoError(r.codigo), 'error');
    }
    cerrar();
    avisar(T.panelAjustes.revocadosDesde(r.datos));
    alRevocar();
  }

  return (
    <section aria-label={T.panelAjustes.revocarDesde} className="border-linea mt-4 border-t pt-3">
      <h3 className="text-sm font-semibold">{T.panelAjustes.revocarDesde}</h3>
      <p className="text-texto-suave mt-0.5 text-[13px]">{T.panelAjustes.ayudaRevocarDesde}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          {T.panelAjustes.fechaDesde}
          <input
            type="datetime-local"
            className={campo}
            value={texto}
            min={valorFechaLocal(new Date(ahora.getTime() - DIAS_REVOCAR_DESDE * 86_400_000))}
            max={valorFechaLocal(ahora)}
            onChange={(e) => setTexto(e.target.value)}
            aria-describedby={motivo ? idMotivo : undefined}
          />
        </label>
        <Boton
          variante="secundario"
          disabled={!!motivo}
          aria-describedby={motivo ? idMotivo : undefined}
          onClick={() => desde && void contar(desde)}
        >
          {T.panelAjustes.revocarDesdeBoton}
        </Boton>
      </div>
      {motivo && (
        <p id={idMotivo} className="text-texto-suave mt-1 text-[13px]">
          {motivo}
        </p>
      )}
      {cuenta && (
        <Dialogo titulo={T.panelAjustes.revocarDesdeBoton} alCerrar={() => !ocupado && cerrar()}>
          {'estado' in cuenta ? (
            <p className="text-sm">{T.panelCola.cargando}</p>
          ) : 'codigo' in cuenta ? (
            <ErrorReintentar
              texto={`${T.panelAjustes.contarDesdeNoCarga} ${textoError(cuenta.codigo)}`}
              reintentar={() => contar(cuenta.desde)}
            />
          ) : (
            <p id={`${idMotivo}-n`} className="text-sm">
              {cuenta.n === 0 ? T.panelAjustes.ningunoDesde : T.panelAjustes.seRevocaran(cuenta.n)}
            </p>
          )}
          <div className="mt-3 flex gap-3">
            <Boton
              variante="destructivo"
              disabled={ocupado || !('n' in cuenta) || cuenta.n === 0}
              aria-describedby={'n' in cuenta ? `${idMotivo}-n` : undefined}
              onClick={() => void revocar(cuenta.desde)}
            >
              {T.panelAjustes.revocarDesdeBoton}
            </Boton>
            <Boton variante="secundario" disabled={ocupado} onClick={cerrar}>
              {T.panelCola.cancelar}
            </Boton>
          </div>
        </Dialogo>
      )}
    </section>
  );
}

/**
 * Debajo de una lista de Ajustes: «Cargando…» mientras carga, el error con «Reintentar» si falla
 * (también con filas de antes a la vista) y, cargada y vacía, su estado vacío (docs/31 RV-167, UI-03).
 */
function EstadoLista({
  carga,
  vacio,
}: {
  carga: {
    estado: 'cargando' | 'ok' | 'error';
    datos: unknown[] | null;
    codigo?: string;
    recargar: () => Promise<void>;
  };
  vacio: string | null;
}) {
  const hay = !!carga.datos?.length;
  // El aviso va dentro de un <li> normal: un <li role="alert"> deja de ser un elemento de la lista
  // y axe lo marca (regla «list»).
  if (carga.estado === 'error')
    return (
      <li className="py-1.5 text-[13px]">
        <ErrorReintentar texto={textoError(carga.codigo ?? '')} reintentar={carga.recargar} />
      </li>
    );
  if (hay) return null;
  if (carga.estado === 'cargando') return <li className="text-texto-suave text-[13px]">{T.panelCola.cargando}</li>;
  return vacio ? <li className="text-texto-suave text-[13px]">{vacio}</li> : null;
}

// ---------- administradores (FR-141, FL-30) ----------

function Administradores() {
  const { avisar } = usePanel();
  const carga = useCarga(() => cargarAdministradores(), []);
  const [correo, setCorreo] = useState('');
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  // Pasar a «sin acceso» se confirma antes (docs/35 RV-431): el correo que espera la confirmación.
  const [quitando, setQuitando] = useState<string | null>(null);
  const acceso = useAcceso();
  const propio = acceso.tipo === 'jefatura' ? acceso.correo : null;
  const filas = carga.datos ?? [];
  const idMotivoAnadir = useId();

  useEffect(() => {
    void sugerenciasUniformidad().then(setSugerencias);
  }, []);

  async function cambiar(email: string, activo: boolean) {
    setOcupado(true);
    const r = await gestionarAdministrador(email, activo);
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(activo ? T.panelAjustes.administradorAnadido(email) : T.panelAjustes.administradorQuitado(email));
    setCorreo('');
    await carga.recargar();
  }

  // Al cerrar la confirmación, el foco vuelve al «⋯» de esa fila (docs/38 RV-509).
  const botonesMas = useRef(new Map<string, HTMLButtonElement>());
  const cerrarQuitar = () => {
    const email = quitando;
    setQuitando(null);
    if (email) requestAnimationFrame(() => botonesMas.current.get(email)?.focus());
  };

  // La ventana sigue abierta y bloqueada hasta tener la respuesta: un segundo toque no repite nada.
  async function quitar(email: string) {
    setOcupado(true);
    const r = await gestionarAdministrador(email, false);
    if (!r.ok) {
      setOcupado(false);
      cerrarQuitar();
      return avisar(textoError(r.codigo), 'error');
    }
    avisar(T.panelAjustes.administradorQuitado(email));
    // Quien se lo ha quitado a sí mismo sale del panel, sin recargar una lista que ya no puede leer.
    if (esUnoMismo(email, propio)) return dejarJefatura();
    setOcupado(false);
    cerrarQuitar();
    await carga.recargar();
  }

  const nuevos = sugerencias.filter((s) => !filas.some((a) => a.email === s));
  return (
    <Tarjeta titulo={T.panelAjustes.administradores} ayuda={T.panelAjustes.ayudaAdministradores}>
      <ul className="text-sm">
        {filas.map((a) => {
          const yo = esUnoMismo(a.email, propio);
          const pendiente = pendienteDeVincular(a);
          return (
            <li key={a.email} className="border-linea flex items-start gap-2 border-b py-1.5 last:border-b-0">
              {/* El correo (el tuyo, con «Tú»), cómo está su acceso y, debajo, quién lo añadió (DEC-215). */}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="[overflow-wrap:anywhere]">{a.email}</span>
                  {yo && <EtiquetaPequena tono="gris">{T.panel.tu}</EtiquetaPequena>}
                  <EtiquetaAcceso estado={!a.activo ? 'sin_acceso' : pendiente ? 'pendiente' : 'activo'} />
                </p>
                <p className="text-texto-suave mt-0.5 text-[13px]">
                  {esUnoMismo(a.creado_por, propio)
                    ? T.panelAjustes.anadidoPorTi(fechaCorta(a.creado_en))
                    : T.panelAjustes.anadidoEl(fechaCorta(a.creado_en), a.creado_por)}
                </p>
                {pendiente && <p className="text-texto-suave text-[13px]">{T.panelAjustes.ayudaPendienteVincular}</p>}
              </div>
              <BotonMas
                nombre={a.email}
                ref={(b) => {
                  if (b) botonesMas.current.set(a.email, b);
                  else botonesMas.current.delete(a.email);
                }}
                opciones={[
                  a.activo
                    ? {
                        nombre: T.panelAjustes.quitarAccesoMenu,
                        peligro: true,
                        deshabilitada: ocupado,
                        alElegir: () => setQuitando(a.email),
                      }
                    : {
                        nombre: T.panelAjustes.devolverAcceso,
                        deshabilitada: ocupado,
                        alElegir: () => void cambiar(a.email, true),
                      },
                ]}
              />
            </li>
          );
        })}
        <EstadoLista carga={carga} vacio={T.panelAjustes.administradoresVacio} />
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder={T.panelAjustes.correoNuevo}
          aria-label={T.panelAjustes.correoNuevo}
          className={cn(campo, 'min-w-56 flex-1')}
        />
        <Boton
          disabled={ocupado || !correo.includes('@')}
          aria-describedby={!correo.includes('@') ? idMotivoAnadir : undefined}
          onClick={() => void cambiar(correo, true)}
        >
          {T.panel.anadir}
        </Boton>
      </div>
      {/* #753 (UI-02): por qué «Añadir» no se puede tocar. */}
      {!correo.includes('@') && (
        <p id={idMotivoAnadir} className="text-texto-suave mt-1 text-[13px]">
          {T.panelAjustes.motivoAnadir}
        </p>
      )}
      {nuevos.length > 0 && (
        <p className="text-texto-suave mt-2 flex flex-wrap items-center gap-2 text-[13px]">
          {T.panelAjustes.sugerencias}
          {nuevos.slice(0, 5).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCorreo(s)}
              className={cn('border-linea rounded-chip border px-2 py-0.5', toque)}
            >
              {s}
            </button>
          ))}
        </p>
      )}
      {quitando && (
        <Dialogo titulo={T.panelAjustes.quitarAcceso} alCerrar={() => !ocupado && cerrarQuitar()}>
          <p className="text-sm">{avisoQuitarAcceso(quitando, propio)}</p>
          <div className="mt-3 flex gap-3">
            <Boton variante="destructivo" disabled={ocupado} onClick={() => void quitar(quitando)}>
              {T.panelAjustes.quitarAcceso}
            </Boton>
            <Boton variante="secundario" disabled={ocupado} onClick={cerrarQuitar}>
              {T.panelCola.cancelar}
            </Boton>
          </div>
        </Dialogo>
      )}
    </Tarjeta>
  );
}

// ---------- parámetros (FR-142, FL-31) ----------

function ParametrosTarjeta() {
  const { avisar } = usePanel();
  const carga = useCarga(() => cargarParametros(), []);
  // Lo editado manda mientras jefatura esté escribiendo; si no, lo que hay guardado.
  const [editado, setEditado] = useState<Parametros | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Los radios, como texto libre mientras se escriben (docs/31 RV-167): se leen al salir del campo y
  // al guardar. Re-formatearlos en cada tecla no dejaba escribir "5,5" ni un quinto valor.
  const [radios, setRadios] = useState<string | null>(null);
  const idRadios = useId();
  // Lo guardado de verdad, o null mientras no ha cargado: hasta entonces no se edita nada, y los
  // cambios nunca se calculan contra los valores por defecto (docs/32 RV-257). Sin cargar, los
  // campos van vacíos y deshabilitados: un valor por defecto a la vista parecería el guardado.
  // Una recarga que falla (tras guardar, por ejemplo) deja datos de antes: tampoco valen como lo
  // guardado. Se dice el error y no se edita hasta reintentar; lo escrito se conserva.
  const guardados = carga.estado === 'error' ? null : carga.datos;
  const sinCargar = !guardados;
  const fallo = carga.estado === 'error' ? textoError(carga.codigo) : null;
  const v = editado ?? guardados ?? PARAMETROS_POR_DEFECTO;
  const setV = (cambio: (x: Parametros) => Parametros) => setEditado(cambio(v));
  const conRadios = (x: Parametros): Parametros => (radios === null ? x : { ...x, escala_radios: leerRadios(radios) });

  // Lo que se guardaría ahora, con los radios tal como están escritos: el motivo de Guardar
  // deshabilitado habla siempre de lo que se ve, también mientras se corrige.
  const efectivo = conRadios(v);
  const cambios = cambiosParametros(guardados, efectivo);
  const invalido = sinCargar ? null : faltaEnParametros(efectivo);
  const radiosMal = invalido === 'escala_radios';
  const falta = sinCargar
    ? (fallo ?? T.panelCola.cargando)
    : radiosMal
      ? T.panelAjustes.radiosInvalidos
      : invalido
        ? T.panelAjustes.fueraDeRango(NOMBRE_PARAMETRO[invalido as ClaveParametro])
        : !Object.keys(cambios).length
          ? T.avisosFormulario.sinCambios
          : null;

  function leerCampoRadios() {
    if (radios === null) return;
    setV(conRadios);
    setRadios(null);
  }

  async function guardar() {
    // Guardar con el campo de radios aún abierto: se lee aquí y, si no vale, se dice y no se envía.
    if (sinCargar) return;
    if (radios !== null) leerCampoRadios();
    if (invalido) return;
    setOcupado(true);
    const r = await guardarParametros(cambios);
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelAjustes.parametrosGuardados);
    setEditado(null);
    await carga.recargar();
  }

  return (
    <Tarjeta titulo={T.panelAjustes.parametros} ayuda={T.panelAjustes.ayudaParametros}>
      {/* Sin cargar: «Cargando…», o el error con Reintentar (docs/32 RV-257). */}
      {fallo ? (
        <ErrorReintentar texto={fallo} reintentar={carga.recargar} className="mb-2" />
      ) : (
        sinCargar && <p className="text-texto-suave mb-2 text-sm">{T.panelCola.cargando}</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {clavesParametros(v).map((clave) => (
          <label key={clave} className="flex items-center gap-2 text-sm">
            <span className="text-texto-suave flex-1">{NOMBRE_PARAMETRO[clave]}</span>
            <input
              type="number"
              value={sinCargar ? '' : v[clave]}
              disabled={sinCargar}
              onChange={(e) => setV((x) => ({ ...x, [clave]: Number(e.target.value) }))}
              className={cn(campo, 'w-24 text-right')}
            />
          </label>
        ))}
        <div className="flex flex-col gap-1 text-sm sm:col-span-2">
          <label className="flex items-center gap-2">
            <span className="text-texto-suave flex-1">{T.panelAjustes.radiosMarcador}</span>
            <input
              value={sinCargar ? '' : (radios ?? textoRadios(v.escala_radios))}
              disabled={sinCargar}
              onChange={(e) => setRadios(e.target.value)}
              onBlur={leerCampoRadios}
              onKeyDown={(e) => e.key === 'Enter' && leerCampoRadios()}
              inputMode="decimal"
              aria-label={T.panelAjustes.radiosMarcador}
              aria-invalid={(radiosMal && radios === null) || undefined}
              aria-describedby={radiosMal && radios === null ? idRadios : undefined}
              className={cn(campo, 'w-48 text-right', radiosMal && radios === null && 'border-rojo-texto border-2')}
            />
          </label>
          {radiosMal && radios === null && (
            <p id={idRadios} className="text-rojo-texto text-right text-[13px]">
              {T.panelAjustes.radiosInvalidos}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-3">
        <div>
          <Boton disabled={ocupado || !!falta} onClick={() => void guardar()}>
            {T.panel.guardarCambios}
          </Boton>
          {falta && <p className="text-texto-suave mt-1 max-w-64 text-[11px]">{falta}</p>}
        </div>
      </div>
    </Tarjeta>
  );
}

// ---------- núcleos (FR-166) ----------

function Nucleos() {
  const { avisar } = usePanel();
  const { puntos } = usePuntos();
  const carga = useCarga(() => cargarNucleos(), []);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [anadiendo, setAnadiendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const filas = carga.datos ?? [];
  const cuantos = (n: string) => puntos.filter((p) => p.nucleo === n).length;

  async function renombrar(actual: string) {
    setOcupado(true);
    const r = await renombrarNucleo(actual, nombre);
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    setRenombrando(null);
    avisar(T.panelAjustes.nucleoRenombrado(actual, nombre.trim()));
    await carga.recargar();
  }

  return (
    <Tarjeta titulo={T.panelAjustes.nucleos} ayuda={T.panelAjustes.ayudaNucleos}>
      <ul className="text-sm">
        {filas.map((n) => (
          <li key={n.nombre} className="border-linea flex flex-wrap items-center gap-2 border-b py-1.5 last:border-b-0">
            {renombrando === n.nombre ? (
              <>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  aria-label={T.panelAjustes.nombreDe(n.nombre)}
                  className={cn(campo, 'min-w-40 flex-1')}
                />
                <Boton className={cn(toque, 'text-[13px]')} disabled={ocupado} onClick={() => void renombrar(n.nombre)}>
                  {T.panel.guardarCambios}
                </Boton>
                <Boton variante="secundario" className={cn(toque, 'text-[13px]')} onClick={() => setRenombrando(null)}>
                  {T.panelCola.cancelar}
                </Boton>
              </>
            ) : (
              <>
                <span className="flex-1">
                  {n.nombre}
                  <span className="text-texto-suave"> · {T.panelAjustes.nPuntos(cuantos(n.nombre))}</span>
                  {n.manual && <span className="text-texto-suave"> · {T.panelAjustes.anadidoAMano}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRenombrando(n.nombre);
                    setNombre(n.nombre);
                  }}
                  className="min-h-11 px-2 underline min-[1100px]:min-h-8"
                >
                  {T.panelAjustes.renombrar}
                </button>
              </>
            )}
          </li>
        ))}
        <EstadoLista carga={carga} vacio={T.panelAjustes.nucleosVacio} />
      </ul>
      <Boton variante="secundario" className="mt-3" onClick={() => setAnadiendo(true)}>
        {T.panelAjustes.anadirNucleo}
      </Boton>
      {anadiendo && (
        <DialogoNucleo
          alCerrar={() => setAnadiendo(false)}
          alHecho={() => {
            setAnadiendo(false);
            void carga.recargar();
          }}
        />
      )}
    </Tarjeta>
  );
}

function DialogoNucleo({ alCerrar, alHecho }: { alCerrar: () => void; alHecho: () => void }) {
  const { avisar } = usePanel();
  const posicion = usePosicion();
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState<Coordenadas | undefined>();
  const [ocupado, setOcupado] = useState(false);
  const falta = !nombre.trim() ? T.panelAjustes.faltaNombre : !pin ? T.panelAjustes.faltaPosicion : null;

  async function guardar() {
    if (!pin) return;
    setOcupado(true);
    const r = await anadirNucleo(nombre, pin.lat, pin.lng);
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelAjustes.nucleoAnadido(nombre.trim()));
    alHecho();
  }

  return (
    <Dialogo titulo={T.panelAjustes.anadirNucleo} alCerrar={alCerrar}>
      <label className="block text-sm">
        <span className="text-texto-suave text-[13px]">{T.panelAjustes.nombreNucleo}</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={cn(campo, 'mt-1 block w-full')} />
      </label>
      <p className="text-texto-suave mt-2 text-[13px]">{T.panelAjustes.tocaDondeEsta}</p>
      <div className="mt-2">
        <SelectorPin
          pin={pin}
          gps={posicion.tipo === 'ok' ? posicion.posicion : null}
          alMover={setPin}
          etiqueta={T.panelAjustes.pinNucleo}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-3">
        <div>
          <Boton disabled={ocupado || !!falta} onClick={() => void guardar()}>
            {T.panel.anadir}
          </Boton>
          {falta && <p className="text-texto-suave mt-1 max-w-56 text-[11px]">{falta}</p>}
        </div>
        <Boton variante="secundario" onClick={alCerrar}>
          {T.panelCola.cancelar}
        </Boton>
      </div>
    </Dialogo>
  );
}

// ---------- salud del sistema (FR-143, FR-144) ----------

function SaludDelSistema({ marcaEntrada, entradaCambiada }: ConEntrada) {
  const { avisar } = usePanel();
  const carga = useCarga(() => cargarSalud(), [marcaEntrada]);
  const avisarAbierta = useAvisarAbierta();
  const [ocupado, setOcupado] = useState(false);
  const s = carga.datos;
  const [revocando, setRevocando] = useState<string | null>(null);

  // RV-262: revocar el móvil con más fotos pedidas; sus reservas abiertas dejan de contar (RV-220.4).
  async function revocar(dispositivo: string) {
    setOcupado(true);
    try {
      const r = await revocarDispositivo(dispositivo);
      if (!r.ok) return avisar(textoError(r.codigo), 'error');
      setRevocando(null);
      avisar(T.panelAjustes.movilRevocadoAviso(dispositivo));
      await carga.recargar();
    } finally {
      setOcupado(false);
    }
  }

  // RV-338: "abrir la entrada 24 h" junto a las entradas frenadas por el tope.
  async function abrir() {
    setOcupado(true);
    try {
      const r = await abrirEntrada();
      if (!r.ok) return avisar(textoError(r.codigo), 'error');
      avisarAbierta(r.datos);
      entradaCambiada();
    } finally {
      setOcupado(false);
    }
  }

  // docs/33 RV-335 (U13): arriba "Todo bien" o lo que necesita atención; debajo, las filas en palabras.
  const atencion = s ? atencionSalud(s, ENTORNO) : [];
  const filas = s ? filasSalud(s, ENTORNO) : [];
  const tareas = s ? tareasVisibles(s) : [];

  return (
    <Tarjeta titulo={T.panel.saludSistema}>
      {!s ? (
        carga.estado === 'error' ? (
          <ErrorReintentar texto={textoError(carga.codigo)} reintentar={carga.recargar} />
        ) : (
          <p className="text-texto-suave text-sm">{T.panelCola.cargando}</p>
        )
      ) : (
        <>
          {/* Una recarga que falla (tras revocar un móvil, por ejemplo) deja los datos de antes:
              se dice, con Reintentar (UI-04). */}
          {carga.estado === 'error' && (
            <ErrorReintentar
              texto={T.panelRegistro.errorConFilas(textoError(carga.codigo))}
              reintentar={carga.recargar}
              className="mb-3"
            />
          )}
          {/* El resumen no bloquea nada, solo se ve (06 §5). Con el espacio de fotos casi lleno dice
              qué hacer antes de que la aplicación deje de admitir fotos (TR-53). */}
          {/* Con una recarga fallida, los datos de antes no dicen «Todo bien»: el resumen se esconde. */}
          {carga.estado === 'error' ? null : atencion.length === 0 ? (
            <p data-testid="resumen-salud" className="mb-3">
              <span className="bg-tinte-verde text-tinte-verde-texto rounded-full px-2.5 py-0.5 text-[13px] font-semibold ring-1 ring-tinte-verde-borde ring-inset">
                {T.panelAjustes.todoBien}
              </span>
            </p>
          ) : (
            <div
              role="status"
              data-testid="resumen-salud"
              className="bg-tinte-oro border-oro-600 text-tinte-oro-texto rounded-campo mb-3 flex items-start gap-2 border p-2 text-sm"
            >
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">{T.panelAjustes.necesitaAtencion}</p>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {atencion.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <dl className="text-sm">
            {filas.map((f) => (
              <div key={f.etiqueta} className="border-linea flex items-center gap-2 border-b py-1 last:border-b-0">
                <dt className="text-texto-suave flex-1">{f.etiqueta}</dt>
                <dd
                  className={cn(
                    'flex flex-wrap items-center justify-end gap-x-2 text-right font-semibold',
                    f.aviso && 'text-naranja-texto',
                  )}
                  data-aviso={f.aviso || undefined}
                >
                  {f.valor}
                  {f.accion === 'abrirEntrada' && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => void abrir()}
                      className={cn('text-texto font-normal underline disabled:opacity-50', toque)}
                    >
                      {T.panelAjustes.abrirEntrada24h}
                    </button>
                  )}
                  {f.barra != null && (
                    // El valor ya va escrito al lado: la barra es solo para verlo de un vistazo.
                    <span
                      data-testid="barra-espacio"
                      aria-hidden
                      className="bg-linea inline-block h-1.5 w-16 shrink-0 overflow-hidden rounded-full"
                    >
                      <span
                        className={cn('block h-full rounded-full', f.aviso ? 'bg-naranja-600' : 'bg-verde-600')}
                        style={{ width: `${f.barra}%` }}
                      />
                    </span>
                  )}
                </dd>
              </div>
            ))}
            {/* TR-54: la última ejecución de cada tarea de pg_cron, con su nombre en palabras: en vivo
                o, si pg_cron no deja leer, según la anotó la vigilancia (RV-92). El resumen semanal y la
                purga de errores siguen, pero ya no salen aquí (docs/33 RV-335). */}
            <div className="border-linea border-b py-1 last:border-b-0">
              <dt className="text-texto-suave">
                {T.panelAjustes.tareasProgramadas}
                <span className="block text-[13px]" data-testid="origen-tareas">
                  {origenTareas(s)}
                </span>
              </dt>
              <dd>
                {tareas.length ? (
                  <ul className="mt-1" data-testid="tareas-programadas">
                    {tareas.map((t) => (
                      <li key={t.tarea} className="flex flex-wrap gap-x-2">
                        <span className="flex-1 text-[13px]">{nombreTarea(t.tarea)}</span>
                        <span className={cn('font-semibold', t.problema && 'text-rojo-texto')}>
                          {t.falta
                            ? T.panelAjustes.tareaFalta
                            : !t.ultima
                              ? T.panelAjustes.tareaSinEjecutar
                              : t.problema
                                ? T.panelAjustes.tareaMal(hace(t.ultima))
                                : T.panelAjustes.tareaBien(hace(t.ultima))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="font-semibold">{T.panelAjustes.sinDato}</span>
                )}
              </dd>
            </div>
            {/* RV-262: los móviles con más fotos pedidas en 24 h (0041), para poder revocar uno. Con
                una base anterior la clave no viene y la fila no se dibuja (UI-01). */}
            {s.reservas_dispositivos_24h && (
              <div className="border-linea border-b py-1 last:border-b-0">
                <dt className="text-texto-suave">{T.panelAjustes.reservasPorMovil}</dt>
                <dd>
                  {s.reservas_dispositivos_24h.length ? (
                    <ul className="mt-1" data-testid="reservas-moviles">
                      {s.reservas_dispositivos_24h.map((d) => (
                        <li key={d.dispositivo} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
                          <span className="font-datos text-[13px]">{d.dispositivo}</span>
                          <span className="flex-1 font-semibold">
                            {T.panelAjustes.reservasDetalle(d.reservas, d.abiertas)}
                          </span>
                          {d.revocado ? (
                            <span className="text-texto-suave text-[13px]">{T.panelAjustes.movilRevocado}</span>
                          ) : (
                            <Boton
                              variante="secundario"
                              className={cn(toque, 'text-[13px]')}
                              aria-label={T.panelAjustes.revocarMovilDe(d.dispositivo)}
                              onClick={() => setRevocando(d.dispositivo)}
                            >
                              {T.panelAjustes.revocarMovil}
                            </Boton>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-[13px]">{T.panelAjustes.reservasVacio}</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </>
      )}
      {revocando && (
        <Dialogo titulo={T.panelAjustes.revocarMovil} alCerrar={() => !ocupado && setRevocando(null)}>
          <p className="text-sm">{T.panelAjustes.avisoRevocarMovil(revocando)}</p>
          <div className="mt-3 flex gap-3">
            <Boton variante="destructivo" disabled={ocupado} onClick={() => void revocar(revocando)}>
              {T.panelAjustes.confirmarRevocarMovil}
            </Boton>
            <Boton variante="secundario" disabled={ocupado} onClick={() => setRevocando(null)}>
              {T.panelCola.cancelar}
            </Boton>
          </div>
        </Dialogo>
      )}
    </Tarjeta>
  );
}

// ---------- mantenimiento (FR-144, FR-165, FL-33) ----------

// Solo se dibuja lo que existe (UI-01): cada uno de estos cuatro tiene su workflow, y una prueba de
// /api/lanzar-workflow comprueba que sigue siendo así (DEC-080).
const TRABAJOS: { workflow: Workflow; nombre: string }[] = (Object.keys(NOMBRE_TRABAJO) as Workflow[]).map((w) => ({
  workflow: w,
  nombre: NOMBRE_TRABAJO[w],
}));
const SOLO_PRODUCCION = new Set<Workflow>(['purgar-fotos', 'respaldo']);

function Mantenimiento() {
  const { avisar } = usePanel();
  const [ocupado, setOcupado] = useState(false);
  // Se vuelve a leer cada minuto: el despachador marca lanzado o error al rato (RV-260).
  const pedidos = useCarga(() => cargarPedidos(), [], 60_000);

  const idSolo = useId();
  // Purgar fotos y el respaldo trabajan contra producción: fuera de ella no se piden (RV-167). Sin VITE_ENTORNO
  // cuenta como fuera de producción (lib/entorno: 'local').
  const soloEnProduccion = TRABAJOS.filter((t) => SOLO_PRODUCCION.has(t.workflow) && ENTORNO !== 'produccion');

  async function lanzar(w: Workflow, nombre: string) {
    setOcupado(true);
    try {
      const r = await lanzarWorkflow(w);
      if (!r.ok) return avisar(textoError(r.codigo), 'error');
      // En staging nadie lo despacha: el aviso lo dice en vez de prometer que empezará (RV-260).
      avisar(avisoPedido(nombre, r.datos));
      await pedidos.recargar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta titulo={T.panelAjustes.mantenimiento} ayuda={T.panelAjustes.ayudaMantenimiento}>
      <div className="flex flex-wrap items-start gap-3">
        {TRABAJOS.map((t) => {
          const soloProduccion = soloEnProduccion.includes(t);
          return (
            <Boton
              key={t.workflow}
              variante="secundario"
              disabled={ocupado || soloProduccion}
              aria-describedby={soloProduccion ? idSolo : undefined}
              onClick={() => void lanzar(t.workflow, t.nombre)}
            >
              {t.nombre}
            </Boton>
          );
        })}
      </div>
      {/* Una sola línea con los botones que solo van en producción, que la tienen de descripción (docs/38 RV-509). */}
      {soloEnProduccion.length > 0 && (
        <p id={idSolo} className="text-texto-suave mt-1 text-[13px]">
          {T.panelAjustes.soloEnProduccion(T.panel.purgarFotos, T.panel.respaldoAhora)}
        </p>
      )}
      {/* RV-260: lo que se ha pedido y qué ha pasado (fn_pedidos_recientes, 0041). */}
      <h3 className="mt-4 text-sm font-semibold">{T.panelAjustes.pedidosRecientes}</h3>
      <ul className="mt-1 text-sm" data-testid="pedidos-recientes">
        {(pedidos.datos ?? []).map((p) => (
          <li key={p.id} className="border-linea flex flex-wrap gap-x-2 border-b py-1 last:border-b-0">
            <span className="flex-1">
              {NOMBRE_TRABAJO[p.workflow] ?? p.workflow}
              <span className="text-texto-suave"> · {hace(p.pedido_en)}</span>
            </span>
            {/* El estado con su etiqueta y, con error, el motivo detrás (docs/38 RV-509). */}
            <span className="flex items-center gap-1.5 [overflow-wrap:anywhere]" data-estado={p.estado}>
              <EtiquetaPedido estado={p.estado} />
              {motivoPedido(p) && <span className="text-texto-suave text-[13px]">{motivoPedido(p)}</span>}
            </span>
          </li>
        ))}
        {pedidos.estado === 'cargando' && !pedidos.datos?.length && (
          <li className="text-texto-suave text-[13px]">{T.panelCola.cargando}</li>
        )}
        {pedidos.estado === 'ok' && !pedidos.datos.length && (
          <li className="text-texto-suave text-[13px]">{T.panelAjustes.pedidosVacio}</li>
        )}
      </ul>
      {/* El error, fuera de la lista (un aviso no es un elemento de ella) y con Reintentar. */}
      {pedidos.estado === 'error' && (
        <ErrorReintentar texto={textoError(pedidos.codigo)} reintentar={pedidos.recargar} className="mt-1" />
      )}
    </Tarjeta>
  );
}

// ---------- avisos para jefatura (FR-164, FL-34) ----------

const TEMAS: { tema: TemaJefatura; nombre: string; detalle: string }[] = [
  { tema: 'nuevas_propuestas', nombre: T.panelAjustes.nuevasPropuestas, detalle: T.panelAjustes.agrupadas },
  { tema: 'resumen_semanal', nombre: T.panelAjustes.resumenSemanal, detalle: T.panelAjustes.losLunes },
  // docs/35 RV-433 (DEC-202).
  { tema: 'avisos_tecnicos', nombre: T.panelAjustes.avisosTecnicos, detalle: T.panelAjustes.avisosTecnicosDetalle },
];

function AvisosJefatura() {
  const { avisar } = usePanel();
  // Los temas de este administrador en este navegador, preguntados al servidor (docs/32 RV-264).
  // `cambiados`: lo que ha quedado tras tocar una casilla, hasta la siguiente lectura.
  const carga = useCarga(() => cargarTemas(), []);
  const [cambiados, setCambiados] = useState<TemaJefatura[] | null>(null);
  const temas = cambiados ?? carga.datos ?? [];
  const [ocupado, setOcupado] = useState(false);
  const estado = estadoPushJefatura();

  async function cambiar(tema: TemaJefatura, activo: boolean) {
    const siguientes = activo ? [...new Set([...temas, tema])] : temas.filter((t) => t !== tema);
    setOcupado(true);
    // Las casillas vuelven a responder pase lo que pase, y un fallo se dice (docs/31 RV-167).
    try {
      const r = await fijarTemas(siguientes, { antes: temas });
      setCambiados(r.temas);
      if (!r.ok) avisar(activo ? T.panelAjustes.avisosNoActivados : T.panelAjustes.avisosNoCambiados, 'error');
    } catch (e) {
      anotarError(e);
      avisar(T.panelErrores.generico, 'error');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta titulo={T.panelAjustes.avisosJefatura} ayuda={T.panelAjustes.ayudaAvisos}>
      {estado !== 'listo' ? (
        <p className="text-texto-suave text-sm">
          {estado === 'denegado'
            ? T.panelAjustes.avisosDenegados
            : estado === 'instalar_primero'
              ? T.panelAjustes.avisosInstalar
              : T.panelAjustes.avisosNoDisponibles}
        </p>
      ) : carga.estado === 'error' && !cambiados ? (
        // Sin saber qué tiene activo, no se enseñan casillas que podrían mentir (RV-264, UI-04).
        <ErrorReintentar
          texto={textoError(carga.codigo)}
          reintentar={async () => {
            setCambiados(null);
            await carga.recargar();
          }}
        />
      ) : carga.estado === 'cargando' && !cambiados ? (
        <p className="text-texto-suave text-sm">{T.panelCola.cargando}</p>
      ) : (
        <ul className="text-sm">
          {TEMAS.map((t) => (
            <li key={t.tema} className="border-linea flex items-center gap-3 border-b py-2 last:border-b-0">
              <div className="flex-1">
                <p>{t.nombre}</p>
                <p className="text-texto-suave text-[13px]">{t.detalle}</p>
              </div>
              <label className="flex size-11 shrink-0 items-center justify-center min-[1100px]:size-auto">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={temas.includes(t.tema)}
                  disabled={ocupado}
                  onChange={(e) => void cambiar(t.tema, e.target.checked)}
                  aria-label={t.nombre}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

// ---------- novedades (FR-167) ----------

function Novedades() {
  const carga = useCarga(() => cargarNovedades(), []);
  const filas = carga.datos ?? [];
  return (
    <Tarjeta titulo={T.panelAjustes.novedades} ayuda={T.panelAjustes.ayudaNovedades}>
      {!filas.length ? (
        <p className="text-texto-suave text-sm">
          {carga.estado === 'cargando' ? T.panelCola.cargando : T.panelAjustes.sinNovedades}
        </p>
      ) : (
        <ul className="text-sm">
          {filas.slice(0, 3).map((n) => (
            <li key={`${n.version}-${n.texto}`} className="py-0.5">
              <strong className="font-datos">{n.version}</strong> · {n.texto}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
