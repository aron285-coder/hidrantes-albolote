import { useEffect, useMemo, useState } from 'react';
import { usePanel } from './usar-panel';
import { MinimapaPropuesta } from './MinimapaPropuesta';
import { Boton } from '@/componentes/Boton';
import { distancia, fechaCorta, hace } from '@/lib/formato';
import { nombreCaudal, nombreRacor, nombreTipo, urlFoto } from '@/lib/ficha';
import { ETIQUETA_OPERACION } from '@/lib/nombres-operacion';
import {
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
  filasDiff,
  fusionar,
  rechazar,
  senales,
  valoresPropuestos,
} from '@/lib/panel/cola';
import { textoError } from '@/lib/panel/errores';
import type { Caudal, Punto, Racor, TipoPunto } from '@/lib/puntos';
import { T } from '@/lib/textos';
import { cn } from '@/lib/utils';

type Modo = null | 'corregir' | 'rechazar' | 'fusionar';

/** Detalle de una propuesta (FR-102–FR-109, FL-21): minimapa, dirección, diff, señales, foto y acciones. */
export function DetallePropuesta({ p, puntos, alHecho }: { p: PropuestaPanel; puntos: Punto[]; alHecho: () => void }) {
  const { avisar } = usePanel();
  const punto = useMemo(() => puntos.find((x) => x.id === p.punto_id), [puntos, p.punto_id]);
  const duplicado = useMemo(() => puntos.find((x) => x.id === p.duplicado_de), [puntos, p.duplicado_de]);
  const [modo, setModo] = useState<Modo>(null);
  const [ocupado, setOcupado] = useState(false);
  const [direccion, setDireccion] = useState(p.direccion_sugerida ?? '');
  const pendiente = p.estado === 'pendiente';
  const editable = pendiente && conUbicacion(p);

  // Dirección deducida (FR-105): si aún no la hay, se pide a Nominatim sin bloquear nada.
  useEffect(() => {
    if (!editable || p.direccion_sugerida) return;
    let vigente = true;
    void deducirDireccion(p).then((d) => {
      if (vigente && d) setDireccion((actual) => (actual ? actual : d));
    });
    return () => {
      vigente = false;
    };
    // Una vez por propuesta: el componente se monta con key = id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ejecutar(
    accion: () => Promise<{ ok: true; datos?: unknown } | { ok: false; codigo: string }>,
    exito: string,
  ) {
    setOcupado(true);
    const r = await accion();
    setOcupado(false);
    if (!r.ok) {
      avisar(textoError(r.codigo), 'error');
      // Otra persona la resolvió o el punto cambió: se recarga para ver el estado real.
      if (/PROPUESTA_NO_PENDIENTE|PROPUESTA_DESACTUALIZADA|PUNTO_NO_ACTIVO/.test(r.codigo)) alHecho();
      return;
    }
    avisar(exito);
    alHecho();
  }

  const aprobarTalCual = () =>
    ejecutar(
      async () => {
        const r = await aprobar(p.id, conDireccion({}, direccion, p.direccion_sugerida), p.desactualizada);
        return r.ok ? { ok: true as const, datos: r.datos } : r;
      },
      T.panelCola.aprobada(p.codigo ?? T.panelCola.nuevo),
    );

  const titulo = `${p.codigo ?? T.panelCola.nuevo} · ${ETIQUETA_OPERACION[p.operacion]}`;
  const foto = urlFoto(p.foto_path);
  const bloqueoAprobar = p.otra_medida ? T.panelCola.fijaDiametro : null;
  const comparar = pendiente && p.operacion === 'alta' && duplicado;

  return (
    <article className="text-sm">
      <h2 className="font-titulo text-texto text-[17px] font-semibold">{titulo}</h2>
      <p className="text-texto-suave mb-3 text-[13px]">
        {T.panelCola.propuestoPor(
          autor(p),
          `${hace(p.creada_en)} (${fechaCorta(p.creada_en)})`,
          p.nucleo ?? (p.fuera_de_zona ? T.panelCola.fueraDeZona : T.panelCola.sinNucleo),
        )}
      </p>

      {pendiente && conUbicacion(p) && (
        <MinimapaPropuesta
          lat={p.lat!}
          lng={p.lng!}
          original={p.operacion === 'ubicacion' ? punto : undefined}
          duplicado={duplicado}
        />
      )}

      {comparar && <Comparacion p={p} existente={duplicado} direccion={direccion} />}

      <div className="border-linea bg-papel rounded-campo mb-2 flex items-center gap-2 border px-3 py-1.5">
        <span className="text-texto-suave w-[30%] shrink-0 text-[13px]">{T.ficha.direccion}</span>
        {editable ? (
          <input
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder={T.ficha.sinDireccion}
            aria-label={T.ficha.direccion}
            className="border-linea rounded-campo min-h-9 flex-1 border px-2"
          />
        ) : (
          <span className="flex-1">{p.direccion_actual ?? p.direccion_sugerida ?? T.ficha.sinDireccion}</span>
        )}
        <span className="bg-fondo text-texto-suave rounded px-1.5 text-[11px]">
          {editable ? T.panelCola.deducidaEditable : T.panelCola.delPunto}
        </span>
      </div>

      {!comparar && <Diff p={p} punto={punto} />}

      {pendiente && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={T.panelCola.senales}>
          {senales(p).map((s) => (
            <li
              key={s.texto}
              className={cn(
                'rounded-campo border px-2 py-0.5 text-[12px]',
                s.aviso ? 'border-oro-600 bg-ambar-100 text-ambar-700' : 'border-verde-600 text-verde-600',
              )}
            >
              {s.aviso ? '⚠ ' : '✓ '}
              {s.texto}
            </li>
          ))}
        </ul>
      )}

      {foto ? (
        <a href={foto} target="_blank" rel="noreferrer" className="rounded-tarjeta mb-3 block overflow-hidden">
          <img
            src={foto}
            alt={T.panelCola.fotoVoluntario}
            className="max-h-72 w-full bg-[linear-gradient(180deg,#C6D2DA,#8C968F)] object-contain"
          />
        </a>
      ) : (
        <p className="text-texto-suave mb-3 text-[13px]">{T.panelCola.fotoSinDatos}</p>
      )}

      {pendiente ? (
        <>
          {p.desactualizada && (
            <p className="border-rojo-700 bg-rojo-100 text-rojo-700 rounded-campo mb-2 border px-3 py-2 text-[13px]">
              {T.panelCola.desactualizada(p.punto_actualizado_en ? hace(p.punto_actualizado_en) : '—')}
            </p>
          )}
          {modo === null && (
            <div className="flex flex-wrap gap-3">
              <div>
                <Boton
                  className={p.desactualizada ? 'bg-rojo-700' : 'bg-verde-600'}
                  disabled={ocupado || !!bloqueoAprobar}
                  onClick={() => void aprobarTalCual()}
                >
                  {p.desactualizada ? T.panelCola.confirmarYAprobar : T.panelCola.aprobar}
                </Boton>
                {bloqueoAprobar && <p className="text-texto-suave mt-1 max-w-48 text-[11px]">{bloqueoAprobar}</p>}
              </div>
              {p.operacion !== 'retirada' && (
                <Boton variante="secundario" disabled={ocupado} onClick={() => setModo('corregir')}>
                  {T.panelCola.aprobarConCorrecciones}
                </Boton>
              )}
              {comparar && (
                <Boton
                  variante="secundario"
                  className="border-oro-600 text-ambar-700"
                  disabled={ocupado}
                  onClick={() => setModo('fusionar')}
                >
                  {T.panelCola.fusionarCon(duplicado.codigo)}
                </Boton>
              )}
              <Boton
                variante="secundario"
                className="border-rojo-700 text-rojo-700"
                disabled={ocupado}
                onClick={() => setModo('rechazar')}
              >
                {T.panelCola.rechazar}
              </Boton>
            </div>
          )}
          {modo === 'corregir' && (
            <FormularioCorrecciones
              p={p}
              punto={punto}
              direccion={direccion}
              ocupado={ocupado}
              alCancelar={() => setModo(null)}
              alGuardar={(c, dir) =>
                void ejecutar(
                  async () => {
                    const r = await aprobar(p.id, conDireccion(c, dir, p.direccion_sugerida), p.desactualizada);
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
                  const r = await fusionar(p.id, duplicado.id, prev);
                  return r.ok ? { ok: true as const } : r;
                }, T.panelCola.fusionada(duplicado.codigo))
              }
            />
          )}
        </>
      ) : (
        <Decision p={p} puntos={puntos} />
      )}
    </article>
  );
}

function Diff({ p, punto }: { p: PropuestaPanel; punto?: Punto }) {
  const filas = filasDiff(p, punto);
  if (!filas.length) return null;
  return (
    <dl className="border-linea bg-papel rounded-campo mb-2 overflow-hidden border">
      {filas.map((f) => (
        <div key={f.campo} className="border-linea flex border-b last:border-b-0">
          <dt className="text-texto-suave bg-fondo w-[30%] shrink-0 px-3 py-1.5 text-[13px]">{f.campo}</dt>
          <dd className="flex-1 px-3 py-1.5">
            {f.antes !== undefined && (
              <>
                <del className="text-rojo-700 opacity-75">{f.antes}</del>
                <span aria-hidden> → </span>
              </>
            )}
            <span className={f.sinCambios ? 'text-texto-suave' : 'text-verde-600 font-semibold'}>{f.despues}</span>
          </dd>
        </div>
      ))}
    </dl>
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
    [T.panelCola.campoEstado, nombreCaudal[v.caudal], nombreCaudal[existente.caudal]],
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
                <td key={i} className={cn('border-linea border-b px-2 py-1', a !== b && 'bg-ambar-100 text-ambar-700')}>
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
  const c = { ...(p.correcciones ?? {}) } as Record<string, unknown>;
  const puntoId = c.punto_id as string | undefined;
  const fusionadaCon = c.fusionada_con as string | undefined;
  delete c.punto_id;
  delete c.fusionada_con;
  const codigo = puntoId && p.operacion === 'alta' ? puntos.find((x) => x.id === puntoId)?.codigo : undefined;
  const cambios = Object.entries(c)
    .map(([k, v]) => `${etiquetaCampo(k)} → ${String(v)}`)
    .join(', ');
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

const CAUDALES: Caudal[] = ['bueno', 'regular', 'malo', 'no_funciona'];
const RACORES: Racor[] = ['granada', 'barcelona', 'otro'];

function FormularioCorrecciones({
  p,
  punto,
  direccion,
  ocupado,
  alGuardar,
  alCancelar,
}: {
  p: PropuestaPanel;
  punto?: Punto;
  direccion: string;
  ocupado: boolean;
  alGuardar: (correcciones: Record<string, unknown>, direccion: string) => void;
  alCancelar: () => void;
}) {
  const propuesto = useMemo(() => valoresPropuestos(p, punto), [p, punto]);
  const [v, setV] = useState<ValoresPunto>(propuesto);
  const [dir, setDir] = useState(direccion || p.direccion_actual || '');
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
      <Fila etiqueta={T.panelCola.campoTipo}>
        <select
          value={v.tipo}
          onChange={(e) => {
            const tipo = e.target.value as TipoPunto;
            setV((x) => ({
              ...x,
              tipo,
              diametro_mm: tipo === 'boca_riego' ? 45 : x.diametro_mm === 45 ? null : x.diametro_mm,
              racor: tipo === 'boca_riego' ? x.racor : null,
            }));
          }}
          className="border-linea rounded-campo min-h-9 flex-1 border px-2"
        >
          <option value="hidrante">{nombreTipo.hidrante}</option>
          <option value="boca_riego">{nombreTipo.boca_riego}</option>
        </select>
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
        <Fila etiqueta={T.panelCola.campoRacor}>
          <select
            value={v.racor ?? ''}
            onChange={(e) => cambia('racor', (e.target.value || null) as Racor | null)}
            className="border-linea rounded-campo min-h-9 flex-1 border px-2"
          >
            {!v.racor && <option value="">—</option>}
            {RACORES.map((r) => (
              <option key={r} value={r}>
                {nombreRacor(r)}
              </option>
            ))}
          </select>
        </Fila>
      )}
      <Fila etiqueta={T.panelCola.campoEstado}>
        <select
          value={v.caudal}
          onChange={(e) => cambia('caudal', e.target.value as Caudal)}
          className="border-linea rounded-campo min-h-9 flex-1 border px-2"
        >
          {CAUDALES.map((c) => (
            <option key={c} value={c}>
              {nombreCaudal[c]}
            </option>
          ))}
        </select>
      </Fila>
      {v.caudal === 'no_funciona' && (
        <Fila etiqueta={T.panelCola.campoFallo}>
          <input
            value={v.descripcion_fallo}
            onChange={(e) => cambia('descripcion_fallo', e.target.value)}
            className="border-linea rounded-campo min-h-9 flex-1 border px-2"
          />
        </Fila>
      )}
      <Fila etiqueta={T.panelCola.campoDescripcion}>
        <input
          value={v.descripcion}
          onChange={(e) => cambia('descripcion', e.target.value)}
          className="border-linea rounded-campo min-h-9 flex-1 border px-2"
        />
      </Fila>
      <Fila etiqueta={T.ficha.direccion}>
        <input
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          className="border-linea rounded-campo min-h-9 flex-1 border px-2"
        />
      </Fila>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <Boton type="submit" className="bg-verde-600" disabled={ocupado || !!falta}>
            {T.panelCola.guardarYAprobar}
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
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={T.panelCola.phMotivo}
          rows={3}
          className="border-linea rounded-campo mt-1 block w-full border p-2"
        />
      </label>
      <p className="text-texto-suave mt-1 text-[12px]">{T.panelCola.avisoNombres}</p>
      {intentado && !motivo.trim() && <p className="text-rojo-700 mt-1 text-[12px]">{T.panelCola.sinMotivo}</p>}
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
    <div className="border-oro-600 bg-oro-100 rounded-campo border p-3">
      <p className="font-semibold">{T.panelCola.fusionTitulo(existente.codigo)}</p>
      <p className="mb-2 text-[13px]">{T.panelCola.fusionExplica(existente.codigo)}</p>
      {difs.map((d) => (
        <Fila key={d.campo} etiqueta={d.campo === 'ubicacion' ? T.panelCola.campoUbicacion : etiquetaCampo(d.campo)}>
          <select
            value={elegido[d.campo] ?? 'existente'}
            onChange={(e) => setElegido((x) => ({ ...x, [d.campo]: e.target.value as Prevalece }))}
            className="border-linea bg-papel rounded-campo min-h-9 flex-1 border px-2"
          >
            <option value="existente">
              {d.campo === 'ubicacion' ? d.existente : T.panelCola.valorExistente(d.existente)}
            </option>
            <option value="propuesta">
              {d.campo === 'ubicacion' ? d.propuesta : T.panelCola.valorPropuesta(d.propuesta)}
            </option>
          </select>
        </Fila>
      ))}
      <div className="mt-2 flex gap-3">
        <Boton
          variante="secundario"
          className="border-oro-600 text-ambar-700"
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
