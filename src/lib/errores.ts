// Errores del cliente (TR-90, TR-106): se anotan en una cola local y se envían a fn_registrar_error
// cuando hay servidor. Nunca se escriben en la consola con datos personales; solo mensaje, pila,
// pantalla, agente y el identificador aleatorio del móvil.

import { rpc } from './api';
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

/** Envía la cola; lo que no llega se queda para la próxima vez. */
export async function enviarErrores(): Promise<number> {
  if (enviando) return 0;
  enviando = true;
  let enviados = 0;
  try {
    const cola = leer<ErrorCliente[]>(CLAVE) ?? [];
    while (cola.length) {
      const e = cola[0];
      const r = await rpc('fn_registrar_error', {
        dispositivo_id: dispositivoId(),
        mensaje: e.mensaje,
        pila: e.pila,
        ruta: e.ruta,
        agente: e.agente,
      });
      if (!r.ok) break;
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
