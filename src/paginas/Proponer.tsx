import { CheckCircle2, CloudUpload, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { Boton } from '@/componentes/Boton';
import { LimiteError } from '@/componentes/LimiteError';
import { MarcadorSvg } from '@/componentes/mapa/MarcadorSvg';
import {
  Campo,
  CampoFoto,
  DosFotos,
  PildorasCaudal,
  Segmentado,
  SelectorRacor,
} from '@/componentes/operaciones/Campos';
import { SelectorPin } from '@/componentes/operaciones/SelectorPin';
import { useAcceso, useConexion, usePosicion, usePuntos } from '@/hooks/estado';
import { useCola } from '@/hooks/cola';
import { type EnCola, encolar, estadoDeEnvio, reintentarCola } from '@/lib/cola';
import { nombreCaudal, nombreTipo } from '@/lib/ficha';
import type { FotoProcesada } from '@/lib/foto';
import { distancia, hace } from '@/lib/formato';
import { activarPosicion, esAntigua, posicionActual } from '@/lib/posicion';
import {
  type Formulario,
  type MotivoRapido,
  type Coordenadas,
  type Operacion,
  argumentos,
  coordenadasDe,
  diametroPermitido,
  necesitaFoto,
  necesitaFotoSitio,
  queFalta,
} from '@/lib/propuestas';
import { TITULO_OPERACION, textoEspera, textoFallo } from '@/lib/nombres-operacion';
import { metros } from '@/lib/puntos';
import { LIMITES } from '@/lib/limites';
import { T } from '@/lib/textos';
import { dentroDeZona } from '@/lib/zona';
import { cn } from '@/lib/utils';

const OPERACIONES: Operacion[] = ['alta', 'revision', 'estado', 'datos', 'ubicacion', 'retirada'];

const MOTIVOS: [MotivoRapido, string][] = [
  ['obras', T.formulario.obras],
  ['asfaltado', T.formulario.asfaltado],
  ['sustituido', T.formulario.sustituido],
  ['otro', T.formulario.otro],
];

const areaTexto =
  'bg-papel border-linea rounded-campo text-texto min-h-11 w-full border px-3 py-2 text-base placeholder:text-texto-suave';

type Resultado = 'enviado' | 'guardado' | 'aplicado' | 'solo_en_memoria' | 'fallido';

/** Formulario de las seis operaciones (FL-03–FL-08, 07 §7.3). `/proponer/:operacion?p=<punto>`. */
export function Proponer() {
  const { operacion: op } = useParams();
  const [params] = useSearchParams();
  const operacion = OPERACIONES.includes(op as Operacion) ? (op as Operacion) : null;
  const { puntos, cargado, sincronizadoEn, sincronizando } = usePuntos();
  const punto = useMemo(() => puntos.find((p) => p.id === params.get('p')) ?? null, [puntos, params]);
  // Alta empezada con una pulsación larga sobre el mapa: el pin nace donde se pulsó (DEC-077).
  const pinInicial = useMemo(() => coordenadasDe(params.get('lat'), params.get('lng')), [params]);
  if (!operacion) return <Navigate to="/" replace />;
  // Sin punto no se manda al mapa (docs/31 RV-152): al volver de la cámara, si Android descartó la
  // pestaña, los puntos aún no han cargado; y si una sincronización lo ha quitado, hay que decirlo.
  // Con el móvil sin nada guardado aún, la primera sincronización todavía puede traerlo.
  const cargando = !cargado || (sincronizadoEn === null && sincronizando);
  if (operacion !== 'alta' && !punto) return <SinPunto operacion={operacion} cargando={cargando} />;
  return (
    <LimiteError>
      <FormularioOperacion
        key={`${operacion}-${punto?.id}`}
        operacion={operacion}
        punto={punto}
        pinInicial={pinInicial}
      />
    </LimiteError>
  );
}

function FormularioOperacion({
  operacion,
  punto,
  pinInicial,
}: {
  operacion: Operacion;
  punto: ReturnType<typeof usePuntos>['puntos'][number] | null;
  pinInicial: Coordenadas | null;
}) {
  const navegar = useNavigate();
  const acceso = useAcceso();
  const conexion = useConexion();
  usePosicion();
  // Una posición que el GPS dejó de refrescar (timeout, o más de 60 s) no coloca el pin del alta ni
  // viaja como gps_*: jefatura vería "GPS ±9 m" de un sitio del que quizá ya se ha ido (docs/18 RV-40).
  // El mapa la sigue enseñando atenuada.
  const ultimaPosicion = posicionActual();
  const gps = ultimaPosicion && !esAntigua(ultimaPosicion) ? ultimaPosicion : null;
  const posicionVieja = !!ultimaPosicion && !gps;
  const jefatura = acceso.tipo === 'jefatura';
  const [foto, setFoto] = useState<FotoProcesada | null>(null);
  // La del sitio, en alta y corregir ubicación (docs/24 RV-103).
  const [fotoSitio, setFotoSitio] = useState<FotoProcesada | null>(null);
  useEffect(() => activarPosicion(), []);
  const [f, setF] = useState<Formulario>(() => {
    return {
      operacion,
      pin: operacion === 'ubicacion' && punto ? { lat: punto.lat, lng: punto.lng } : (pinInicial ?? undefined),
      // Con el pin puesto a mano el GPS ya no manda: es una ubicación manual (FR-13).
      pinMovido: operacion === 'alta' && !!pinInicial,
      tipo: operacion === 'datos' ? punto?.tipo : undefined,
    };
  });
  const [enviando, setEnviando] = useState(false);
  // La clave_local de lo enviado: la pantalla de resultado sigue en la cola qué pasa con ello.
  const [resultado, setResultado] = useState<string | null>(null);
  const [falloGuardar, setFalloGuardar] = useState(false);
  const cambiar = (c: Partial<Formulario>) => setF((x) => ({ ...x, ...c }));

  // Alta: el pin sale de la posición GPS en cuanto la hay, hasta que el voluntario lo mueve.
  const pinAlta = operacion === 'alta' && !f.pinMovido && gps ? { lat: gps.lat, lng: gps.lng } : f.pin;
  const formulario: Formulario = {
    ...f,
    pin: operacion === 'alta' ? pinAlta : f.pin,
    gps: gps ? { lat: gps.lat, lng: gps.lng, precision: gps.precision } : null,
    exif: foto?.exif ?? null,
    hayFoto: !!foto,
    hayFotoSitio: !!fotoSitio,
  };
  const falta = queFalta(formulario, punto);
  const pinFuera = formulario.pin && !dentroDeZona(formulario.pin.lat, formulario.pin.lng);
  const disponible = conexion === 'bien';

  async function enviar() {
    if (falta || enviando) return;
    setEnviando(true);
    setFalloGuardar(false);
    const autor =
      acceso.tipo === 'voluntario'
        ? { nombre: acceso.sesion.nombre, apellido: acceso.sesion.apellido }
        : // Jefatura: el servidor pone su nombre y su correo (fn_proponer, RV-19); el correo no viaja
          // en autor_* ni choca con su límite de 60 caracteres.
          { nombre: T.navegacion.jefatura, apellido: T.navegacion.jefatura };
    const clave = crypto.randomUUID();
    try {
      // Solo se espera a que quede guardada en el móvil: encolar ya lanza el envío, y la pantalla de
      // resultado cambia sola cuando sale. Con señal débil, esperar al envío eran minutos en
      // "Enviando…", y el voluntario la volvía a rellenar: un duplicado de verdad (docs/31 RV-151).
      await encolar(
        argumentos(formulario, punto, autor, clave),
        necesitaFoto(operacion) || foto ? (foto?.blob ?? null) : null,
        punto?.codigo ?? null,
        necesitaFotoSitio(operacion) ? (fotoSitio?.blob ?? null) : null,
      );
    } catch {
      setFalloGuardar(true);
      setEnviando(false);
      return;
    }
    setResultado(clave);
    setEnviando(false);
  }

  if (resultado) return <PantallaResultado clave={resultado} jefatura={jefatura} />;

  const textoBoton = jefatura
    ? // Sin conexión, jefatura tampoco aplica al momento: se guarda y se aplica al volver (RV-151).
      disponible
      ? T.envio.aplicarAhora
      : T.envio.guardarEnMovil
    : !disponible
      ? conexion === 'sin_cobertura'
        ? T.envio.guardarSinCobertura
        : T.envio.guardarSinServidor
      : operacion === 'retirada'
        ? T.envio.enviarRetirada
        : T.envio.enviarRevision;

  const etiquetaFoto =
    operacion === 'retirada'
      ? T.formulario.fotoDelSitio
      : operacion === 'alta'
        ? T.formulario.foto
        : T.formulario.fotoDeHoy;
  const desplazamiento = operacion === 'ubicacion' && punto && formulario.pin ? metros(punto, formulario.pin) : null;

  return (
    <div className="flex flex-1 flex-col">
      {/* En el formulario, la etiqueta no lleva al panel: se perderían las fotos y los datos (DEC-164). */}
      <BarraSuperior
        titulo={TITULO_OPERACION[operacion]}
        alVolver={() => navegar(-1)}
        jefatura={jefatura}
        enlacePanel={false}
      />
      <form
        className="mx-auto flex w-full max-w-lg flex-col gap-3 p-3 pb-8"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        {punto && (
          <div className="bg-papel border-linea rounded-tarjeta flex items-center gap-2.5 border px-2.5 py-2">
            <MarcadorSvg punto={punto} tamano={24} />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">
                <span className="font-datos">{punto.codigo}</span> · {nombreTipo[punto.tipo]}{' '}
                {T.formato.mm(punto.diametro_mm)}
              </div>
              <div className="text-texto-suave text-[13px]">
                {T.operaciones.constaComo(nombreCaudal(punto.caudal), hace(punto.fecha_ultima_revision))}
              </div>
            </div>
          </div>
        )}

        {(operacion === 'alta' || operacion === 'ubicacion') && (
          <>
            <SelectorPin
              pin={formulario.pin}
              gps={gps}
              original={operacion === 'ubicacion' && punto ? { lat: punto.lat, lng: punto.lng } : undefined}
              alMover={(c) => cambiar({ pin: c, pinMovido: true })}
              alUsarMiPosicion={operacion === 'alta' ? () => cambiar({ pin: undefined, pinMovido: false }) : undefined}
              etiqueta={TITULO_OPERACION[operacion]}
            />
            <p className="text-texto-suave text-center text-[13px]">
              {operacion === 'ubicacion'
                ? T.operaciones.ubicacionAyuda
                : gps
                  ? T.avisosFormulario.ajustaPin
                  : posicionVieja
                    ? T.avisosFormulario.posicionNoAlDia
                    : T.operaciones.sinGps}
            </p>
            {pinFuera && (
              <p className="bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta border px-2.5 py-2 text-sm">
                {T.avisosFormulario.fueraDeZona}
              </p>
            )}
          </>
        )}

        {desplazamiento !== null && (
          <div className="grid gap-1.5 text-sm">
            <div className="bg-papel border-linea rounded-tarjeta flex justify-between border px-2.5 py-2">
              <span>{T.formulario.desplazamiento}</span>
              <b>{distancia(desplazamiento)}</b>
            </div>
            {gps && formulario.pin && (
              <div className="bg-papel border-linea rounded-tarjeta flex justify-between border px-2.5 py-2">
                <span>{T.formulario.tuGps}</span>
                <b>{T.operaciones.tuGpsDetalle(Math.round(gps.precision), distancia(metros(gps, formulario.pin)))}</b>
              </div>
            )}
          </div>
        )}

        {operacion === 'revision' && <Aviso>{T.operaciones.revisionAviso}</Aviso>}

        {(operacion === 'alta' || operacion === 'datos') && (
          <DatosPunto f={formulario} cambiar={cambiar} punto={punto} jefatura={jefatura} />
        )}

        {(operacion === 'alta' || operacion === 'estado') && (
          <>
            <Campo etiqueta={operacion === 'estado' ? T.operaciones.caudalAhora : T.formulario.caudal}>
              <PildorasCaudal
                valor={f.caudal}
                alCambiar={(c) => cambiar({ caudal: c })}
                etiqueta={operacion === 'estado' ? T.operaciones.caudalAhora : T.formulario.caudal}
              />
            </Campo>
            {f.caudal === 'no_funciona' && (
              <Campo etiqueta={T.formulario.descripcionFallo}>
                <input
                  value={f.fallo ?? ''}
                  onChange={(e) => cambiar({ fallo: e.target.value })}
                  placeholder={T.operaciones.phFallo}
                  aria-label={T.formulario.descripcionFallo}
                  maxLength={LIMITES.descripcion_fallo}
                  className={areaTexto}
                />
              </Campo>
            )}
          </>
        )}

        {operacion === 'retirada' && (
          <>
            <Campo etiqueta={T.formulario.porQueRetirada}>
              <Segmentado
                opciones={MOTIVOS}
                valor={f.motivoRapido}
                alCambiar={(m) => cambiar({ motivoRapido: m })}
                etiqueta={T.formulario.porQueRetirada}
              />
            </Campo>
            <Campo etiqueta={T.formulario.motivoRetirada}>
              <textarea
                value={f.motivo ?? ''}
                onChange={(e) => cambiar({ motivo: e.target.value })}
                placeholder={T.operaciones.phMotivo}
                aria-label={T.formulario.motivoRetirada}
                maxLength={LIMITES.motivo}
                rows={3}
                className={areaTexto}
              />
            </Campo>
          </>
        )}

        {necesitaFotoSitio(operacion) ? (
          <DosFotos
            etiqueta={etiquetaFoto}
            conexion={foto}
            sitio={fotoSitio}
            alCambiarConexion={setFoto}
            alCambiarSitio={setFotoSitio}
          />
        ) : (
          (necesitaFoto(operacion) || operacion === 'datos') && (
            <CampoFoto etiqueta={etiquetaFoto} foto={foto} alCambiar={setFoto} />
          )
        )}

        {operacion === 'alta' && (
          <Campo etiqueta={T.formulario.descripcionOpcional}>
            <input
              value={f.descripcion ?? ''}
              onChange={(e) => cambiar({ descripcion: e.target.value })}
              placeholder={T.formulario.descripcionAyuda}
              aria-label={T.formulario.descripcionOpcional}
              maxLength={LIMITES.descripcion}
              className={areaTexto}
            />
          </Campo>
        )}

        {(operacion === 'revision' || operacion === 'estado' || operacion === 'ubicacion') && (
          <Campo etiqueta={T.formulario.notaOpcional}>
            <input
              value={f.nota ?? ''}
              onChange={(e) => cambiar({ nota: e.target.value })}
              placeholder={T.operaciones.phNota}
              aria-label={T.formulario.notaOpcional}
              maxLength={LIMITES.nota}
              className={areaTexto}
            />
          </Campo>
        )}

        {operacion === 'retirada' && <Aviso>{T.operaciones.retiradaAviso}</Aviso>}
        {jefatura && <Aviso>{T.operaciones.jefaturaAviso}</Aviso>}

        <Boton type="submit" disabled={!!falta || enviando} className="mt-1 w-full">
          {enviando ? T.operaciones.enviando : textoBoton}
        </Boton>
        {falta && <p className="text-texto-suave -mt-1 text-center text-[13px]">{falta}</p>}
        {falloGuardar && (
          <p role="alert" className="text-rojo-700 text-center text-sm">
            {T.operaciones.errorGuardar}
          </p>
        )}
      </form>
    </div>
  );
}

/**
 * El formulario de un punto que no está (docs/31 RV-152): mientras cargan los puntos guardados,
 * "Cargando…"; si ya han cargado y no está, se dice por qué y no se manda al mapa sin explicación.
 */
function SinPunto({ operacion, cargando }: { operacion: Operacion; cargando: boolean }) {
  const navegar = useNavigate();
  const acceso = useAcceso();
  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior
        titulo={TITULO_OPERACION[operacion]}
        alVolver={() => navegar('/', { replace: true })}
        jefatura={acceso.tipo === 'jefatura'}
      />
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 p-3">
        {cargando ? (
          <p role="status" className="text-texto-suave py-6 text-center">
            {T.app.cargando}
          </p>
        ) : (
          <>
            <p
              role="alert"
              className="bg-oro-100 border-oro-600 text-ambar-700 rounded-tarjeta border px-2.5 py-2 text-sm"
            >
              {T.operaciones.puntoYaNoEsta}
            </p>
            <Boton className="w-full" onClick={() => navegar('/', { replace: true })}>
              {T.envio.volverAlMapa}
            </Boton>
          </>
        )}
      </div>
    </div>
  );
}

const Aviso = ({ children }: { children: React.ReactNode }) => (
  <p className="bg-marino-600/10 border-marino-600 text-texto rounded-tarjeta border px-2.5 py-2 text-sm">{children}</p>
);

function DatosPunto({
  f,
  cambiar,
  punto,
  jefatura,
}: {
  f: Formulario;
  cambiar: (c: Partial<Formulario>) => void;
  punto: ReturnType<typeof usePuntos>['puntos'][number] | null;
  jefatura: boolean;
}) {
  const tipo = f.tipo;
  // Lo que tiene el punto al corregir datos: en una boca, 45, 70 u otra medida con su número (docs/24 RV-101).
  const diametroDelPunto: Formulario['diametro'] =
    !punto || punto.tipo !== tipo
      ? undefined
      : tipo === 'hidrante'
        ? (punto.diametro_mm as 70 | 100)
        : punto.diametro_mm === 45 || punto.diametro_mm === 70
          ? punto.diametro_mm
          : 'otro';
  const diametroActual = f.diametro ?? diametroDelPunto;
  const otraMedidaActual = diametroDelPunto === 'otro' && punto ? String(punto.diametro_mm) : '';
  const opcionesDiametro: [NonNullable<Formulario['diametro']>, string][] =
    tipo === 'boca_riego'
      ? // Una boca de otra medida se aprueba tal cual (FR-16, DEC-144): la ofrecen también jefatura y corregir datos.
        [
          [45, T.formulario.d45],
          [70, T.formulario.d70],
          ['otro', T.formulario.otraMedida],
        ]
      : // "Otra medida" de un hidrante la resuelve jefatura al moderar; jefatura aplica al momento (FR-151),
        // así que fija 70 o 100 directamente (RV-19). Corregir datos tampoco la admite en un hidrante.
        f.operacion === 'alta' && !jefatura
        ? [
            [70, T.formulario.d70],
            [100, T.formulario.d100],
            ['otro', T.formulario.otraMedida],
          ]
        : [
            [70, T.formulario.d70],
            [100, T.formulario.d100],
          ];
  const racorActual = f.racor ?? (punto?.tipo === 'boca_riego' ? (punto.racor ?? undefined) : undefined);
  return (
    <>
      {f.operacion === 'datos' && punto ? (
        // El tipo no se cambia una vez creado: se propone retirarlo y se da de alta el correcto (FR-11,
        // DEC-090).
        <Campo etiqueta={T.formulario.tipoElemento}>
          <p className="bg-papel border-linea rounded-campo min-h-11 border px-3 py-2">{nombreTipo[punto.tipo]}</p>
          <p className="text-texto-suave mt-1 text-[13px]">
            {T.operaciones.tipoNoCambia} ·{' '}
            <Link
              to={`/proponer/retirada?p=${encodeURIComponent(punto.id)}`}
              replace
              className="text-marino-600 inline-flex min-h-11 items-center font-semibold underline"
            >
              {T.operaciones.proponerRetirada}
            </Link>
          </p>
        </Campo>
      ) : (
        <Campo etiqueta={T.formulario.tipoElemento}>
          <Segmentado
            opciones={[
              ['hidrante', T.formulario.hidrante],
              ['boca_riego', T.formulario.bocaRiego],
            ]}
            valor={tipo}
            alCambiar={(t) =>
              cambiar({
                tipo: t,
                diametro: diametroPermitido(t, f.diametro) && f.diametro !== 'otro' ? f.diametro : undefined,
              })
            }
            etiqueta={T.formulario.tipoElemento}
          />
        </Campo>
      )}
      {tipo && (
        <Campo etiqueta={T.formulario.diametro}>
          <Segmentado
            opciones={opcionesDiametro}
            valor={diametroActual}
            alCambiar={(d) => cambiar({ diametro: d })}
            etiqueta={T.formulario.diametro}
          />
          {diametroActual === 'otro' && (
            <input
              value={f.diametroOtro ?? otraMedidaActual}
              onChange={(e) => cambiar({ diametro: 'otro', diametroOtro: e.target.value })}
              inputMode="numeric"
              placeholder={tipo === 'boca_riego' ? T.operaciones.phOtraMedidaBoca : T.operaciones.phOtraMedida}
              aria-label={T.formulario.otraMedida}
              className={cn(areaTexto, 'mt-1')}
            />
          )}
        </Campo>
      )}
      {tipo === 'boca_riego' && (
        <Campo etiqueta={T.formulario.racor}>
          <SelectorRacor valor={racorActual} alCambiar={(r) => cambiar({ racor: r })} />
        </Campo>
      )}
      {f.operacion === 'datos' && (
        <Campo etiqueta={T.formulario.descripcionOpcional}>
          <input
            value={f.descripcion ?? punto?.descripcion ?? ''}
            onChange={(e) => cambiar({ descripcion: e.target.value })}
            placeholder={T.formulario.descripcionAyuda}
            aria-label={T.formulario.descripcionOpcional}
            maxLength={LIMITES.descripcion}
            className={areaTexto}
          />
        </Campo>
      )}
    </>
  );
}

/**
 * Qué ha pasado con un envío: sigue en la cola y no llegó a IndexedDB, solo vive en memoria y se
 * perdería al cerrar (RV-02); si ya salió, enviado o aplicado.
 */
function resultadoDe(cola: readonly EnCola[], clave: string, jefatura: boolean): Resultado {
  const estado = estadoDeEnvio(cola, clave);
  if (estado !== 'salio') return estado;
  return jefatura ? 'aplicado' : 'enviado';
}

/**
 * Confirmación de 07 §7.5: qué ha pasado con lo enviado (UI-05). Sale en cuanto está guardado en el
 * móvil y sigue a la cola: "Guardado en el móvil" pasa a "Enviado" (o "Aplicado") cuando sale, y
 * tras "Reintentar ahora" también (RV-39, docs/31 RV-151).
 */
function PantallaResultado({ clave, jefatura }: { clave: string; jefatura: boolean }) {
  const navegar = useNavigate();
  const acceso = useAcceso();
  const [reintentando, setReintentando] = useState(false);
  const cola = useCola();
  const resultado = resultadoDe(cola, clave, jefatura);
  const envio = cola.find((i) => i.clave_local === clave);
  const titulo = {
    aplicado: T.envio.aplicado,
    guardado: T.envio.guardadoEnMovil,
    solo_en_memoria: T.envio.soloEnMemoria,
    enviado: T.envio.enviado,
    fallido: T.envio.noEnviado,
  }[resultado];
  const detalle = {
    aplicado: T.operaciones.aplicadoDetalle,
    // Esperando al día siguiente por el tope (RV-154): se dice por qué, no «se enviará sola».
    guardado: (envio && textoEspera(envio)) || T.operaciones.guardadoDetalle,
    // Con un error permanente no se enviará sola (#484): se dice qué pasa, como en Mis propuestas.
    fallido: envio?.fallo ? textoFallo(envio.fallo) : T.misPropuestas.errorGenerico,
    solo_en_memoria: T.envio.soloEnMemoriaDetalle,
    enviado: T.envio.jefaturaRevisara,
  }[resultado];
  const pendiente = resultado === 'guardado' || resultado === 'solo_en_memoria';
  const Icono = resultado === 'fallido' ? TriangleAlert : pendiente ? CloudUpload : CheckCircle2;
  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior titulo={titulo} jefatura={acceso.tipo === 'jefatura'} />
      <div
        role="status"
        className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <Icono
          size={44}
          className={resultado === 'fallido' ? 'text-rojo-700' : pendiente ? 'text-naranja-600' : 'text-verde-600'}
          aria-hidden
        />
        <h2 className="font-titulo text-2xl font-bold">{titulo}</h2>
        <p className="text-texto-suave">{detalle}</p>
        {resultado === 'solo_en_memoria' && (
          <Boton
            className="mt-3 w-full"
            disabled={reintentando}
            onClick={() => {
              setReintentando(true);
              void reintentarCola().finally(() => setReintentando(false));
            }}
          >
            {reintentando ? T.operaciones.enviando : T.envio.reintentarAhora}
          </Boton>
        )}
        {/* Un solo primario por pantalla (06 §5, DEC-147): si hay que reintentar, es eso. */}
        <Boton
          variante={resultado === 'solo_en_memoria' ? 'secundario' : 'primario'}
          className="mt-3 w-full"
          onClick={() => navegar('/', { replace: true })}
        >
          {T.envio.volverAlMapa}
        </Boton>
        {acceso.tipo === 'voluntario' && (
          <Boton variante="secundario" className="w-full" onClick={() => navegar('/mis-propuestas', { replace: true })}>
            {T.envio.verMisPropuestas}
          </Boton>
        )}
      </div>
    </div>
  );
}
