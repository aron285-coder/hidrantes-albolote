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
} from './sesion';
import { alEnviarPropuesta, iniciarCola, reintentarCola, vaciarCola } from './cola';
import { cargarMisPropuestas } from './mis-propuestas';
import {
  borrarPuntos,
  cargarGuardados,
  cargarTramoJefatura,
  estadoPuntos,
  rederivarSiCambiaElDia,
  sincronizar,
} from './puntos';
import { desactivarPush, estadoPush, pedirEnvioPush } from './push';
import { supabase } from './supabase';

export type Acceso =
  | { tipo: 'comprobando' }
  | { tipo: 'fuera'; caducado: boolean }
  | { tipo: 'voluntario'; sesion: SesionVoluntario }
  | { tipo: 'jefatura'; correo: string }
  | { tipo: 'no_autorizado' };

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
 * Consulta al servidor quién es quién. Se llama al arrancar y en cada reintento de la
 * degradación controlada (FR-168); sin servidor no cambia nada de lo que ya funcionaba.
 */
export async function comprobarAcceso(): Promise<void> {
  const cliente = supabase();
  if (cliente && hayGoogle()) {
    const { data } = await cliente.auth.getSession();
    limpiarDireccion();
    if (data.session) {
      const r = await rpc<boolean>('fn_es_admin');
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
        await cliente.auth.signOut().catch(() => undefined);
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
  }
}

/** Canje del código (FR-31). Devuelve null si ha entrado, o el código de error de 05 §8. */
export async function entrarConCodigo(codigo: string, firma: Firma): Promise<string | null> {
  const r: Resultado<{ token: string }> = await verificarCodigo(codigo, dispositivoId());
  if (!r.ok) {
    if (r.codigo === 'DEMASIADOS_INTENTOS') bloquear();
    return r.codigo;
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

/** "Volver" desde "No autorizado". */
export function volverAEntrada(): void {
  olvidarConfirmada();
  fijar(sinGoogle());
}

export function cambiarFirma(firma: Firma): void {
  guardarFirma(firma);
  const sesion = leerSesion();
  if (sesion && estado.tipo === 'voluntario') fijar({ tipo: 'voluntario', sesion });
}

export async function cerrarSesionVoluntario(): Promise<void> {
  // Primero lo que necesita el token: dejar de recibir avisos en este móvil.
  if (estadoPush() === 'activo') await desactivarPush().catch(() => undefined);
  cerrarSesion();
  void borrarPuntos();
  void vaciarCola();
  fijar({ tipo: 'fuera', caducado: false });
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
}
