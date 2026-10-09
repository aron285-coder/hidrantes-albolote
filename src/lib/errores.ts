// Errores del cliente (TR-90, TR-106): se anotan en una cola local y se envían por POST /api/error
// (que llama a fn_registrar_error) cuando hay servidor. Nunca se escriben en la consola con datos personales; solo mensaje, pila,
// pantalla, agente y el identificador aleatorio del móvil.

import { anotarServidor } from './conexion';
import { LIMITES_RED, fetchConLimite } from './red';
import { escribir, leer } from './almacen';
import { dispositivoId } from './sesion';

export interface ErrorCliente {
  mensaje: string;
  pila: string | null;
  ruta: string;
  agente: string;
  momento: number;
}

const CLAVE = 'errores_pendientes';
export const MAXIMO_EN_COLA = 20;

export function anotarError(e: unknown, ruta = location.pathname): void {
  const err = e instanceof Error ? e : new Error(String(e));
  const cola = leer<ErrorCliente[]>(CLAVE) ?? [];
  cola.push({
    mensaje: err.message.slice(0, 1000),
    pila: err.stack?.slice(0, 4096) ?? null,
    ruta: ruta.slice(0, 200),
    agente: navigator.userAgent.slice(0, 300),
    momento: Date.now(),
  });
  // Solo los últimos: un bucle de errores no debe llenar el móvil.
  escribir(CLAVE, cola.slice(-MAXIMO_EN_COLA));
  void enviarErrores();
}

let enviando = false;

type Cuerpo = { dispositivo_id: string; mensaje: string; pila: string | null; ruta: string; agente: string };

/**
 * Un error al servidor (docs/31 RV-148): por POST /api/error, que pone el tope por IP. Sin red, con
 * el servidor caído o sin la Function, se queda en la cola (como mucho los últimos 20).
 */
async function enviarUno(cuerpo: Cuerpo): Promise<boolean> {
  let respuesta: Response;
  try {
    respuesta = await fetchConLimite(() => LIMITES_RED.rpc)('/api/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    anotarServidor(false);
    return false;
  }
  const html = (respuesta.headers.get('Content-Type') ?? '').includes('text/html');
  if (respuesta.ok && !html) {
    anotarServidor(true);
    return true;
  }
  // Sin la Function (404, 405 o la página de la app) ya no se prueba la RPC de 5 argumentos: desde
  // 0044 no es para anon (docs/33 RV-306) y solo daría 401. El error se queda en la cola. Eso no dice
  // nada de si hay servidor: no se anota.
  if (respuesta.status === 404 || respuesta.status === 405 || html) return false;
  anotarServidor(respuesta.status < 500);
  return false;
}

/** Envía la cola; lo que no llega se queda para la próxima vez. */
export async function enviarErrores(): Promise<number> {
  if (enviando) return 0;
  enviando = true;
  let enviados = 0;
  try {
    const cola = leer<ErrorCliente[]>(CLAVE) ?? [];
    while (cola.length) {
      const e = cola[0];
      const cuerpo = {
        dispositivo_id: dispositivoId(),
        mensaje: e.mensaje,
        pila: e.pila,
        ruta: e.ruta,
        agente: e.agente,
      };
      const r = await enviarUno(cuerpo);
      if (!r) break;
      cola.shift();
      enviados++;
      escribir(CLAVE, cola);
    }
  } finally {
    enviando = false;
  }
  return enviados;
}

export const erroresPendientes = () => (leer<ErrorCliente[]>(CLAVE) ?? []).length;

/** Captura global: lo que se escape de React y las promesas sin tratar. */
export function instalarCapturaGlobal(): void {
  window.addEventListener('error', (ev) => anotarError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => anotarError(ev.reason));
  window.addEventListener('online', () => void enviarErrores());
  void enviarErrores();
}
