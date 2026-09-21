import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CodigoQR } from './CodigoQR';
import { Dialogo } from './Dialogo';
import { usePanel } from './usar-panel';
import { Boton } from '@/componentes/Boton';
import { SelectorPin } from '@/componentes/operaciones/SelectorPin';
import { useCarga } from '@/hooks/carga';
import { usePosicion, usePuntos } from '@/hooks/estado';
import { fechaCorta, hace, megas } from '@/lib/formato';
import { textoError } from '@/lib/panel/errores';
import {
  type ClaveParametro,
  type Parametros,
  type Workflow,
  PARAMETROS,
  PARAMETROS_POR_DEFECTO,
  anadirNucleo,
  cambiarCodigo,
  cambiosParametros,
  cargarAdministradores,
  cargarCodigo,
  cargarNovedades,
  cargarNucleos,
  cargarParametros,
  avisoAlmacenamiento,
  cargarSalud,
  contarDispositivos,
  descargarInventarioJson,
  faltaEnParametros,
  generarCodigo,
  gestionarAdministrador,
  guardarParametros,
  lanzarWorkflow,
  renombrarNucleo,
  sugerenciasUniformidad,
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
  const [moviles, setMoviles] = useState(0);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void contarDispositivos().then(setMoviles);
  }, []);

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
    await carga.recargar();
  }

  const datos = carga.datos;
  return (
    <Tarjeta
      titulo={T.panelAjustes.codigoAcceso}
      ayuda={
        datos?.cambiadoEn
          ? T.panelAjustes.cambiadoPor(fechaCorta(datos.cambiadoEn), datos.cambiadoPor ?? '—', moviles)
          : T.panelAjustes.sinCambios(moviles)
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <output
          className={cn(campo, 'font-datos flex min-w-32 items-center bg-[var(--fondo)] text-lg tracking-[0.3em]')}
        >
          {visible ? (datos?.codigo ?? '—') : '••••••'}
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
          <p className="text-sm">{revocar ? T.panelAjustes.avisoRevocando(moviles) : T.panelAjustes.avisoSinRevocar}</p>
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
              <span className={cn('text-[13px]', a.activo ? 'text-verde-600' : 'text-texto-suave')}>
                {a.activo ? T.panelAjustes.activo : T.panelAjustes.sinAcceso}
              </span>
            </label>
          </li>
        ))}
        {!filas.length && <li className="text-texto-suave text-[13px]">{T.panelCola.cargando}</li>}
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
};

function ParametrosTarjeta() {
  const { avisar } = usePanel();
  const carga = useCarga(() => cargarParametros(), []);
  // Lo editado manda mientras jefatura esté escribiendo; si no, lo que hay guardado.
  const [editado, setEditado] = useState<Parametros | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const guardados = carga.datos ?? PARAMETROS_POR_DEFECTO;
  const v = editado ?? guardados;
  const setV = (cambio: (x: Parametros) => Parametros) => setEditado(cambio(v));

  const cambios = useMemo(() => cambiosParametros(guardados, v), [guardados, v]);
  const invalido = faltaEnParametros(v);
  const falta = invalido
    ? T.panelAjustes.fueraDeRango(NOMBRE_PARAMETRO[invalido as ClaveParametro] ?? T.panelAjustes.radiosMarcador)
    : !Object.keys(cambios).length
      ? T.avisosFormulario.sinCambios
      : null;

  async function guardar() {
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
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(PARAMETROS) as ClaveParametro[]).map((clave) => (
          <label key={clave} className="flex items-center gap-2 text-sm">
            <span className="text-texto-suave flex-1">{NOMBRE_PARAMETRO[clave]}</span>
            <input
              type="number"
              value={v[clave]}
              onChange={(e) => setV((x) => ({ ...x, [clave]: Number(e.target.value) }))}
              className={cn(campo, 'w-24 text-right')}
            />
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <span className="text-texto-suave flex-1">{T.panelAjustes.radiosMarcador}</span>
          <input
            value={v.escala_radios.join(' · ')}
            onChange={(e) =>
              setV((x) => ({
                ...x,
                escala_radios: e.target.value
                  .split(/[^0-9.,]+/)
                  .filter(Boolean)
                  .map((n) => Number(n.replace(',', '.'))),
              }))
            }
            aria-label={T.panelAjustes.radiosMarcador}
            className={cn(campo, 'w-40 text-right')}
          />
        </label>
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
        {!filas.length && <li className="text-texto-suave text-[13px]">{T.panelCola.cargando}</li>}
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

  const filas: [string, string][] = s
    ? [
        [T.panelAjustes.pendientes14, String(s.pendientes_14d)],
        [T.panelAjustes.incidenciasAbiertas, String(s.incidencias_abiertas)],
        [T.panelAjustes.errores7, String(s.errores_7d)],
        [T.panelAjustes.sinDireccion, String(s.sin_direccion)],
        [
          T.panelAjustes.ultimoRespaldo,
          s.ultimo_respaldo ? `${hace(s.ultimo_respaldo)} · ${fechaCorta(s.ultimo_respaldo)}` : T.panelAjustes.nunca,
        ],
        [T.panelAjustes.almacenamiento, s.storage_bytes ? `${megas(s.storage_bytes)} MB` : T.panelAjustes.sinDato],
        [
          T.panelAjustes.zonaYMapa,
          `${s.version_zona ?? T.panelAjustes.sinDato} · ${s.version_mapabase ?? T.panelAjustes.sinDato}`,
        ],
        [
          T.panelAjustes.ultimaVigilancia,
          s.ultima_vigilancia
            ? `${hace(s.ultima_vigilancia)} · ${s.vigilancia_ok ? T.panelAjustes.vigilanciaBien : T.panelAjustes.vigilanciaMal}`
            : T.panelAjustes.nunca,
        ],
        [T.panelAjustes.dispositivosActivos, String(s.dispositivos_activos)],
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
            {filas.map(([k, valor]) => (
              <div key={k} className="border-linea flex gap-2 border-b py-1 last:border-b-0">
                <dt className="text-texto-suave flex-1">{k}</dt>
                <dd className="font-semibold">{valor}</dd>
              </div>
            ))}
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

// Solo se dibuja lo que existe (UI-01): la purga de fotos llega con su workflow más adelante en la
// Fase 8, así que su botón todavía no está.
const TRABAJOS: { workflow: Workflow; nombre: string }[] = [
  { workflow: 'regenerar-zona', nombre: T.panel.regenerarZona },
  { workflow: 'regenerar-mapabase', nombre: T.panel.regenerarMapaBase },
  { workflow: 'respaldo', nombre: T.panel.respaldoAhora },
];

function Mantenimiento() {
  const { avisar } = usePanel();
  const [ocupado, setOcupado] = useState(false);

  async function lanzar(w: Workflow, nombre: string) {
    setOcupado(true);
    const r = await lanzarWorkflow(w);
    setOcupado(false);
    if (!r.ok) return avisar(textoError(r.codigo), 'error');
    avisar(T.panelAjustes.trabajoLanzado(nombre));
  }

  return (
    <Tarjeta titulo={T.panelAjustes.mantenimiento} ayuda={T.panelAjustes.ayudaMantenimiento}>
      <div className="flex flex-wrap gap-3">
        {TRABAJOS.map((t) => (
          <Boton
            key={t.workflow}
            variante="secundario"
            disabled={ocupado}
            onClick={() => void lanzar(t.workflow, t.nombre)}
          >
            {t.nombre}
          </Boton>
        ))}
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
    const quedan = await fijarTemas(siguientes);
    setOcupado(false);
    setTemas(quedan);
    if (activo && !quedan.includes(tema)) avisar(T.panelAjustes.avisosNoActivados, 'error');
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
