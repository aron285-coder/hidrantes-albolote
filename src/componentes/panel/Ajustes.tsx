import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { CodigoQR } from './CodigoQR';
import { Dialogo } from './Dialogo';
import { ErrorReintentar } from './dialogos';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { SelectorPin } from '@/componentes/operaciones/SelectorPin';
import { useCarga } from '@/hooks/carga';
import { usePosicion, usePuntos } from '@/hooks/estado';
import { ENTORNO } from '@/lib/entorno';
import { anotarError } from '@/lib/errores';
import { fechaCorta, hace, megas } from '@/lib/formato';
import { textoError } from '@/lib/panel/errores';
import {
  type ClaveParametro,
  type Parametros,
  type Workflow,
  CUOTA_BD_BYTES,
  PARAMETROS,
  PARAMETROS_POR_DEFECTO,
  anadirNucleo,
  avisoPedido,
  cambiarCodigo,
  cambiosParametros,
  cargarAdministradores,
  cargarCodigo,
  cargarNovedades,
  cargarNucleos,
  cargarParametros,
  avisoAlmacenamiento,
  cargarSalud,
  origenTareas,
  textoAlmacenamiento,
  vigilanciaAtrasada,
  contarDispositivos,
  descargarInventarioJson,
  faltaEnParametros,
  generarCodigo,
  gestionarAdministrador,
  guardarParametros,
  lanzarWorkflow,
  leerRadios,
  renombrarNucleo,
  sugerenciasUniformidad,
  textoRadios,
} from '@/lib/panel/ajustes';
import { type TemaJefatura, estadoPushJefatura, fijarTemas, temasActivos } from '@/lib/panel/push-jefatura';
import type { Coordenadas } from '@/lib/propuestas';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

const campo = 'border-linea rounded-campo min-h-9 border px-2';

function Tarjeta({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="border-linea bg-papel rounded-tarjeta border p-4">
      <h2 className="font-titulo text-[17px] font-semibold">{titulo}</h2>
      {ayuda && <p className="text-texto-suave mt-0.5 mb-2 text-[13px]">{ayuda}</p>}
      <div className={ayuda ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

/** Ajustes del panel (FR-140–FR-145, FR-162–FR-167; FL-29–FL-31, FL-33, FL-34). */
export default function Ajustes() {
  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-2">
      <CodigoDeAcceso />
      <SaludDelSistema />
      <Administradores />
      <ParametrosTarjeta />
      <Nucleos />
      <Mantenimiento />
      <AvisosJefatura />
      <Tarjeta titulo={T.panelAjustes.codigoQr} ayuda={T.panelAjustes.ayudaQr}>
        <CodigoQR />
      </Tarjeta>
      <Novedades />
    </div>
  );
}

// ---------- código de acceso (FR-140, FL-29) ----------

function CodigoDeAcceso() {
  const { avisar } = usePanel();
  const carga = useCarga(() => cargarCodigo(), []);
  const [visible, setVisible] = useState(false);
  const [revocar, setRevocar] = useState(false);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  // Cuántos móviles tienen acceso; null si no se ha podido saber (docs/32 RV-261): entonces no se
  // dice ningún número, y la ventana de revocar avisa de que no se sabe, sin impedir seguir.
  const cuenta = useCarga(() => contarDispositivos(), []);
  const moviles = cuenta.estado === 'error' ? null : cuenta.datos;
  const [ocupado, setOcupado] = useState(false);

  async function generar() {
    const nuevo = generarCodigo();
    setConfirmar(nuevo);
  }

  async function aplicar(nuevo: string) {
    setOcupado(true);
    const r = await cambiarCodigo(nuevo, revocar);
    setOcupado(false);
    setConfirmar(null);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    setVisible(true);
    avisar(T.panelAjustes.codigoCambiado(nuevo));
    await Promise.all([carga.recargar(), cuenta.recargar()]);
  }

  const datos = carga.datos;
  const fecha = datos?.cambiadoEn ? fechaCorta(datos.cambiadoEn) : null;
  const ayuda =
    moviles === null
      ? fecha
        ? T.panelAjustes.cambiadoPorSinCuenta(fecha, datos?.cambiadoPor ?? '—')
        : T.panelAjustes.sinCambiosSinCuenta
      : fecha
        ? T.panelAjustes.cambiadoPor(fecha, datos?.cambiadoPor ?? '—', moviles)
        : T.panelAjustes.sinCambios(moviles);
  return (
    <Tarjeta titulo={T.panelAjustes.codigoAcceso} ayuda={ayuda}>
      {/* El código que no se ha podido leer se dice, con Reintentar; nunca «—» (docs/32 RV-261). */}
      {carga.estado === 'error' && !datos ? (
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
            className="text-texto-suave flex min-h-9 items-center gap-1 px-2 underline"
          >
            {visible ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            {visible ? T.panelAjustes.ocultar : T.panelAjustes.ver}
          </button>
        </div>
      )}
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={revocar} onChange={(e) => setRevocar(e.target.checked)} />
        {T.panel.revocarTodos}
      </label>
      <Boton className="mt-3" disabled={ocupado} onClick={() => void generar()}>
        {T.panel.generarNuevo}
      </Boton>
      <p className="text-texto-suave mt-2 text-[13px]">
        {revocar ? T.panelAjustes.explicaRevocando : T.panelAjustes.explicaSinRevocar}
      </p>

      {confirmar && (
        <Dialogo titulo={T.panel.generarNuevo} alCerrar={() => setConfirmar(null)}>
          <p className="text-sm">
            {!revocar
              ? T.panelAjustes.avisoSinRevocar
              : moviles === null
                ? T.panelAjustes.avisoRevocandoSinCuenta
                : T.panelAjustes.avisoRevocando(moviles)}
          </p>
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
  const [reintentando, setReintentando] = useState(false);
  const hay = !!carga.datos?.length;
  async function reintentar() {
    setReintentando(true);
    try {
      await carga.recargar();
    } finally {
      setReintentando(false);
    }
  }
  if (carga.estado === 'error')
    return (
      <li role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[13px]">
        <span className="min-w-0 flex-1">{textoError(carga.codigo ?? '')}</span>
        {/* Mientras reintenta, dice «Cargando…»: si vuelve a fallar, se ve que lo ha intentado. */}
        <Boton
          variante="secundario"
          className="min-h-9 text-[13px]"
          disabled={reintentando}
          onClick={() => void reintentar()}
        >
          {reintentando ? T.panelCola.cargando : T.mapa.reintentar}
        </Boton>
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
  const filas = carga.datos ?? [];

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

  const nuevos = sugerencias.filter((s) => !filas.some((a) => a.email === s));
  return (
    <Tarjeta titulo={T.panelAjustes.administradores} ayuda={T.panelAjustes.ayudaAdministradores}>
      <ul className="text-sm">
        {filas.map((a) => (
          <li key={a.email} className="border-linea flex flex-wrap items-center gap-2 border-b py-1.5 last:border-b-0">
            <span className="min-w-52 flex-1">{a.email}</span>
            <span className="text-texto-suave text-[13px]">
              {T.panelAjustes.anadidoEl(fechaCorta(a.creado_en), a.creado_por)}
            </span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={a.activo}
                disabled={ocupado}
                onChange={(e) => void cambiar(a.email, e.target.checked)}
                aria-label={T.panelAjustes.accesoDe(a.email)}
              />
              <span className={cn('text-[13px]', a.activo ? 'text-verde-texto' : 'text-texto-suave')}>
                {a.activo ? T.panelAjustes.activo : T.panelAjustes.sinAcceso}
              </span>
            </label>
          </li>
        ))}
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
        <Boton disabled={ocupado || !correo.includes('@')} onClick={() => void cambiar(correo, true)}>
          {T.panel.anadir}
        </Boton>
      </div>
      {nuevos.length > 0 && (
        <p className="text-texto-suave mt-2 flex flex-wrap items-center gap-2 text-[13px]">
          {T.panelAjustes.sugerencias}
          {nuevos.slice(0, 5).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCorreo(s)}
              className="border-linea rounded-chip border px-2 py-0.5"
            >
              {s}
            </button>
          ))}
        </p>
      )}
    </Tarjeta>
  );
}

// ---------- parámetros (FR-142, FL-31) ----------

const NOMBRE_PARAMETRO: Record<ClaveParametro, string> = {
  meses_revision: T.panelAjustes.mesesRevision,
  radio_duplicado_m: T.panelAjustes.radioDuplicado,
  dias_papelera: T.panelAjustes.diasPapelera,
  buffer_zona_m: T.panelAjustes.bufferZona,
  max_subidas_dispositivo_dia: T.panelAjustes.subidasDia,
  metros_tramo_manguera: T.panelAjustes.metrosTramo,
};

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
  const guardados = carga.datos;
  const sinCargar = !guardados;
  const fallo = sinCargar && carga.estado === 'error' ? textoError(carga.codigo) : null;
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
        {(Object.keys(PARAMETROS) as ClaveParametro[]).map((clave) => (
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
                <Boton className="min-h-9 text-[13px]" disabled={ocupado} onClick={() => void renombrar(n.nombre)}>
                  {T.panel.guardarCambios}
                </Boton>
                <Boton variante="secundario" className="min-h-9 text-[13px]" onClick={() => setRenombrando(null)}>
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
                  className="min-h-8 px-2 underline"
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

function SaludDelSistema() {
  const { avisar } = usePanel();
  const carga = useCarga(() => cargarSalud(), []);
  const [ocupado, setOcupado] = useState(false);
  const s = carga.datos;
  const lleno = avisoAlmacenamiento(s?.storage_bytes ?? null);

  async function descargar() {
    setOcupado(true);
    const r = await descargarInventarioJson();
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelAjustes.inventarioDescargado(r.datos));
  }

  // La tercera columna marca en tono de aviso una fila que pide atención (RV-93).
  const filas: [string, string, boolean?][] = s
    ? [
        [T.panelAjustes.pendientes14, String(s.pendientes_14d)],
        [T.panelAjustes.errores7, String(s.errores_7d)],
        [T.panelAjustes.sinDireccion, String(s.sin_direccion)],
        [
          T.panelAjustes.ultimoRespaldo,
          s.ultimo_respaldo
            ? `${hace(s.ultimo_respaldo)} · ${fechaCorta(s.ultimo_respaldo)}`
            : ENTORNO === 'staging'
              ? T.panelAjustes.respaldoNoAplica
              : T.panelAjustes.nunca,
        ],
        [T.panelAjustes.almacenamiento, textoAlmacenamiento(s.storage_bytes, ENTORNO)],
        [
          T.panelAjustes.zonaYMapa,
          `${s.version_zona ?? T.panelAjustes.sinDato} · ${s.version_mapabase ?? T.panelAjustes.sinDato}`,
        ],
        [T.panelAjustes.callejero, s.version_callejero ?? T.panelAjustes.sinDato],
        [
          T.panelAjustes.ultimaVigilancia,
          s.ultima_vigilancia
            ? [
                hace(s.ultima_vigilancia),
                s.vigilancia_ok ? T.panelAjustes.vigilanciaBien : T.panelAjustes.vigilanciaMal,
              ]
                .concat(vigilanciaAtrasada(s.ultima_vigilancia) ? [T.panelAjustes.vigilanciaAtrasada] : [])
                .join(' · ')
            : T.panelAjustes.nunca,
          vigilanciaAtrasada(s.ultima_vigilancia),
        ],
        [T.panelAjustes.dispositivosActivos, String(s.dispositivos_activos)],
        [
          T.panelAjustes.baseDeDatos,
          s.bd_bytes != null
            ? T.panelAjustes.baseDeDatosDetalle(megas(s.bd_bytes), megas(CUOTA_BD_BYTES))
            : T.panelAjustes.sinDato,
        ],
        [T.panelAjustes.intentosFallidos24h, String(s.intentos_fallidos_24h ?? 0)],
        [
          T.panelAjustes.topesAlcanzados24h,
          T.panelAjustes.topesDetalle(s.topes_alcanzados_24h ?? 0, s.topes_globales_24h ?? 0),
        ],
      ]
    : [];

  return (
    <Tarjeta titulo={T.panel.saludSistema}>
      {!s ? (
        <p className="text-texto-suave text-sm">
          {carga.estado === 'error' ? textoError(carga.codigo) : T.panelCola.cargando}
        </p>
      ) : (
        <>
          {/* Cuando el gigabyte gratuito va lleno, avisa con tiempo: el día que se llene, la
              aplicación deja de admitir fotos (TR-53). No bloquea nada, solo se ve (06 §5). */}
          {lleno != null && (
            <p
              role="status"
              className="bg-oro-100 border-oro-600 text-ambar-700 rounded-campo mb-3 flex items-start gap-2 border p-2 text-sm"
            >
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>{T.panelAjustes.almacenamientoLleno(lleno)}</span>
            </p>
          )}
          <dl className="text-sm">
            {filas.map(([k, valor, aviso]) => (
              <div key={k} className="border-linea flex gap-2 border-b py-1 last:border-b-0">
                <dt className="text-texto-suave flex-1">{k}</dt>
                <dd className={cn('font-semibold', aviso && 'text-naranja-texto')} data-aviso={aviso || undefined}>
                  {valor}
                </dd>
              </div>
            ))}
            {/* TR-54: la última ejecución de cada tarea de pg_cron: en vivo o, si pg_cron no deja leer,
                según la anotó la vigilancia; debajo del título se dice cuál (RV-92). */}
            <div className="border-linea border-b py-1 last:border-b-0">
              <dt className="text-texto-suave">
                {T.panelAjustes.tareasProgramadas}
                <span className="block text-[13px]" data-testid="origen-tareas">
                  {origenTareas(s)}
                </span>
              </dt>
              <dd>
                {s.tareas?.length ? (
                  <ul className="mt-1" data-testid="tareas-programadas">
                    {s.tareas.map((t) => (
                      <li key={t.tarea} className="flex gap-2">
                        <span className="font-datos flex-1 text-[13px]">{t.tarea.replace(/^hidrantes_/, '')}</span>
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
          </dl>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <Boton variante="secundario" disabled={ocupado} onClick={() => void descargar()}>
          {T.panel.descargarInventario}
        </Boton>
      </div>
    </Tarjeta>
  );
}

// ---------- mantenimiento (FR-144, FR-165, FL-33) ----------

// Solo se dibuja lo que existe (UI-01): cada uno de estos cuatro tiene su workflow, y una prueba de
// /api/lanzar-workflow comprueba que sigue siendo así (DEC-080).
const TRABAJOS: { workflow: Workflow; nombre: string }[] = [
  { workflow: 'purgar-fotos', nombre: T.panel.purgarFotos },
  { workflow: 'regenerar-zona', nombre: T.panel.regenerarZona },
  { workflow: 'regenerar-mapabase', nombre: T.panel.regenerarMapaBase },
  { workflow: 'respaldo', nombre: T.panel.respaldoAhora },
];
const SOLO_PRODUCCION = new Set<Workflow>(['purgar-fotos', 'respaldo']);

function Mantenimiento() {
  const { avisar } = usePanel();
  const [ocupado, setOcupado] = useState(false);

  const idSolo = useId();

  async function lanzar(w: Workflow, nombre: string) {
    setOcupado(true);
    try {
      const r = await lanzarWorkflow(w);
      if (!r.ok) return avisar(textoError(r.codigo), 'error');
      // En staging nadie lo despacha: el aviso lo dice en vez de prometer que empezará (RV-260).
      avisar(avisoPedido(nombre, r.datos));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta titulo={T.panelAjustes.mantenimiento} ayuda={T.panelAjustes.ayudaMantenimiento}>
      <div className="flex flex-wrap items-start gap-3">
        {TRABAJOS.map((t) => {
          // Purgar fotos y el respaldo trabajan contra producción: fuera de ella no se piden (RV-167).
          // Sin VITE_ENTORNO cuenta como fuera de producción (lib/entorno: 'local').
          const soloProduccion = SOLO_PRODUCCION.has(t.workflow) && ENTORNO !== 'produccion';
          return (
            <div key={t.workflow} className="flex flex-col items-start gap-0.5">
              <Boton
                variante="secundario"
                disabled={ocupado || soloProduccion}
                aria-describedby={soloProduccion ? `${idSolo}-${t.workflow}` : undefined}
                onClick={() => void lanzar(t.workflow, t.nombre)}
              >
                {t.nombre}
              </Boton>
              {soloProduccion && (
                <p id={`${idSolo}-${t.workflow}`} className="text-texto-suave text-[11px]">
                  {T.panelAjustes.soloEnProduccion}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}

// ---------- avisos para jefatura (FR-164, FL-34) ----------

const TEMAS: { tema: TemaJefatura; nombre: string; detalle: string }[] = [
  { tema: 'nuevas_propuestas', nombre: T.panelAjustes.nuevasPropuestas, detalle: T.panelAjustes.agrupadas },
  { tema: 'resumen_semanal', nombre: T.panelAjustes.resumenSemanal, detalle: T.panelAjustes.losLunes },
];

function AvisosJefatura() {
  const { avisar } = usePanel();
  const [temas, setTemas] = useState<TemaJefatura[]>(temasActivos);
  const [ocupado, setOcupado] = useState(false);
  const estado = estadoPushJefatura();

  async function cambiar(tema: TemaJefatura, activo: boolean) {
    const siguientes = activo ? [...new Set([...temas, tema])] : temas.filter((t) => t !== tema);
    setOcupado(true);
    // Las casillas vuelven a responder pase lo que pase, y un fallo se dice (docs/31 RV-167).
    try {
      const r = await fijarTemas(siguientes);
      setTemas(r.temas);
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
      ) : (
        <ul className="text-sm">
          {TEMAS.map((t) => (
            <li key={t.tema} className="border-linea flex items-center gap-3 border-b py-2 last:border-b-0">
              <div className="flex-1">
                <p>{t.nombre}</p>
                <p className="text-texto-suave text-[13px]">{t.detalle}</p>
              </div>
              <input
                type="checkbox"
                className="size-5"
                checked={temas.includes(t.tema)}
                disabled={ocupado}
                onChange={(e) => void cambiar(t.tema, e.target.checked)}
                aria-label={t.nombre}
              />
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
