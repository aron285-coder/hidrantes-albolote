// Quién usa la app en este móvil (FL-01, FL-20): un voluntario con su token de dispositivo, jefatura
// con su sesión de Google, o nadie todavía. El voluntario entra sin red si ya tenía token: el
// servidor se consulta después y solo se le echa si dice que el token ya no vale (FR-35).

import { type Resultado, rpc, verificarCodigo } from './api';
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
import { borrarPuntos, cargarGuardados, estadoPuntos, sincronizar } from './puntos';
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

/** Quita ?code=… de la dirección después de canjearlo. */
function limpiarDireccion(): void {
  if (location.search) history.replaceState(history.state, '', location.pathname);
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
      if (r.ok && r.datos) {
        fijar({ tipo: 'jefatura', correo: data.session.user.email ?? '' });
        await sincronizar(null);
        return;
      }
      if (r.ok) {
        await cliente.auth.signOut().catch(() => undefined);
        return fijar({ tipo: 'no_autorizado' });
      }
      if (estado.tipo === 'comprobando') fijar(sinGoogle());
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
  fijar(sinGoogle());
}

/** "Volver" desde "No autorizado". */
export function volverAEntrada(): void {
  fijar(sinGoogle());
}

export function cambiarFirma(firma: Firma): void {
  guardarFirma(firma);
  const sesion = leerSesion();
  if (sesion && estado.tipo === 'voluntario') fijar({ tipo: 'voluntario', sesion });
}

export function cerrarSesionVoluntario(): void {
  cerrarSesion();
  void borrarPuntos();
  fijar({ tipo: 'fuera', caducado: false });
}

/** Cada cuánto se refresca como mucho al volver a la app (la red decide el resto). */
const REFRESCO_MS = 5 * 60_000;

export function iniciarAcceso(): void {
  registrarComprobacion(comprobarAcceso);
  void cargarGuardados().then(comprobarAcceso);
  document.addEventListener('visibilitychange', () => {
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
}
