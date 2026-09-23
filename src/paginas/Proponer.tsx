import { CheckCircle2, CloudUpload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { BarraSuperior } from '@/componentes/BarraSuperior';
import { Boton } from '@/componentes/Boton';
import { LimiteError } from '@/componentes/LimiteError';
import { MarcadorSvg } from '@/componentes/mapa/MarcadorSvg';
import { Campo, CampoFoto, PildorasCaudal, Segmentado, SelectorRacor } from '@/componentes/operaciones/Campos';
import { SelectorPin } from '@/componentes/operaciones/SelectorPin';
import { useAcceso, useConexion, usePosicion, usePuntos } from '@/hooks/estado';
import { colaActual, encolar, estaPersistida, procesarCola, reintentarCola } from '@/lib/cola';
import { nombreCaudal, nombreTipo } from '@/lib/ficha';
import type { FotoProcesada } from '@/lib/foto';
import { distancia, hace } from '@/lib/formato';
import { activarPosicion, posicionActual } from '@/lib/posicion';
import {
  type Formulario,
  type MotivoRapido,
  type Coordenadas,
  type Operacion,
  argumentos,
  coordenadasDe,
  necesitaFoto,
  queFalta,
} from '@/lib/propuestas';
import { TITULO_OPERACION } from '@/lib/nombres-operacion';
import { metros } from '@/lib/puntos';
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

type Resultado = 'enviado' | 'guardado' | 'aplicado' | 'solo_en_memoria';

/** Formulario de las seis operaciones (FL-03–FL-08, 07 §7.3). `/proponer/:operacion?p=<punto>`. */
export function Proponer() {
  const { operacion: op } = useParams();
  const [params] = useSearchParams();
  const operacion = OPERACIONES.includes(op as Operacion) ? (op as Operacion) : null;
  const { puntos } = usePuntos();
  const punto = useMemo(() => puntos.find((p) => p.id === params.get('p')) ?? null, [puntos, params]);
  // Alta empezada con una pulsación larga sobre el mapa: el pin nace donde se pulsó (DEC-077).
  const pinInicial = useMemo(() => coordenadasDe(params.get('lat'), params.get('lng')), [params]);
  if (!operacion || (operacion !== 'alta' && !punto)) return <Navigate to="/" replace />;
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
  const gps = posicionActual();
  const jefatura = acceso.tipo === 'jefatura';
  const [foto, setFoto] = useState<FotoProcesada | null>(null);
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
  const [resultado, setResultado] = useState<{ que: Resultado; clave: string } | null>(null);
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
    let persistida: boolean;
    try {
      ({ persistida } = await encolar(
        argumentos(formulario, punto, autor, clave),
        necesitaFoto(operacion) || foto ? (foto?.blob ?? null) : null,
        punto?.codigo ?? null,
      ));
      await procesarCola();
    } catch {
      setFalloGuardar(true);
      setEnviando(false);
      return;
    }
    setResultado({ que: resultadoDe(clave, jefatura, persistida), clave });
    setEnviando(false);
  }

  if (resultado) return <PantallaResultado inicial={resultado.que} clave={resultado.clave} jefatura={jefatura} />;

  const textoBoton = jefatura
    ? T.envio.aplicarAhora
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
      <BarraSuperior titulo={TITULO_OPERACION[operacion]} alVolver={() => navegar(-1)} jefatura={jefatura} />
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
                {T.operaciones.constaComo(nombreCaudal[punto.caudal], hace(punto.fecha_ultima_revision))}
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
                  ? T.avisosFormulario.ajustaPin(Math.round(gps.precision))
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
            <Campo
              etiqueta={operacion === 'estado' ? T.operaciones.caudalAhora : T.formulario.caudal}
              ayuda={T.formulario.caudalAyuda}
            >
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
                  maxLength={500}
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
                maxLength={1000}
                rows={3}
                className={areaTexto}
              />
            </Campo>
          </>
        )}

        {(necesitaFoto(operacion) || operacion === 'datos') && (
          <CampoFoto etiqueta={etiquetaFoto} foto={foto} alCambiar={setFoto} />
        )}

        {operacion === 'alta' && (
          <Campo etiqueta={T.formulario.descripcionOpcional}>
            <input
              value={f.descripcion ?? ''}
              onChange={(e) => cambiar({ descripcion: e.target.value })}
              placeholder={T.formulario.descripcionAyuda}
              aria-label={T.formulario.descripcionOpcional}
              maxLength={500}
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
              maxLength={500}
              className={areaTexto}
            />
          </Campo>
        )}

        {operacion === 'retirada' && <Aviso>{T.operaciones.retiradaAviso}</Aviso>}
        {jefatura && <Aviso>{T.operaciones.jefaturaAviso}</Aviso>}
        {!jefatura && !disponible && (
          <p className="text-texto-suave text-[13px]">
            {conexion === 'sin_cobertura' ? T.envio.avisoSinCobertura : T.envio.avisoSinServidor}
          </p>
        )}

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
  const diametroActual =
    f.diametro ?? (punto?.tipo === 'hidrante' && tipo === 'hidrante' ? (punto.diametro_mm as 70 | 100) : undefined);
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
            alCambiar={(t) => cambiar({ tipo: t })}
            etiqueta={T.formulario.tipoElemento}
          />
        </Campo>
      )}
      {tipo === 'hidrante' && (
        <Campo etiqueta={T.formulario.diametro} ayuda={f.diametro === 'otro' ? undefined : T.formulario.diametroAyuda}>
          <Segmentado
            opciones={
              // "Otra medida" la resuelve jefatura al moderar; jefatura aplica al momento (FR-151), así
              // que fija 70 o 100 directamente (RV-19).
              f.operacion === 'alta' && !jefatura
                ? [
                    [70, T.formulario.d70],
                    [100, T.formulario.d100],
                    ['otro', T.formulario.otraMedida],
                  ]
                : [
                    [70, T.formulario.d70],
                    [100, T.formulario.d100],
                  ]
            }
            valor={diametroActual}
            alCambiar={(d) => cambiar({ diametro: d as 70 | 100 | 'otro' })}
            etiqueta={T.formulario.diametro}
          />
          {f.diametro === 'otro' && (
            <input
              value={f.diametroOtro ?? ''}
              onChange={(e) => cambiar({ diametroOtro: e.target.value })}
              inputMode="numeric"
              placeholder={T.operaciones.phOtraMedida}
              aria-label={T.formulario.otraMedida}
              className={cn(areaTexto, 'mt-1')}
            />
          )}
        </Campo>
      )}
      {tipo === 'boca_riego' && (
        <>
          <Campo etiqueta={T.formulario.diametro}>
            <p className="bg-papel border-linea rounded-campo text-texto-suave min-h-11 border px-3 py-2">
              {T.formulario.diametroBoca}
            </p>
          </Campo>
          <Campo etiqueta={T.formulario.racor}>
            <SelectorRacor valor={racorActual} alCambiar={(r) => cambiar({ racor: r })} />
          </Campo>
        </>
      )}
      {f.operacion === 'datos' && (
        <Campo etiqueta={T.formulario.descripcionOpcional}>
          <input
            value={f.descripcion ?? punto?.descripcion ?? ''}
            onChange={(e) => cambiar({ descripcion: e.target.value })}
            placeholder={T.formulario.descripcionAyuda}
            aria-label={T.formulario.descripcionOpcional}
            maxLength={500}
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
function resultadoDe(clave: string, jefatura: boolean, persistida = estaPersistida(clave)): Resultado {
  const sigue = colaActual().some((i) => i.clave_local === clave);
  if (sigue) return persistida ? 'guardado' : 'solo_en_memoria';
  return jefatura ? 'aplicado' : 'enviado';
}

/** Confirmación de 07 §7.5: qué ha pasado con lo enviado (UI-05). */
function PantallaResultado({ inicial, clave, jefatura }: { inicial: Resultado; clave: string; jefatura: boolean }) {
  const navegar = useNavigate();
  const acceso = useAcceso();
  const [reintentando, setReintentando] = useState(false);
  // Tras "Reintentar ahora" se vuelve a mirar: puede haber salido o haber llegado al móvil (RV-39).
  const [resultado, setResultado] = useState(inicial);
  const titulo = {
    aplicado: T.envio.aplicado,
    guardado: T.envio.guardadoEnMovil,
    solo_en_memoria: T.envio.soloEnMemoria,
    enviado: T.envio.enviado,
  }[resultado];
  const detalle = {
    aplicado: T.operaciones.aplicadoDetalle,
    guardado: T.operaciones.guardadoDetalle,
    solo_en_memoria: T.envio.soloEnMemoriaDetalle,
    enviado: T.envio.jefaturaRevisara,
  }[resultado];
  const pendiente = resultado === 'guardado' || resultado === 'solo_en_memoria';
  const Icono = pendiente ? CloudUpload : CheckCircle2;
  return (
    <div className="flex flex-1 flex-col">
      <BarraSuperior titulo={titulo} jefatura={acceso.tipo === 'jefatura'} />
      <div
        role="status"
        className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <Icono size={44} className={pendiente ? 'text-naranja-600' : 'text-verde-600'} aria-hidden />
        <h2 className="font-titulo text-2xl font-bold">{titulo}</h2>
        <p className="text-texto-suave">{detalle}</p>
        {resultado === 'solo_en_memoria' && (
          <Boton
            className="mt-3 w-full"
            disabled={reintentando}
            onClick={() => {
              setReintentando(true);
              void reintentarCola().finally(() => {
                setReintentando(false);
                setResultado(resultadoDe(clave, jefatura));
              });
            }}
          >
            {reintentando ? T.operaciones.enviando : T.envio.reintentarAhora}
          </Boton>
        )}
        <Boton className="mt-3 w-full" onClick={() => navegar('/', { replace: true })}>
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
