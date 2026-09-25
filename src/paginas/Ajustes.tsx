import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Boton } from '@/componentes/Boton';
import { Hoja } from '@/componentes/Hoja';
import { SelectorCapas } from '@/componentes/mapa/SelectorCapas';
import { useAcceso, useConexion, useInstalar, useMapabase, usePuntos } from '@/hooks/estado';
import { instalar } from '@/lib/instalar';
import { useReloj } from '@/hooks/reloj';
import { type Capa, NOMBRE_CAPA, capaGuardada, guardarCapa } from '@/lib/capas';
import { leer } from '@/lib/almacen';
import { reintentarAhora } from '@/lib/conexion';
import { fechaCorta, hace, megas } from '@/lib/formato';
import { descargarMapabase, hayVersionNuevaMapabase } from '@/lib/mapabase';
import { useVersionNueva } from '@/hooks/version';
import { useCola, useMisPropuestas } from '@/hooks/cola';
import {
  type EstadoPush,
  type MotivoPush,
  activarPush,
  desactivarPush,
  estadoPush,
  sePuedeReintentar,
  textoMotivoPush,
} from '@/lib/push';
import { cambiarFirma, cerrarSesionVoluntario, salirDeGoogle } from '@/lib/acceso';
import { VERSION } from '@/lib/entorno';
import { recargar } from '@/lib/pwa';
import { type Tema, guardarTema, leerTema } from '@/lib/tema';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';
import { NOVEDADES, hayNovedadesSinVer, marcarNovedadesVistas } from '@/lib/novedades';

function Fila({ titulo, detalle, children }: { titulo: ReactNode; detalle?: ReactNode; children?: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={typeof titulo === 'string' ? titulo : undefined}
      className="bg-papel border-linea rounded-tarjeta flex min-h-12 items-center gap-2 border px-3 py-1.5"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[15px]">{titulo}</div>
        {detalle && <div className="text-texto-suave text-[13px]">{detalle}</div>}
      </div>
      {children}
    </div>
  );
}

const Seccion = ({ children }: { children: ReactNode }) => (
  <h2 className="font-titulo text-texto-suave mt-3 text-[13px] font-semibold tracking-wide uppercase">{children}</h2>
);

const OPCIONES_TEMA: [Tema, string][] = [
  ['sistema', T.ajustes.segunMovil],
  ['oscuro', T.ajustes.siempre],
  ['claro', T.ajustes.nunca],
];

/**
 * Ajustes (FR-93, FL-12): firma, Mis propuestas, mapa sin cobertura, puntos guardados, capa,
 * avisos, pantalla, ayuda, aviso legal, cerrar sesión y versión.
 */
export function Ajustes() {
  const acceso = useAcceso();
  const navegar = useNavigate();
  const hayVersion = useVersionNueva();
  const [tema, setTema] = useState(leerTema);
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const cerrarHoja = useCallback(() => setConfirmar(false), []);
  const cola = useCola();

  const sesion = acceso.tipo === 'voluntario' ? acceso.sesion : null;
  const [nombre, setNombre] = useState(sesion?.nombre ?? '');
  const [apellido, setApellido] = useState(sesion?.apellido ?? '');
  const faltaNombre = !nombre.trim() || !apellido.trim();

  function guardarNombre(e: FormEvent) {
    e.preventDefault();
    if (faltaNombre) return;
    cambiarFirma({ nombre, apellido });
    setEditando(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-2 p-3">
      {acceso.tipo === 'jefatura' && (
        <Fila titulo={T.ajustes.cuentaJefatura} detalle={T.ajustes.sesionGoogle(acceso.correo)}>
          <Boton variante="enlace" className="text-sm" onClick={() => void salirDeGoogle()}>
            {T.ajustes.cerrarSesionGoogle}
          </Boton>
        </Fila>
      )}

      {sesion && !editando && (
        <Fila titulo={`${sesion.nombre} ${sesion.apellido}`} detalle={T.ajustes.firma}>
          <Boton variante="enlace" className="text-sm" onClick={() => setEditando(true)}>
            {T.ajustes.cambiar}
          </Boton>
        </Fila>
      )}
      {sesion && editando && (
        <form onSubmit={guardarNombre} className="bg-papel border-linea rounded-tarjeta flex flex-col gap-2 border p-3">
          <label className="text-texto-suave text-[13px] font-semibold">
            {T.entrada.nombre}
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={60}
              className="bg-papel border-linea rounded-campo text-texto mt-1 block min-h-11 w-full border px-3 text-base font-normal"
            />
          </label>
          <label className="text-texto-suave text-[13px] font-semibold">
            {T.entrada.apellido}
            <input
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              maxLength={60}
              className="bg-papel border-linea rounded-campo text-texto mt-1 block min-h-11 w-full border px-3 text-base font-normal"
            />
          </label>
          <div className="flex gap-3">
            <Boton type="submit" disabled={faltaNombre} className="flex-1">
              {T.ajustes.guardar}
            </Boton>
            <Boton variante="secundario" className="flex-1" onClick={() => setEditando(false)}>
              {T.ajustes.cancelar}
            </Boton>
          </div>
          {faltaNombre && <p className="text-texto-suave text-[13px]">{T.entrada.faltaNombre}</p>}
        </form>
      )}

      {sesion && <FilaMisPropuestas />}

      <SeccionMapa />

      {sesion && <SeccionAvisos />}

      <SeccionNovedades />

      <Seccion>{T.ajustes.pantalla}</Seccion>
      <Fila titulo={T.ajustes.modoOscuro}>
        <div role="radiogroup" aria-label={T.ajustes.modoOscuro} className="border-linea flex rounded-campo border">
          {OPCIONES_TEMA.map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={tema === valor}
              onClick={() => {
                guardarTema(valor);
                setTema(valor);
              }}
              className={cn(
                'min-h-11 px-2 text-[13px] first:rounded-l-campo last:rounded-r-campo',
                tema === valor ? 'bg-texto text-fondo font-semibold' : 'text-texto-suave',
              )}
            >
              {texto}
            </button>
          ))}
        </div>
      </Fila>

      <Seccion>{T.ajustes.ayuda}</Seccion>
      <FilaInstalar />
      {sesion && (
        <Fila titulo={T.ajustes.algoNoFunciona}>
          <Boton
            variante="enlace"
            className="text-sm"
            onClick={() => navegar('/incidencia', { state: { desde: '/ajustes' } })}
          >
            {T.ajustes.avisarJefatura}
          </Boton>
        </Fila>
      )}
      <Fila titulo={T.ajustes.comoSeUsa}>
        <Boton variante="enlace" className="text-sm" onClick={() => navegar('/bienvenida')}>
          {T.ajustes.ver}
        </Boton>
      </Fila>
      <Fila titulo={T.entrada.avisoLegal}>
        <Link
          to="/legal"
          className="text-texto inline-flex min-h-11 min-w-11 items-center justify-center px-1 text-sm underline"
        >
          {T.ajustes.ver}
        </Link>
      </Fila>

      {sesion && (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="bg-rojo-100 border-rojo-700 rounded-tarjeta text-rojo-700 mt-3 min-h-12 border px-3 text-left text-[15px] font-semibold"
        >
          {T.ajustes.cerrarSesion}
        </button>
      )}

      <p className="text-texto-suave mt-2 text-center text-[13px]">
        {T.ajustes.version(VERSION)}
        {hayVersion && (
          <>
            {' · '}
            <button type="button" onClick={recargar} className="text-texto min-h-11 font-semibold underline">
              {T.ajustes.versionNueva}
            </button>
          </>
        )}
      </p>

      {confirmar && (
        <Hoja titulo={T.ajustes.confirmarCerrar} alCerrar={cerrarHoja}>
          <p className="text-texto-suave mb-3 text-sm">
            {T.ajustes.cerrarSesionDetalle}
            {cola.length > 0 && <b className="text-rojo-700 block">{T.ajustes.perderasEnvios(cola.length)}</b>}
          </p>
          <Boton variante="destructivo" className="w-full" onClick={() => void cerrarSesionVoluntario()}>
            {T.ajustes.cerrarSesionBoton}
          </Boton>
          <Boton variante="secundario" className="mt-3 w-full" onClick={cerrarHoja}>
            {T.ajustes.cancelar}
          </Boton>
        </Hoja>
      )}
    </div>
  );
}

/** Mapa sin cobertura, puntos guardados y capa por defecto (FR-81, FR-93, FL-12). */
function SeccionMapa() {
  const mapabase = useMapabase();
  const { puntos, guardadoEn, sincronizando } = usePuntos();
  const conexion = useConexion();
  const [capa, setCapa] = useState<Capa>(capaGuardada);
  const [eligiendoCapa, setEligiendoCapa] = useState(false);
  // Si el navegador concedió no desalojar lo guardado (TR-07); null hasta que contesta.
  const [protegido] = useState(() => leer<boolean>('almacen_persistente'));
  useReloj();
  const sinRed = conexion === 'sin_cobertura';
  const nueva = hayVersionNuevaMapabase(mapabase);

  const detalleMapa =
    mapabase.progreso !== null
      ? T.ajustes.descargando(mapabase.progreso)
      : mapabase.descargado
        ? `${T.ajustes.descargado(megas(mapabase.descargado.bytes), fechaCorta(mapabase.descargado.fecha))}${nueva ? ` · ${T.ajustes.versionNuevaMapa}` : ''}`
        : T.ajustes.noDescargadoDetalle;

  return (
    <>
      <Seccion>{T.navegacion.mapa}</Seccion>
      <Fila
        titulo={T.ajustes.mapaSinCobertura}
        detalle={
          <>
            {detalleMapa}
            {mapabase.fallo && <span className="text-rojo-700 block">{T.ajustes.falloDescarga}</span>}
            {sinRed && mapabase.progreso === null && <span className="block">{T.mapa.necesitaCobertura}</span>}
          </>
        }
      >
        {mapabase.progreso === null && (!mapabase.descargado || nueva) && (
          <Boton variante="enlace" className="text-sm" disabled={sinRed} onClick={() => void descargarMapabase()}>
            {mapabase.descargado ? T.ajustes.actualizar : T.ajustes.descargar}
          </Boton>
        )}
      </Fila>
      <Fila
        titulo={T.ajustes.puntosGuardados}
        detalle={
          <>
            {guardadoEn ? T.ajustes.puntosGuardadosDetalle(puntos.length, hace(guardadoEn)) : T.ajustes.sinSincronizar}
            {sinRed && <span className="block">{T.mapa.necesitaCobertura}</span>}
          </>
        }
      >
        <Boton
          variante="enlace"
          className="text-sm"
          disabled={sinRed || sincronizando}
          onClick={() => void reintentarAhora()}
        >
          {sincronizando ? T.mapa.sincronizando : T.ajustes.sincronizar}
        </Boton>
      </Fila>
      {protegido !== null && (
        <Fila titulo={T.ajustes.guardadoProtegido} detalle={T.ajustes.guardadoProtegidoValor(protegido)} />
      )}
      <Fila titulo={T.ajustes.capaPorDefecto} detalle={NOMBRE_CAPA[capa]}>
        <Boton variante="enlace" className="text-sm" onClick={() => setEligiendoCapa(true)}>
          {T.ajustes.cambiar}
        </Boton>
      </Fila>
      {eligiendoCapa && (
        <SelectorCapas
          titulo={T.ajustes.capaPorDefecto}
          actual={capa}
          alElegir={(c) => {
            setCapa(c);
            guardarCapa(c);
          }}
          alCerrar={() => setEligiendoCapa(false)}
        />
      )}
    </>
  );
}

function FilaMisPropuestas() {
  const navegar = useNavigate();
  const cola = useCola();
  const propias = useMisPropuestas();
  const enviadas = propias.filter((p) => !cola.some((c) => c.clave_local === p.clave_local)).length;
  return (
    <Fila titulo={T.navegacion.misPropuestas} detalle={T.misPropuestas.resumen(enviadas, cola.length)}>
      <Boton variante="enlace" className="text-sm" onClick={() => navegar('/mis-propuestas')}>
        {T.ajustes.ver}
      </Boton>
    </Fila>
  );
}

/** Avisos push (FR-163): se explica antes de pedir el permiso del móvil. */
/**
 * Lo que trae la versión instalada (FR-167, AC-127), desde el build (RV-20). La primera vez que se
 * abre Ajustes tras una versión nueva se marca como "Nuevo"; al salir, ya está vista.
 */
function SeccionNovedades() {
  const [nuevas] = useState(hayNovedadesSinVer);
  useEffect(() => marcarNovedadesVistas(), []);
  return (
    <>
      <Seccion>
        {T.ajustes.seccionNovedades}
        {nuevas && (
          <span className="bg-naranja-600 ml-2 rounded px-1.5 py-0.5 text-[11px] text-white">{T.ajustes.nuevo}</span>
        )}
      </Seccion>
      <div className="px-3 py-2 text-sm" data-testid="novedades">
        {NOVEDADES.version && <p className="text-texto-suave text-[13px]">{T.ajustes.version(NOVEDADES.version)}</p>}
        {NOVEDADES.lineas.length ? (
          <ul className="mt-1 list-disc pl-5">
            {NOVEDADES.lineas.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="text-texto-suave">{T.ajustes.sinNovedades}</p>
        )}
      </div>
    </>
  );
}

function SeccionAvisos() {
  const [estado, setEstado] = useState<EstadoPush>(estadoPush);
  const [explicar, setExplicar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState<MotivoPush | null>(null);
  const cerrar = useCallback(() => {
    setExplicar(false);
    setMotivo(null);
  }, []);
  const activar = async () => {
    setOcupado(true);
    try {
      const r = await activarPush();
      setEstado(r.estado);
      // Si algo falla, la hoja se queda abierta y dice por qué (RV-81, UI-05).
      if (r.motivo) setMotivo(r.motivo);
      else cerrar();
    } finally {
      setOcupado(false);
    }
  };
  if (estado === 'no_disponible') return null;
  const detalle =
    estado === 'activo'
      ? T.push.activado
      : estado === 'denegado'
        ? T.push.denegado
        : estado === 'instalar_primero'
          ? T.push.instalarPrimero
          : T.push.desactivado;
  const puedeCambiar = estado === 'activo' || estado === 'inactivo';
  return (
    <>
      <Seccion>{T.ajustes.avisos}</Seccion>
      <Fila titulo={T.ajustes.avisarResolucion} detalle={detalle}>
        {puedeCambiar && (
          <button
            type="button"
            role="switch"
            aria-checked={estado === 'activo'}
            aria-label={T.ajustes.avisarResolucion}
            disabled={ocupado}
            onClick={async () => {
              if (estado !== 'activo') return setExplicar(true);
              setOcupado(true);
              try {
                setEstado(await desactivarPush());
              } finally {
                setOcupado(false);
              }
            }}
            // 44 px de objetivo táctil (UI-13) alrededor de la pista de 48 × 28.
            className="flex h-11 w-12 shrink-0 items-center"
          >
            <span
              aria-hidden
              className={cn(
                'relative h-7 w-12 rounded-full transition-colors',
                estado === 'activo' ? 'bg-verde-600' : 'bg-linea',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-6 rounded-full bg-white shadow transition-all',
                  estado === 'activo' ? 'left-[22px]' : 'left-0.5',
                )}
              />
            </span>
          </button>
        )}
      </Fila>
      {explicar && (
        <Hoja titulo={T.push.titulo} alCerrar={cerrar}>
          {motivo ? (
            <div role="alert" data-testid="motivo-push" className="mb-3">
              <p className="text-sm">{textoMotivoPush(motivo)}</p>
              <p className="text-texto-suave mt-1 text-[13px]">{T.push.referencia(motivo)}</p>
            </div>
          ) : (
            <p className="text-texto-suave mb-3 text-sm">{T.push.explicacion}</p>
          )}
          {(!motivo || sePuedeReintentar(motivo)) && (
            <Boton className="w-full" disabled={ocupado} onClick={() => void activar()}>
              {motivo ? T.push.reintentar : T.push.permitir}
            </Boton>
          )}
          <Boton variante="secundario" className="mt-3 w-full" onClick={cerrar}>
            {motivo ? T.push.cerrar : T.push.ahoraNo}
          </Boton>
        </Hoja>
      )}
    </>
  );
}

/** Instalar la app en la pantalla de inicio: botón propio si el navegador lo permite (DEC-064). */
function FilaInstalar() {
  const estado = useInstalar();
  if (estado === 'instalada') return <Fila titulo={T.instalar.titulo} detalle={T.instalar.instalada} />;
  return (
    <Fila
      titulo={T.instalar.titulo}
      detalle={estado === 'ios' ? T.instalar.ios : estado === 'menu' ? T.instalar.menu : undefined}
    >
      {estado === 'disponible' && (
        <Boton variante="enlace" className="text-sm" onClick={() => void instalar()}>
          {T.instalar.boton}
        </Boton>
      )}
    </Fila>
  );
}
