// Cola de envíos del móvil (FR-82–FR-84, 05 §10). Toda propuesta pasa por aquí, haya cobertura o no:
// se guarda con su foto en IndexedDB y se envía en orden: url-subida → PUT de la foto → fn_proponer.
// La marca `clave_local` es la misma en cada reintento, así que nada se duplica (FR-49).

import { SIN_SERVIDOR, rpc } from './api';
import { type AlmacenCola, alReabrir, almacenCola } from './bd';
import { escribir } from './almacen';
import { anotarServidor, espera, registrarComprobacion, reintentarAhora } from './conexion';
import { anotarError } from './errores';
import type { ArgumentosPropuesta } from './propuestas';
import { pedirEnvioComoJefatura } from './panel/push-jefatura';
import { pedirEnvioPush } from './push';
import { LIMITES_RED, conLimite } from './red';
import { leerSesion } from './sesion';
import { supabase } from './supabase';

export interface EnCola {
  clave_local: string;
  creada_en: number;
  args: ArgumentosPropuesta;
  foto: Blob | null;
  foto_path: string | null;
  /**
   * La foto del sitio (docs/24 RV-103, DEC-146): solo en alta y ubicación. Un envío guardado por la
   * versión anterior no tiene el campo: se lee tal cual y sale con la firma vieja de fn_proponer.
   */
  foto_sitio?: Blob | null;
  foto_sitio_path?: string | null;
  /**
   * Guardado por esta versión: sale con la firma nueva de fn_proponer. Un envío de la versión
   * anterior no lo tiene y sale con la de antes; se marca aparte para no depender de si un campo
   * existe (DEC-150).
   */
  firma_nueva?: true;
  /** FOTO_NO_RESERVADA seguidos: al segundo se vuelven a subir las dos fotos (DEC-150). */
  no_reservada_seguidas?: number;
  /** Código del punto, o null en un alta, para enseñarlo en Mis propuestas. */
  codigo: string | null;
  intentos: number;
  proximo: number;
  /** Error permanente (05 §8): no se reintenta y se enseña al voluntario. */
  fallo: string | null;
  /** Intentos seguidos con un error que no es de paso (RV-03); ausente en envíos guardados antes. */
  fallos_seguidos?: number;
  /**
   * Reserva de subida pedida y aún sin usar (docs/31 RV-156): si la subida falla, el siguiente intento
   * la reutiliza mientras su URL firmada no caduque, en vez de gastar otra del tope diario.
   */
  reserva_foto?: Reserva | null;
  reserva_foto_sitio?: Reserva | null;
  /** Espera sin ser un error, con su aviso en Mis propuestas (docs/31 RV-154). */
  en_espera?: EnEspera | null;
}

/** Lo que devuelve /api/url-subida, con la hora (ms) a la que caduca su URL firmada. */
export interface Reserva {
  url: string;
  foto_path: string;
  caduca_en: number;
}

/**
 * Por qué tope espera la cola (docs/31 RV-154, docs/32 RV-232): el de propuestas al día, el de fotos
 * del móvil o del grupo, el espacio de fotos o de la base de datos, o demasiadas fotos de este móvil a
 * medio subir. Un envío guardado por la versión anterior solo puede traer `cuota_propuestas`.
 */
export type MotivoEspera =
  | 'cuota_propuestas'
  | 'cuota_propuestas_nuevo'
  | 'cuota_propuestas_grupo'
  | 'cuota_fotos'
  | 'cuota_fotos_grupo'
  | 'sin_espacio_fotos'
  | 'sin_espacio'
  | 'reservas_abiertas';

/** La espera por un tope: `maximo` si el servidor lo dice. */
export interface EnEspera {
  motivo: MotivoEspera;
  maximo: number | null;
}

export interface Enviada {
  clave_local: string;
  estado: 'pendiente' | 'aprobada';
  aplicada: boolean;
  codigo: string | null;
}

/** Errores que no se arreglan reintentando: se muestran (FR-84, TR-36). */
const PERMANENTES = [
  'PAYLOAD_INVALIDO',
  'FOTO_OBLIGATORIA',
  'PUNTO_NO_ENCONTRADO',
  'PUNTO_NO_ACTIVO',
  'DIAMETRO_SIN_FIJAR',
  'FOTO_SITIO_OBLIGATORIA',
  'TIPO_NO_MODIFICABLE',
];
export const esPermanente = (codigo: string) => PERMANENTES.some((p) => codigo.startsWith(p));

/**
 * Errores de paso: se reintentan con retroceso sin límite. NO_AUTORIZADO es la sesión de jefatura
 * caducada, que comprobarAcceso resuelve; FOTO_NO_RESERVADA se arregla subiendo otra vez la foto.
 * Cualquier otro (DESCONOCIDO, ERROR_INTERNO…) también se reintenta, pero a los cinco seguidos se
 * marca fallo: así no se insiste para siempre y el envío sigue siendo recuperable a mano (RV-03).
 */
const TRANSITORIOS = [SIN_SERVIDOR, 'NO_AUTORIZADO', 'FOTO_NO_RESERVADA'];
export const MAX_FALLOS_SEGUIDOS = 5;

const HORA = 3600_000;

/**
 * Los topes del servidor (docs/32 RV-232): con cualquiera de ellos la pasada se para y toda la cola
 * espera a la hora que diga el servidor. Con o sin sufijo (`CUOTA_SUBIDAS_AGOTADA(global)`, RV-142).
 * `SIN_ESPACIO_FOTOS` va antes que `SIN_ESPACIO`, que es su prefijo.
 */
const TOPES: [string, MotivoEspera][] = [
  ['CUOTA_PROPUESTAS_AGOTADA', 'cuota_propuestas'],
  ['CUOTA_SUBIDAS_AGOTADA', 'cuota_fotos'],
  ['SIN_ESPACIO_FOTOS', 'sin_espacio_fotos'],
  ['SIN_ESPACIO', 'sin_espacio'],
  ['RESERVAS_ABIERTAS', 'reservas_abiertas'],
];

export interface Tope {
  motivo: MotivoEspera;
  ms: number;
  maximo: number | null;
}

/**
 * ¿Es un tope, y cuánto se espera? El servidor puede decir `reintentar_en_s=S` (y `maximo=N`) en el
 * texto del error; sin eso, el de propuestas espera a la próxima medianoche y los demás una hora.
 */
export function esperaPorTope(codigo: string, mensaje?: string, ahora = Date.now()): Tope | null {
  const tope = TOPES.find(([prefijo]) => codigo.startsWith(prefijo));
  if (!tope) return null;
  let motivo = tope[1];
  // De quién es el tope (0041/0042, docs/32 RV-245): `ambito=token_nuevo|grupo|dispositivo` en el texto.
  const ambito = /\bambito=([a-z_]+)/.exec(mensaje ?? '')?.[1];
  const delGrupo = ambito === 'grupo' || codigo.includes('(global)');
  if (motivo === 'cuota_propuestas') {
    if (ambito === 'token_nuevo') motivo = 'cuota_propuestas_nuevo';
    else if (delGrupo) motivo = 'cuota_propuestas_grupo';
    return { motivo, ...esperaCuotaPropuestas(mensaje, ahora) };
  }
  if (motivo === 'cuota_fotos' && delGrupo) motivo = 'cuota_fotos_grupo';
  const segundos = /reintentar_en_s=(\d+)/.exec(mensaje ?? '');
  const maximo = /maximo=(\d+)/.exec(mensaje ?? '');
  return {
    motivo,
    ms: Math.max(1000, segundos ? Number(segundos[1]) * 1000 : HORA),
    // El de espacio de fotos viene en bytes: no se enseña.
    maximo: maximo && motivo !== 'sin_espacio_fotos' ? Number(maximo[1]) : null,
  };
}

/** ¿Espera este envío por un tope, todavía? Pasada la hora, ya no (aunque aún no se haya intentado). */
export const esperaTope = (i: Pick<EnCola, 'en_espera' | 'fallo' | 'proximo'>, ahora = Date.now()) =>
  !i.fallo && !!i.en_espera && i.proximo > ahora;

/**
 * El tope de propuestas al día (docs/31 RV-141, RV-154): el servidor dice en el texto del error
 * `maximo=N reintentar_en_s=S`. Sin esos números, se espera a la próxima medianoche del móvil.
 */
export function esperaCuotaPropuestas(
  mensaje: string | undefined,
  ahora = Date.now(),
): { ms: number; maximo: number | null } {
  const segundos = /reintentar_en_s=(\d+)/.exec(mensaje ?? '');
  const maximo = /maximo=(\d+)/.exec(mensaje ?? '');
  let ms: number;
  if (segundos) ms = Number(segundos[1]) * 1000;
  else {
    const medianoche = new Date(ahora);
    medianoche.setHours(24, 0, 0, 0);
    // Un poco después, y con algo de azar: que no lleguen todos los móviles a la vez.
    ms = medianoche.getTime() - ahora + Math.round(60_000 + Math.random() * 10 * 60_000);
  }
  return { ms: Math.max(1000, ms), maximo: maximo ? Number(maximo[1]) : null };
}

/** Margen para no empezar una subida con una URL firmada a punto de caducar (RV-156). */
const MARGEN_RESERVA_MS = 5 * 60_000;
/** Aviso de envío atascado (FR-83). */
export const ATASCADO_MS = 24 * HORA;

let almacen: AlmacenCola<EnCola> | null = null;
const bd = () => (almacen ??= almacenCola<EnCola>());

let items: EnCola[] = [];
let cargada = false;
const oyentes = new Set<() => void>();
const alEnviar = new Set<(e: Enviada) => void>();

function publicar(nuevos: EnCola[]) {
  items = [...nuevos].sort((a, b) => a.creada_en - b.creada_en);
  oyentes.forEach((o) => o());
}

export const colaActual = () => items;
export function suscribirCola(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}
/** Para refrescar el mapa (jefatura) o Mis propuestas cuando algo sale. */
export function alEnviarPropuesta(f: (e: Enviada) => void): () => void {
  alEnviar.add(f);
  return () => alEnviar.delete(f);
}

export const atascados = (ahora = Date.now()) => items.filter((i) => ahora - i.creada_en > ATASCADO_MS);

export async function cargarCola(): Promise<void> {
  try {
    const guardados = await bd().todos();
    for (const i of guardados) persistidas.add(i.clave_local);
    publicar(guardados);
  } catch {
    // sin IndexedDB, la cola vive en memoria
  }
  cargada = true;
}

let errorGuardadoAnotado = false;
/** Envíos que llegaron a IndexedDB en su último guardado (RV-02, docs/18 RV-39). */
const persistidas = new Set<string>();

/** Si un envío está guardado en el móvil o solo en memoria ("Solo en memoria", RV-02). */
export const estaPersistida = (clave: string) => persistidas.has(clave);

/**
 * Qué ha pasado con un envío, para la pantalla de resultado: ya salió; tiene un error permanente y
 * no se enviará solo (#484); o espera, guardado en el móvil o solo en memoria (RV-02).
 */
export function estadoDeEnvio(
  cola: readonly EnCola[],
  clave: string,
): 'salio' | 'fallido' | 'guardado' | 'solo_en_memoria' {
  const item = cola.find((i) => i.clave_local === clave);
  if (!item) return 'salio';
  if (item.fallo) return 'fallido';
  return persistidas.has(clave) ? 'guardado' : 'solo_en_memoria';
}

/**
 * Publica en memoria y escribe en IndexedDB. Nunca lanza: sin IndexedDB (navegación privada, cuota
 * agotada) se puede enviar igual con cobertura. Devuelve si quedó guardado en el móvil (RV-02); el
 * primer fallo de la sesión se anota para que llegue a errores_cliente.
 *
 * Con `gen`, no escribe nada si la cola se vació desde entonces, y deshace lo escrito si se vació
 * mientras escribía: un reintento en vuelo no resucita envíos de una sesión cerrada (RV-04, RV-39).
 */
async function guardar(item: EnCola, gen?: number): Promise<boolean> {
  if (gen !== undefined && gen !== generacion) return false;
  publicar([...items.filter((i) => i.clave_local !== item.clave_local), item]);
  try {
    await bd().guardar(item);
    if (gen !== undefined && gen !== generacion) {
      await bd()
        .quitar(item.clave_local)
        .catch(() => undefined);
      return false;
    }
    marcarPersistida(item.clave_local, true);
    // IndexedDB vuelve a funcionar: lo que se quedó solo en memoria se intenta guardar ya (RV-231).
    if (items.some((i) => !persistidas.has(i.clave_local))) void persistirPendientes();
    return true;
  } catch (e) {
    marcarPersistida(item.clave_local, false);
    if (!errorGuardadoAnotado) {
      errorGuardadoAnotado = true;
      anotarError(e, 'cola');
    }
    return false;
  }
}

/**
 * Anota si un envío está guardado en IndexedDB y, si cambia, vuelve a publicar la cola: quien la
 * sigue (la pantalla de resultado, «Guardado en el móvil» o «Sin guardar», docs/31 #501) se entera.
 * Antes se cambiaba después de publicar y sin avisar a nadie.
 */
function marcarPersistida(clave: string, si: boolean) {
  if (persistidas.has(clave) === si) return;
  if (si) persistidas.add(clave);
  else persistidas.delete(clave);
  if (items.some((i) => i.clave_local === clave)) publicar(items);
}

let persistiendo = false;
let otraVez = false;

/**
 * Guarda en IndexedDB lo que está solo en memoria (docs/32 RV-231): al volver a abrirse IndexedDB o
 * tras un guardado bueno. Lee la memoria dentro de la transacción, como `adelantar`: lo que ya salió
 * o se vació al cerrar sesión no se escribe.
 */
async function persistirPendientes(): Promise<void> {
  if (persistiendo) {
    // Alguien lo pidió durante una pasada: al acabar se da otra.
    otraVez = true;
    return;
  }
  persistiendo = true;
  const gen = generacion;
  try {
    for (const clave of items.filter((i) => !persistidas.has(i.clave_local)).map((i) => i.clave_local)) {
      if (gen !== generacion) return;
      try {
        const escrito = await bd().actualizar(clave, () =>
          gen === generacion ? (items.find((x) => x.clave_local === clave) ?? null) : null,
        );
        if (escrito && gen === generacion && items.some((x) => x.clave_local === clave)) marcarPersistida(clave, true);
      } catch (e) {
        // Este sigue «Sin guardar» y se volverá a intentar; los demás se intentan igual. El primer
        // fallo de la sesión queda anotado, como en guardar.
        if (!errorGuardadoAnotado) {
          errorGuardadoAnotado = true;
          anotarError(e, 'cola');
        }
      }
    }
  } finally {
    persistiendo = false;
    const repetir = otraVez && gen === generacion;
    otraVez = false;
    if (repetir) void persistirPendientes();
  }
}

async function quitar(clave: string) {
  persistidas.delete(clave);
  publicar(items.filter((i) => i.clave_local !== clave));
  try {
    await bd().quitar(clave);
  } catch {
    // ya no estaba
  }
}

/**
 * Guarda la propuesta con su foto y trata de enviarla ya. `persistida: false` quiere decir que solo
 * está en memoria: si la aplicación se cierra antes de enviarla, se pierde (RV-02).
 */
export async function encolar(
  args: ArgumentosPropuesta,
  foto: Blob | null,
  codigo: string | null,
  fotoSitio: Blob | null = null,
): Promise<{ persistida: boolean }> {
  if (!cargada) await cargarCola();
  // Si la cola espera por un tope, lo nuevo espera con ella: chocaría con el mismo (RV-232).
  const enTope = items.find((i) => esperaTope(i));
  const persistida = await guardar({
    clave_local: args.clave_local,
    creada_en: Date.now(),
    args,
    foto,
    foto_path: null,
    foto_sitio: fotoSitio,
    foto_sitio_path: null,
    firma_nueva: true,
    codigo,
    intentos: 0,
    proximo: enTope ? enTope.proximo : 0,
    fallo: null,
    en_espera: enTope ? enTope.en_espera : null,
  });
  void procesarCola();
  return { persistida };
}

/** Descartar a mano un envío con error permanente (Mis propuestas, con confirmación). */
export const descartar = (clave: string) => quitar(clave);

/**
 * Generación de la cola: vaciarla la cambia, y un envío que estaba en vuelo al cerrar sesión ya no
 * escribe nada al volver ni se manda con el token viejo (RV-04, FL-12, FR-27).
 */
let generacion = 0;
const COLA_VACIADA = 'COLA_VACIADA';

/** Cerrar sesión borra la cola (FL-12), avisando antes en Ajustes. */
export async function vaciarCola(): Promise<void> {
  generacion++;
  persistidas.clear();
  publicar([]);
  try {
    await bd().vaciar();
  } catch {
    // nada guardado
  }
}

// ---------- envío ----------

type Credencial = { token: string } | { jwt: string };

async function credencial(): Promise<Credencial | null> {
  const s = leerSesion();
  if (s) return { token: s.token };
  const cliente = supabase();
  if (!cliente) return null;
  const { data } = await cliente.auth.getSession();
  return data.session ? { jwt: data.session.access_token } : null;
}

type Paso = { ok: true } | { ok: false; codigo: string; mensaje?: string };

type CualFoto = 'foto' | 'foto_sitio';

const campoRuta = (cual: CualFoto) => (cual === 'foto' ? 'foto_path' : 'foto_sitio_path');
const campoReserva = (cual: CualFoto) => (cual === 'foto' ? 'reserva_foto' : 'reserva_foto_sitio');

/** POST /api/url-subida: una ruta reservada y su URL firmada. */
async function pedirReserva(
  c: Credencial,
): Promise<{ ok: true; reserva: Reserva } | { ok: false; codigo: string; mensaje?: string }> {
  let respuesta: Response;
  try {
    respuesta = await fetch('/api/url-subida', {
      method: 'POST',
      signal: conLimite(LIMITES_RED.reserva),
      headers: {
        'Content-Type': 'application/json',
        ...('jwt' in c ? { Authorization: `Bearer ${c.jwt}` } : {}),
      },
      body: JSON.stringify('token' in c ? { token: c.token } : {}),
    });
  } catch {
    return { ok: false, codigo: SIN_SERVIDOR };
  }
  const cuerpo = (await respuesta.json().catch(() => ({}))) as {
    foto_path?: string;
    url?: string;
    caduca_en_s?: number;
    error?: string;
    mensaje?: string;
    maximo?: number;
    reintentar_en_s?: number;
    ambito?: string;
  };
  if (!respuesta.ok || !cuerpo.url || !cuerpo.foto_path) {
    if (respuesta.status >= 500 || !cuerpo.error) return { ok: false, codigo: SIN_SERVIDOR };
    // Los números de un tope (RV-232, RV-245), si la respuesta los trae, en la forma del texto de las RPC.
    const numeros = [
      typeof cuerpo.maximo === 'number' ? `maximo=${cuerpo.maximo}` : '',
      typeof cuerpo.reintentar_en_s === 'number' ? `reintentar_en_s=${cuerpo.reintentar_en_s}` : '',
      typeof cuerpo.ambito === 'string' && /^[a-z_]+$/.test(cuerpo.ambito) ? `ambito=${cuerpo.ambito}` : '',
    ].join(' ');
    const texto = typeof cuerpo.mensaje === 'string' ? cuerpo.mensaje : '';
    return { ok: false, codigo: cuerpo.error, mensaje: `${texto} ${numeros}`.trim() };
  }
  // Sin caducidad en la respuesta no se reutiliza: se da por caducada ya.
  const caduca_en = typeof cuerpo.caduca_en_s === 'number' ? Date.now() + cuerpo.caduca_en_s * 1000 : 0;
  return { ok: true, reserva: { url: cuerpo.url, foto_path: cuerpo.foto_path, caduca_en } };
}

/**
 * La subida anterior con esta misma URL llegó, pero no su respuesta: Storage contesta "ya existe"
 * (409, o 400 con `Duplicate` en versiones anteriores). La ruta es de esta reserva: la foto está.
 */
async function yaSubida(r: Response): Promise<boolean> {
  if (r.status === 409) return true;
  if (r.status !== 400) return false;
  const texto = await r.text().catch(() => '');
  return /duplicate|already exists/i.test(texto);
}

/**
 * Sube una de las dos fotos y guarda su ruta en el envío. Reutiliza la reserva del intento anterior
 * mientras su URL firmada no haya caducado (docs/31 RV-156): con horas de señal mala, cada reintento
 * ya no gasta una del tope diario. Una reserva nueva se guarda antes de subir.
 */
async function subirFoto(item: EnCola, cual: CualFoto, c: Credencial, gen: number): Promise<Paso> {
  const blob = item[cual]!;
  let reserva = item[campoReserva(cual)] ?? null;
  if (!reserva || reserva.caduca_en - Date.now() < LIMITES_RED.foto + MARGEN_RESERVA_MS) {
    const r = await pedirReserva(c);
    if (!r.ok) return r;
    reserva = r.reserva;
    const actual = items.find((i) => i.clave_local === item.clave_local);
    if (gen !== generacion || !actual) return { ok: false, codigo: COLA_VACIADA };
    await guardar({ ...actual, [campoReserva(cual)]: reserva }, gen);
    // Si se cerró sesión mientras se guardaba, no se sube una foto que ya no va a ningún sitio.
    if (gen !== generacion) return { ok: false, codigo: COLA_VACIADA };
  }
  try {
    const subida = await fetch(reserva.url, {
      method: 'PUT',
      signal: conLimite(LIMITES_RED.foto),
      headers: { 'Content-Type': blob.type || 'image/jpeg' },
      body: blob,
    });
    if (!subida.ok && !(await yaSubida(subida))) return { ok: false, codigo: SIN_SERVIDOR };
  } catch {
    return { ok: false, codigo: SIN_SERVIDOR };
  }
  // Si la cola se vació mientras subía, o el envío ya no está, no se resucita nada.
  const actual = items.find((i) => i.clave_local === item.clave_local);
  if (gen !== generacion || !actual) return { ok: false, codigo: COLA_VACIADA };
  await guardar({ ...actual, [campoRuta(cual)]: reserva.foto_path, [campoReserva(cual)]: null });
  return { ok: true };
}

async function enviarUno(clave: string, c: Credencial, gen: number): Promise<Paso> {
  let item = items.find((i) => i.clave_local === clave);
  if (!item) return { ok: true };
  if (item.foto && !item.foto_path) {
    const r = await subirFoto(item, 'foto', c, gen);
    if (!r.ok) return r;
    item = items.find((i) => i.clave_local === clave)!;
  }
  if (item.foto_sitio && !item.foto_sitio_path) {
    const r = await subirFoto(item, 'foto_sitio', c, gen);
    if (!r.ok) return r;
    item = items.find((i) => i.clave_local === clave)!;
  }
  if (gen !== generacion) return { ok: false, codigo: COLA_VACIADA };
  const r = await rpc<{ estado: 'pendiente' | 'aprobada'; aplicada: boolean; codigo: string | null }>('fn_proponer', {
    ...item.args,
    token: 'token' in c ? c.token : null,
    foto_path: item.foto_path,
    // Firma nueva (0035): la clave va siempre, a null si no hay foto del sitio. Sin la clave, PostgREST
    // elegiría la de antes y un alta entraría sin foto del sitio. Un envío de la versión anterior no
    // tiene el campo y sale con la firma vieja: nada de lo que había en cola se pierde (DEC-150).
    ...(item.firma_nueva ? { foto_sitio_path: item.foto_sitio_path ?? null } : {}),
  });
  if (gen !== generacion) return { ok: false, codigo: COLA_VACIADA };
  if (!r.ok) {
    if (r.codigo.startsWith('FOTO_NO_RESERVADA')) {
      // La reserva caducó o se perdió: se sube otra vez, en el siguiente intento, la que falte. 0035 da
      // el mismo código para las dos y lo dice en el texto ("La foto del sitio no se subió…"); se
      // admite también un código con sufijo, por si el servidor lo distingue más adelante. Si no se
      // sabe cuál, o el error se repite (el texto cambió y se adivinó mal), se suben las dos: así no
      // se reintenta para siempre con la misma ruta caducada.
      const seguidas = (item.no_reservada_seguidas ?? 0) + 1;
      const textoServidor = (r.mensaje ?? '').slice((r.mensaje ?? '').indexOf(':') + 1).trim();
      const delSitio = r.codigo.includes('foto_sitio') || /del sitio/i.test(textoServidor);
      const sabido = r.codigo.includes('(') || textoServidor.length > 0;
      const lasDos = !sabido || seguidas > 1;
      await guardar({
        ...item,
        no_reservada_seguidas: seguidas,
        // La reserva que el servidor no reconoce tampoco se reutiliza (RV-156).
        ...(item.foto && (lasDos || !delSitio) ? { foto_path: null, reserva_foto: null } : {}),
        ...(item.foto_sitio && (lasDos || delSitio) ? { foto_sitio_path: null, reserva_foto_sitio: null } : {}),
      });
    }
    return r;
  }
  await quitar(clave);
  alEnviar.forEach((f) =>
    f({ clave_local: clave, estado: r.datos.estado, aplicada: r.datos.aplicada, codigo: r.datos.codigo }),
  );
  return { ok: true };
}

let procesando: Promise<void> | null = null;
/** Algo salió bien en esta llamada: al terminar se pide el envío de avisos, una sola vez (RV-08). */
let huboEnvio: Credencial | null = null;
/** Alguien pidió enviar mientras había una vuelta en curso: al terminarla se da otra (RV-01). */
let otraVuelta = false;
let temporizador: ReturnType<typeof setTimeout> | undefined;

/** Siguiente reintento programado: el más cercano de los que esperan su turno (retroceso). */
function programar() {
  clearTimeout(temporizador);
  const ahora = Date.now();
  const futuros = items.filter((i) => !i.fallo && i.proximo > ahora).map((i) => i.proximo);
  if (!futuros.length) return;
  temporizador = setTimeout(() => void procesarCola(), Math.max(1000, Math.min(...futuros) - ahora));
}

/**
 * Una pasada por la cola en orden. `parar`: no tiene sentido seguir ahora (sin acceso, sin
 * servidor). `reiniciar`: la cola se vació durante la vuelta (cierre de sesión); lo de esta vuelta
 * ya no vale, pero si alguien pidió otra (una propuesta de la sesión nueva) se da (docs/18 RV-39).
 */
async function unaVuelta(c: Credencial, gen: number): Promise<'seguir' | 'parar' | 'reiniciar'> {
  for (const pendiente of [...items]) {
    if (gen !== generacion) return 'reiniciar';
    const actual0 = items.find((i) => i.clave_local === pendiente.clave_local);
    if (!actual0 || actual0.fallo || actual0.proximo > Date.now()) continue;
    const r = await enviarUno(pendiente.clave_local, c, gen);
    if (r.ok) {
      huboEnvio = c;
      continue;
    }
    if (r.codigo === COLA_VACIADA || gen !== generacion) return 'reiniciar';
    const actual = items.find((i) => i.clave_local === pendiente.clave_local);
    if (!actual) continue;
    if (r.codigo.startsWith('TOKEN_')) {
      // Acceso caducado o revocado: lo resuelve acceso (vuelta a la entrada); la cola espera.
      void reintentarAhora();
      return 'parar';
    }
    if (esPermanente(r.codigo)) {
      await guardar({ ...actual, fallo: r.codigo });
      continue;
    }
    const tope = esperaPorTope(r.codigo, r.mensaje);
    if (tope) {
      // Un tope vale para toda la cola (docs/32 RV-232): seguir con las demás solo gastaba reservas y
      // propuestas contra el mismo tope. Todo espera a la hora del servidor; Mis propuestas dice por qué.
      await esperarTodo(tope, pendiente.clave_local, gen);
      return gen === generacion ? 'parar' : 'reiniciar';
    }
    const transitorio = TRANSITORIOS.some((t) => r.codigo.startsWith(t));
    const fallos_seguidos = transitorio ? 0 : (actual.fallos_seguidos ?? 0) + 1;
    if (fallos_seguidos >= MAX_FALLOS_SEGUIDOS) {
      await guardar({ ...actual, fallo: r.codigo, fallos_seguidos });
      continue;
    }
    const intentos = actual.intentos + 1;
    await guardar({ ...actual, intentos, fallos_seguidos, en_espera: null, proximo: Date.now() + espera(intentos) });
    if (r.codigo === SIN_SERVIDOR) {
      anotarServidor(false);
      return 'parar'; // sin servidor no tiene sentido probar los siguientes
    }
  }
  return 'seguir';
}

/**
 * Pone toda la cola (lo que no tiene un error permanente) en espera hasta la hora del tope. Lo que ya
 * esperaba más, sigue esperando lo suyo. El envío que chocó con el tope cuenta un intento.
 */
async function esperarTodo(tope: Tope, elQueChoca: string, gen: number): Promise<void> {
  const hasta = Date.now() + tope.ms;
  const en_espera: EnEspera = { motivo: tope.motivo, maximo: tope.maximo };
  for (const clave of items.map((i) => i.clave_local)) {
    if (gen !== generacion) return;
    const i = items.find((x) => x.clave_local === clave);
    if (!i || i.fallo) continue;
    await guardar(
      {
        ...i,
        intentos: clave === elQueChoca ? i.intentos + 1 : i.intentos,
        fallos_seguidos: 0,
        // Si ya esperaba más por otro tope, se queda con ese motivo y esa hora.
        en_espera: i.en_espera && i.proximo > hasta ? i.en_espera : en_espera,
        proximo: Math.max(i.proximo, hasta),
      },
      gen,
    );
  }
}

/**
 * Envía todo lo que toca, de uno en uno y en orden. Seguro de llamar muchas veces: una llamada
 * durante una vuelta devuelve la misma promesa, que no se resuelve hasta dar otra vuelta más. Así
 * `await procesarCola()` tras encolar espera también a lo recién encolado.
 */
export function procesarCola(): Promise<void> {
  if (procesando) {
    otraVuelta = true;
    return procesando;
  }
  procesando = (async () => {
    // Ceder una vez antes de nada: si el cuerpo terminara sin ningún await, el finally pondría
    // procesando = null antes de que se guarde la promesa, y la cola se quedaría bloqueada.
    await Promise.resolve();
    try {
      if (!cargada) await cargarCola();
      // otraVuelta se apaga al empezar cada vuelta: solo se repite si alguien llamó durante ella.
      do {
        otraVuelta = false;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
        const gen = generacion;
        const c = await credencial();
        if (!c) break;
        const vuelta = await unaVuelta(c, gen);
        if (vuelta === 'parar') break;
        // Tras un cierre de sesión en vuelo, solo se sigue si alguien pidió otra vuelta (RV-39).
        if (vuelta === 'reiniciar' && !otraVuelta) break;
      } while (otraVuelta);
    } finally {
      procesando = null;
      otraVuelta = false;
      programar();
      // "Nueva propuesta" a jefatura sale al momento, sin esperar a la pasada del Worker de avisos (DEC-097).
      if (huboEnvio) pedirAvisos(huboEnvio);
      huboEnvio = null;
    }
  })();
  return procesando;
}

function pedirAvisos(c: Credencial) {
  if ('token' in c) pedirEnvioPush(c.token);
  else void pedirEnvioComoJefatura();
}

/**
 * Vuelve la red o se pulsa "Reintentar": se olvida el retroceso y se intenta ya todo lo pendiente.
 * El retroceso es para no insistir contra un servidor caído, no para hacer esperar al volver la señal.
 */
export async function reintentarCola(): Promise<void> {
  if (!cargada) await cargarCola();
  const gen = generacion;
  // Por clave, y cada elemento leído en el momento: una pasada en curso puede haberlo cambiado o
  // enviado mientras se esperaba al anterior (docs/31 RV-156).
  for (const clave of items.map((i) => i.clave_local)) {
    if (gen !== generacion) return;
    const i = items.find((x) => x.clave_local === clave);
    if (!i || i.fallo) continue;
    // La espera que fijó el servidor (el tope de propuestas, RV-154) no se adelanta: volvería a
    // chocar con el tope en cada reintento. Se respeta hasta su hora.
    const ya = i.proximo > 0 && !i.en_espera;
    // Lo que solo estaba en memoria vuelve a intentar llegar a IndexedDB (RV-39).
    if (!ya && persistidas.has(clave)) continue;
    if (ya) publicar(items.map((x) => (x.clave_local === clave ? { ...x, proximo: 0 } : x)));
    await adelantar(clave, gen, ya);
  }
  if (gen !== generacion) return;
  await procesarCola();
}

/**
 * Pone `proximo` a 0 (con `ya`) en IndexedDB leyendo y escribiendo en la misma transacción
 * (docs/31 RV-156): no escribe una copia vieja encima de lo que una pasada acaba de guardar (la ruta
 * de una foto), ni resucita un envío que ya salió o una cola vaciada al cerrar sesión.
 */
async function adelantar(clave: string, gen: number, ya: boolean): Promise<void> {
  try {
    const escrito = await bd().actualizar(clave, (guardado) => {
      if (gen !== generacion) return null;
      const enMemoria = items.find((x) => x.clave_local === clave);
      if (!enMemoria || enMemoria.fallo) return null;
      // Guardado y al día: solo cambia `proximo`. Si el último guardado falló, manda la memoria.
      const base = guardado && persistidas.has(clave) ? guardado : enMemoria;
      return ya ? { ...base, proximo: 0 } : base;
    });
    if (escrito && gen === generacion) marcarPersistida(clave, true);
  } catch (e) {
    marcarPersistida(clave, false);
    if (!errorGuardadoAnotado) {
      errorGuardadoAnotado = true;
      anotarError(e, 'cola');
    }
  }
}

/** "Reintentar" en un envío con fallo (Mis propuestas): se olvida el fallo y se intenta ya (RV-03). */
export async function reintentarFallido(clave: string): Promise<void> {
  if (!cargada) await cargarCola();
  const gen = generacion;
  const item = items.find((i) => i.clave_local === clave);
  if (!item) return;
  await guardar({ ...item, fallo: null, intentos: 0, fallos_seguidos: 0, proximo: 0 }, gen);
  if (gen !== generacion) return;
  await procesarCola();
}

/**
 * Arranque: carga la cola y la engancha a los reintentos de la conexión. La vuelta de la red llega
 * por ahí también: `conexion` escucha `online` y repite las comprobaciones, entre ellas esta. Una
 * segunda escucha aquí la lanzaba dos veces (docs/31 RV-156).
 */
export function iniciarCola(): void {
  void cargarCola().then(procesarCola);
  pedirAlmacenPersistente();
  registrarComprobacion(reintentarCola);
  alReabrir(() => void persistirPendientes());
}

/**
 * Pide al navegador que no desaloje la cola ni los puntos guardados (TR-07) y anota si lo concede,
 * para enseñarlo en Ajustes. Sin esperar: el navegador decide cuando quiere.
 */
function pedirAlmacenPersistente() {
  try {
    const almacenamiento = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!almacenamiento?.persist) return;
    void almacenamiento
      .persist()
      .then(() => almacenamiento.persisted())
      .then((si) => escribir('almacen_persistente', si))
      .catch(() => undefined);
  } catch {
    // sin API de almacenamiento: nada que pedir
  }
}

/** Solo para los tests. */
export function _usarAlmacenCola(a: AlmacenCola<EnCola>) {
  almacen = a;
  items = [];
  cargada = false;
  procesando = null;
  otraVuelta = false;
  huboEnvio = null;
  errorGuardadoAnotado = false;
  persistiendo = false;
  otraVez = false;
  persistidas.clear();
  clearTimeout(temporizador);
  oyentes.clear();
  alEnviar.clear();
}
