// Quién usa la app en este móvil (FL-01, FL-20): un voluntario con su token de dispositivo, jefatura
// con su sesión de Google, o nadie todavía. El voluntario entra sin red si ya tenía token: el
// servidor se consulta después y solo se le echa si dice que el token ya no vale (FR-35).

import { borrar, escribir, leer } from './almacen';
import { SIN_SERVIDOR, type Resultado, rpc, verificarCodigo } from './api';
import { anotarServidor, registrarComprobacion } from './conexion';
import {
  type Firma,
  type SesionVoluntario,
  bloquear,
  cerrarSesion,
  dispositivoId,
  esErrorDeAcceso,
  guardarFirma,
  guardarSesion,
  leerSesion,
  olvidarToken,
  renovarDispositivoId,
} from './sesion';
import { alEnviarPropuesta, iniciarCola, reintentarCola, vaciarCola } from './cola';
import { cargarMisPropuestas, olvidarMisPropuestas } from './mis-propuestas';
import {
  borrarPuntos,
  cargarGuardados,
  cargarTramoJefatura,
  estadoPuntos,
  rederivarSiCambiaElDia,
  sincronizar,
} from './puntos';
import { anotarError } from './errores';
import { LIMITES_RED, fetchConLimite } from './red';
import { desactivarPush, estadoPush, pedirEnvioPush, resincronizarPush } from './push';
import { supabase } from './supabase';

export type Acceso =
  | { tipo: 'comprobando' }
  | { tipo: 'fuera'; caducado: boolean }
  | { tipo: 'voluntario'; sesion: SesionVoluntario }
  | { tipo: 'jefatura'; correo: string }
  // sinComprobar: no se ha podido saber si la cuenta es de jefatura; se reintenta a mano (docs/35 RV-432).
  // cuentaMezclada: la cuenta tiene otra identidad unida y no se puede unir a jefatura (docs/36 RV-450).
  | { tipo: 'no_autorizado'; sinComprobar?: boolean; cuentaMezclada?: boolean };

const CLAVE_AUTH = 'hidrantes.auth';

/** ¿Hay una sesión de Google guardada o volvemos ahora mismo de la pantalla de Google? */
function hayGoogle(): boolean {
  try {
    return new URLSearchParams(location.search).has('code') || localStorage.getItem(CLAVE_AUTH) !== null;
  } catch {
    return false;
  }
}

function inicial(): Acceso {
  if (hayGoogle()) return { tipo: 'comprobando' };
  const sesion = leerSesion();
  return sesion ? { tipo: 'voluntario', sesion } : { tipo: 'fuera', caducado: false };
}

let estado: Acceso = inicial();
const oyentes = new Set<() => void>();

function fijar(nuevo: Acceso): void {
  estado = nuevo;
  oyentes.forEach((o) => o());
}

export const acceso = (): Acceso => estado;

export function suscribirAcceso(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Sin Google: el voluntario guardado, o la pantalla de entrada. */
function sinGoogle(): Acceso {
  const sesion = leerSesion();
  if (sesion) return { tipo: 'voluntario', sesion };
  return { tipo: 'fuera', caducado: estado.tipo === 'fuera' && estado.caducado };
}

/**
 * Última vez que el servidor confirmó que este correo es de jefatura. Sin servidor al arrancar,
 * jefatura sigue viendo el mapa y los puntos guardados en vez de acabar en la entrada (FR-168,
 * RV-16). No da ningún permiso: el servidor aplica RLS igual, y lo que se encole espera a la sesión.
 */
interface JefaturaConfirmada {
  correo: string;
  confirmado_en: number;
}
const CLAVE_CONFIRMADA = 'jefatura_confirmada';
const confirmada = () => leer<JefaturaConfirmada>(CLAVE_CONFIRMADA);
const olvidarConfirmada = () => borrar(CLAVE_CONFIRMADA);

/** Los parámetros con los que vuelve el inicio de sesión de Google (OAuth). */
const PARAMETROS_OAUTH = ['code', 'state', 'error', 'error_code', 'error_description'];

/**
 * La dirección sin los parámetros de la vuelta de OAuth, o null si no trae ninguno. Conserva el
 * resto (`?incidente=`, `?p=`, `?aqui=`…) y el hash (docs/19 RV-57).
 */
export function direccionSinOauth(ruta: string, busqueda: string, hash: string): string | null {
  // Por pares, sin volver a codificar: lo demás queda tal cual estaba.
  const pares = busqueda.replace(/^\?/, '').split('&').filter(Boolean);
  const esOauth = (par: string) => PARAMETROS_OAUTH.includes(decodeURIComponent(par.split('=')[0] ?? ''));
  if (!pares.some(esOauth)) return null;
  const resto = pares.filter((par) => !esOauth(par)).join('&');
  return `${ruta}${resto ? `?${resto}` : ''}${hash}`;
}

let direccionLimpia = false;

/**
 * Quita de la dirección los parámetros de OAuth después de canjearlos, **una sola vez**, al arrancar.
 * Antes borraba todos los parámetros en cada comprobación (también en los reintentos de FR-168), a
 * espaldas de React Router: jefatura perdía `?incidente=`, `?p=` y `?aqui=` al recargar (RV-57).
 */
export function limpiarDireccion(): void {
  if (direccionLimpia) return;
  direccionLimpia = true;
  const limpia = direccionSinOauth(location.pathname, location.search, location.hash);
  if (limpia !== null) history.replaceState(history.state, '', limpia);
}

/**
 * Lo que ha dicho el servidor al unir la cuenta: `unida` (y la sesión ya renovada); `sin_acceso` (la
 * cuenta no puede ser de jefatura); `mezclada` (la cuenta tiene otra identidad unida, docs/36
 * RV-450); o `sin_comprobar` (no se ha podido saber: sin red, demasiadas peticiones, servidor).
 */
type Vinculo = 'unida' | 'sin_acceso' | 'mezclada' | 'sin_comprobar';

/**
 * El usuario de la sesión para el que ya se ha pedido unir la cuenta y su resultado. Se guarda la
 * promesa: una comprobación que llegue a la vez espera a la misma petición. «Unida» no se guarda
 * (docs/36 RV-450): si la unión se deshace después, la próxima comprobación vuelve a pedirla; solo
 * se recuerdan «sin acceso», «mezclada» y «sin comprobar», que no se piden solas otra vez.
 */
let vinculo: { usuario: string; resultado: Promise<Vinculo> } | null = null;
/** Se ha pulsado «Reintentar»: la próxima comprobación con respuesta vuelve a pedir unirla. */
let reintentoPedido = false;
const VINCULADA = ['VINCULADO', 'YA_VINCULADO'];
/** Las únicas respuestas que dicen algo de la cuenta (05 §9): «sin acceso» de siempre, sin reintentar. */
const SIN_ACCESO: Record<number, string[]> = {
  401: ['NO_AUTORIZADO'],
  403: ['SIN_GOOGLE', 'NO_ES_ADMINISTRADOR', 'OTRA_CUENTA'],
};

type Cliente = NonNullable<ReturnType<typeof supabase>>;

/** Cierra la sesión de Google; si falla, queda anotado (signOut devuelve el error, no lo lanza). */
async function cerrarGoogle(cliente: Cliente, donde: string): Promise<void> {
  try {
    const r = await cliente.auth.signOut();
    if (r?.error) anotarError(r.error, donde);
  } catch (e) {
    anotarError(e, donde);
  }
}

/**
 * Tras unir la cuenta, un JWT nuevo (docs/36 RV-450, DEC-206): la jefatura solo vale con un token
 * emitido después de la unión. Si no se puede renovar, no se ha podido comprobar: con el token de
 * antes el servidor diría que no y se cerraría la sesión sin motivo.
 */
async function renovarSesion(cliente: Cliente): Promise<Vinculo> {
  try {
    const r = await cliente.auth.refreshSession();
    if (!r.error && r.data.session) return 'unida';
    anotarError(r.error ?? new Error('refreshSession sin sesión'), 'vincular-jefatura-renovar');
  } catch (e) {
    anotarError(e, 'vincular-jefatura-renovar');
  }
  return 'sin_comprobar';
}

/**
 * POST /api/vincular-jefatura con el JWT de la sesión (docs/35 RV-400, 05 §9): une la fila de
 * administradores a esta cuenta de Google. Un fallo que no sea «demasiadas peticiones» queda
 * anotado, sin datos de la cuenta.
 */
async function vincularJefatura(cliente: Cliente, token: string): Promise<Vinculo> {
  try {
    const r = await fetchConLimite(() => LIMITES_RED.rpc)('/api/vincular-jefatura', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const cuerpo = (await r.json().catch(() => ({}))) as { resultado?: string; error?: string };
    if (r.ok && VINCULADA.includes(cuerpo.resultado ?? '')) return await renovarSesion(cliente);
    if (SIN_ACCESO[r.status]?.includes(cuerpo.error ?? '')) return 'sin_acceso';
    if (r.status === 403 && cuerpo.error === 'CUENTA_MEZCLADA') {
      // Queda anotado, sin datos de la cuenta: jefatura puede tener que revisar esa unión (RV-450).
      anotarError(new Error('vincular-jefatura: 403 CUENTA_MEZCLADA'), 'vincular-jefatura');
      return 'mezclada';
    }
    if (r.status !== 429) {
      anotarError(
        new Error(`vincular-jefatura: ${r.status} ${cuerpo.error ?? cuerpo.resultado ?? ''}`),
        'vincular-jefatura',
      );
    }
    return 'sin_comprobar';
  } catch (e) {
    anotarError(e, 'vincular-jefatura');
    return 'sin_comprobar';
  }
}

/**
 * Consulta al servidor quién es quién. Se llama al arrancar y en cada reintento de la
 * degradación controlada (FR-168); sin servidor no cambia nada de lo que ya funcionaba.
 */
export async function comprobarAcceso(): Promise<void> {
  const cliente = supabase();
  if (cliente && hayGoogle()) {
    const { data } = await cliente.auth.getSession();
    limpiarDireccion();
    if (data.session) {
      let r = await rpc<boolean>('fn_es_admin');
      // La cuenta de jefatura se une a su cuenta de Google al entrar, una vez por sesión (docs/35
      // RV-432, DEC-197): si se ha unido, se vuelve a preguntar. Si la cuenta no puede serlo, «No
      // autorizado» de siempre. Si no se ha podido saber, se dice así y solo se reintenta a mano.
      const usuario = data.session.user.id;
      const otraVez = reintentoPedido && r.ok;
      if (r.ok) reintentoPedido = false;
      if (r.ok && !r.datos) {
        const pedido =
          vinculo && vinculo.usuario === usuario && !otraVez
            ? vinculo
            : (vinculo = { usuario, resultado: vincularJefatura(cliente, data.session.access_token) });
        const resultado = await pedido.resultado;
        // «Unida» no se recuerda (RV-450): la próxima comprobación vuelve a preguntar al servidor.
        if (resultado === 'unida' && vinculo === pedido) vinculo = null;
        if (resultado === 'mezclada') {
          olvidarConfirmada();
          await cerrarGoogle(cliente, 'vincular-jefatura-salir');
          return fijar({ tipo: 'no_autorizado', cuentaMezclada: true });
        }
        if (resultado === 'unida') {
          r = await rpc<boolean>('fn_es_admin');
          // Unida, pero sin poder volver a preguntar: se dice, en vez de volver a la entrada sin más.
          if (!r.ok) return fijar({ tipo: 'no_autorizado', sinComprobar: true });
          // Unida y con la sesión renovada, pero el servidor dice que no: no cuadra con la unión. Se
          // anota y se deja reintentar, sin cerrar la sesión (docs/36 RV-450).
          if (!r.datos) {
            anotarError(new Error('vincular-jefatura: unida pero fn_es_admin=false'), 'vincular-jefatura');
            return fijar({ tipo: 'no_autorizado', sinComprobar: true });
          }
        }
        if (r.ok && !r.datos && resultado === 'sin_comprobar') {
          olvidarConfirmada();
          return fijar({ tipo: 'no_autorizado', sinComprobar: true });
        }
      }
      const correo = data.session.user.email ?? '';
      if (r.ok && r.datos) {
        const llega = estado.tipo !== 'jefatura';
        escribir(CLAVE_CONFIRMADA, { correo, confirmado_en: Date.now() } satisfies JefaturaConfirmada);
        fijar({ tipo: 'jefatura', correo });
        // Lo que jefatura encoló sin sesión sale ahora (RV-04). Solo al pasar a jefatura: si no, la
        // cola y esta comprobación se llamarían la una a la otra.
        if (llega) {
          void reintentarCola();
          // El tramo de manguera de la tabla, una vez: incidente y medición lo usan (RV-62).
          void cargarTramoJefatura();
        }
        await sincronizar(null);
        return;
      }
      if (r.ok) {
        olvidarConfirmada();
        await cerrarGoogle(cliente, 'no-autorizado-salir');
        return fijar({ tipo: 'no_autorizado' });
      }
      // Sin servidor: si este mismo correo ya fue jefatura, se sigue como jefatura, sin sincronizar;
      // el aviso de degradación lo pinta conexión (RV-16).
      if (r.codigo === SIN_SERVIDOR && correo && confirmada()?.correo === correo) {
        if (estado.tipo !== 'jefatura') fijar({ tipo: 'jefatura', correo });
        return;
      }
      if (estado.tipo === 'comprobando') fijar(sinGoogle());
      return;
    }
    // Sin red, supabase-js puede no devolver la sesión (no puede renovarla): con la confirmación
    // guardada, jefatura sigue en solo lectura. La cola espera a que vuelva la sesión.
    const guardada = confirmada();
    if (typeof navigator !== 'undefined' && navigator.onLine === false && guardada) {
      if (estado.tipo !== 'jefatura') fijar({ tipo: 'jefatura', correo: guardada.correo });
      return;
    }
  }
  if (estado.tipo === 'comprobando' || estado.tipo === 'jefatura') fijar(sinGoogle());

  const sesion = leerSesion();
  if (!sesion) return;
  // La sincronización de puntos valida el token de paso (FR-35, 05 §10).
  const r = await sincronizar(sesion.token);
  if (!r.ok && esErrorDeAcceso(r.codigo)) {
    olvidarToken();
    fijar({ tipo: 'fuera', caducado: true });
    return;
  }
  if (r.ok) {
    // Con servidor: resultado de mis propuestas (FR-90) y avisos push pendientes de todos (05 §9).
    void cargarMisPropuestas();
    pedirEnvioPush(sesion.token);
    // Si el servidor perdió la suscripción de este móvil, se recupera (RV-81); como mucho, una vez al día.
    void resincronizarPush(sesion.token);
  }
}

/** Canje del código (FR-31). Devuelve null si ha entrado, o el código de error de 05 §8. */
/** Por qué no se ha entrado: el código de 05 §8 y, con OCUPADO, cuánto esperar (docs/37 RV-491). */
export interface ErrorEntrada {
  codigo: string;
  reintentarEnS?: number;
}

export async function entrarConCodigo(codigo: string, firma: Firma): Promise<ErrorEntrada | null> {
  let r: Resultado<{ token: string }> = await verificarCodigo(codigo, dispositivoId());
  // El identificador de este móvil está reservado (DEC-175): otro y una sola vez más (docs/31 RV-159).
  // Si vuelve a pasar, el error de siempre.
  if (!r.ok && r.codigo === 'DISPOSITIVO_RESERVADO') r = await verificarCodigo(codigo, renovarDispositivoId());
  if (!r.ok) {
    if (r.codigo === 'DEMASIADOS_INTENTOS') bloquear();
    return r.reintentarEnS === undefined ? { codigo: r.codigo } : { codigo: r.codigo, reintentarEnS: r.reintentarEnS };
  }
  guardarSesion(r.datos.token, firma);
  fijar({ tipo: 'voluntario', sesion: leerSesion()! });
  // Lo que esperaba en la cola porque el token había caducado sale con el nuevo (RV-04).
  void reintentarCola();
  // Primera sincronización en cuanto hay acceso: los puntos llegan antes de salir del primer uso.
  void sincronizar(r.datos.token);
  return null;
}

/** Jefatura (FR-36): Google en la misma PWA. En ordenador vuelve al panel; en el móvil, al mapa. */
export async function entrarConGoogle(): Promise<boolean> {
  const cliente = supabase();
  if (!cliente) {
    anotarServidor(false);
    return false;
  }
  const ancho = window.matchMedia('(min-width: 900px)').matches;
  const { error } = await cliente.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}${ancho ? '/admin' : '/'}` },
  });
  if (error) anotarServidor(false);
  return !error;
}

export async function salirDeGoogle(): Promise<void> {
  await supabase()
    ?.auth.signOut()
    .catch(() => undefined);
  try {
    localStorage.removeItem(CLAVE_AUTH);
  } catch {
    // sin almacenamiento no había sesión guardada
  }
  olvidarConfirmada();
  fijar(sinGoogle());
}

/**
 * Jefatura se acaba de quitar el acceso a sí misma (docs/35 RV-431). El servidor ya lo ha aplicado:
 * no se le vuelve a preguntar (sin red, `comprobarAcceso` la dejaría dentro con la confirmación
 * guardada). Se olvida esa confirmación, se cierra la sesión de Google y queda «No autorizado».
 */
export async function dejarJefatura(): Promise<void> {
  olvidarConfirmada();
  await supabase()
    ?.auth.signOut()
    .catch((e: unknown) => anotarError(e, 'dejar-jefatura'));
  try {
    localStorage.removeItem(CLAVE_AUTH);
  } catch {
    // sin almacenamiento no había sesión guardada
  }
  fijar({ tipo: 'no_autorizado' });
}

/**
 * «Reintentar» cuando no se ha podido comprobar la cuenta (docs/35 RV-432): vuelve a pedir unirla.
 * Solo a mano: así no hay bucle.
 */
export async function reintentarComprobacion(): Promise<void> {
  reintentoPedido = true;
  fijar({ tipo: 'comprobando' });
  await comprobarAcceso();
  // Sin llegar ni a preguntar (sin red, servidor caído), se sigue en la misma pantalla, no en la
  // entrada: la sesión de Google sigue abierta.
  if (estado.tipo !== 'jefatura' && estado.tipo !== 'no_autorizado' && hayGoogle()) {
    fijar({ tipo: 'no_autorizado', sinComprobar: true });
  }
}

/** "Volver" desde "No autorizado". */
export function volverAEntrada(): void {
  olvidarConfirmada();
  // Sin poder comprobar la cuenta, la sesión de Google sigue abierta: se cierra al volver, para que
  // la próxima comprobación no devuelva aquí (docs/35 RV-432).
  if (estado.tipo === 'no_autorizado' && estado.sinComprobar) {
    // signOut no rechaza con un fallo de red: devuelve { error }.
    void supabase()
      ?.auth.signOut()
      .then((r) => r?.error && anotarError(r.error, 'volver-a-entrada'))
      .catch((e: unknown) => anotarError(e, 'volver-a-entrada'));
    try {
      localStorage.removeItem(CLAVE_AUTH);
    } catch {
      // sin almacenamiento no había sesión guardada
    }
  }
  fijar(sinGoogle());
}

export function cambiarFirma(firma: Firma): void {
  guardarFirma(firma);
  const sesion = leerSesion();
  if (sesion && estado.tipo === 'voluntario') fijar({ tipo: 'voluntario', sesion });
}

/**
 * El servidor revoca el token y borra la suscripción push de este móvil (docs/31 RV-158): un token
 * copiado deja de valer. Como mucho `LIMITES_RED.cerrarSesion`; sin red o si falla, la sesión se
 * cierra igual (lo local manda) y queda anotado en errores_cliente.
 */
async function revocarToken(): Promise<void> {
  const sesion = leerSesion();
  if (!sesion) return;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<Resultado<null>>((r) => {
    temporizador = setTimeout(() => r({ ok: false, codigo: 'TIEMPO_AGOTADO' }), LIMITES_RED.cerrarSesion);
  });
  const r = await Promise.race([rpc<null>('fn_cerrar_sesion', { token: sesion.token }), limite]);
  clearTimeout(temporizador);
  if (!r.ok) anotarError(new Error(`fn_cerrar_sesion: ${r.codigo}`), 'cerrar-sesion');
}

/** Lo más que espera cerrar sesión a la red (docs/32 RV-234): después, se cierra igual. */
export const LIMITE_CERRAR_SESION_MS = 6000;

let cerrando: Promise<void> | null = null;

/**
 * Cerrar sesión, rápido y una sola vez (docs/32 RV-234). `fn_cerrar_sesion` revoca el token y borra
 * la suscripción de voluntario de este móvil (RV-226): no se llama aparte a fn_borrar_suscripcion_push.
 * A la vez, la suscripción del navegador se da de baja si jefatura no tiene avisos aquí (RV-258). Todo
 * con un máximo de 6 s; un segundo toque mientras tanto devuelve el mismo cierre, sin repetir nada.
 */
export function cerrarSesionVoluntario(): Promise<void> {
  cerrando ??= (async () => {
    try {
      const conAvisos = estadoPush() === 'activo';
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const limite = await Promise.race([
        Promise.all([
          revocarToken(),
          conAvisos
            ? desactivarPush({ borrarEnServidor: false }).catch((e: unknown) => anotarError(e, 'cerrar-sesion'))
            : undefined,
        ]).then(() => false),
        new Promise<boolean>((r) => (temporizador = setTimeout(() => r(true), LIMITE_CERRAR_SESION_MS))),
      ]);
      clearTimeout(temporizador);
      // Lo que no acabó en 6 s sigue en segundo plano; queda anotado que se cortó.
      if (limite) anotarError(new Error('cerrar sesión: límite de 6 s'), 'cerrar-sesion');
      cerrarSesion();
      olvidarMisPropuestas();
      void borrarPuntos();
      void vaciarCola();
      fijar({ tipo: 'fuera', caducado: false });
    } finally {
      cerrando = null;
    }
  })();
  return cerrando;
}

/** Cada cuánto se refresca como mucho al volver a la app (la red decide el resto). */
const REFRESCO_MS = 5 * 60_000;

export function iniciarAcceso(): void {
  registrarComprobacion(comprobarAcceso);
  // Lo que sale de la cola: jefatura ve su cambio en el mapa al momento (FR-151); el voluntario, en
  // Mis propuestas.
  alEnviarPropuesta((e) => {
    if (e.aplicada) void sincronizar(leerSesion()?.token ?? null);
    else void cargarMisPropuestas();
  });
  iniciarCola();
  void cargarGuardados().then(comprobarAcceso);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rederivarSiCambiaElDia();
    const { guardadoEn } = estadoPuntos();
    if (document.visibilityState === 'visible' && (!guardadoEn || Date.now() - guardadoEn > REFRESCO_MS)) {
      void comprobarAcceso();
    }
  });
}

/** Solo para los tests. */
export function _reiniciarAcceso(): void {
  estado = inicial();
  oyentes.clear();
  direccionLimpia = false;
  vinculo = null;
  reintentoPedido = false;
}
