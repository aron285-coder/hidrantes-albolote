// Estado de conexión y degradación controlada (FR-168). Tres estados: todo bien, el móvil sin
// cobertura, o el servidor sin responder. La app sigue con lo guardado y lo dice; nunca en blanco.
// Mientras el servidor no responde, se reintenta solo con retroceso exponencial.

export type EstadoConexion = 'bien' | 'sin_cobertura' | 'sin_servidor';

type Oyente = () => void;
type Comprobacion = () => Promise<unknown>;

let servidorCaido = false;
let enLinea = typeof navigator === 'undefined' ? true : navigator.onLine;
const oyentes = new Set<Oyente>();
const comprobaciones = new Set<Comprobacion>();
let intento = 0;
let temporizador: ReturnType<typeof setTimeout> | undefined;

const avisar = () => oyentes.forEach((o) => o());

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    enLinea = true;
    avisar();
    void reintentarAhora();
  });
  window.addEventListener('offline', () => {
    enLinea = false;
    avisar();
  });
}

export function estadoConexion(): EstadoConexion {
  if (!enLinea) return 'sin_cobertura';
  return servidorCaido ? 'sin_servidor' : 'bien';
}

export function suscribir(o: Oyente): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Lo que se repite al reintentar: comprobar el acceso, enviar la cola de errores… */
export function registrarComprobacion(c: Comprobacion): () => void {
  comprobaciones.add(c);
  return () => comprobaciones.delete(c);
}

/** Lo llama cada petición al servidor: así el estado refleja lo último que pasó. */
export function anotarServidor(responde: boolean): void {
  if (responde) {
    intento = 0;
    clearTimeout(temporizador);
    temporizador = undefined;
  } else {
    programar();
  }
  if (servidorCaido === !responde) return;
  servidorCaido = !responde;
  avisar();
}

/** Espera entre reintentos: 2, 4, 8… hasta 60 s, con algo de azar para no llegar todos a la vez. */
export function espera(n: number, azar = Math.random()): number {
  const base = Math.min(60_000, 2000 * 2 ** Math.max(0, n));
  return Math.round(base * (0.8 + 0.4 * azar));
}

function programar(): void {
  if (temporizador !== undefined) return;
  temporizador = setTimeout(async () => {
    intento++;
    await reintentarAhora();
    temporizador = undefined;
    if (servidorCaido) programar();
  }, espera(intento));
}

/** Botón "Reintentar" y vuelta de la cobertura: repite ya todas las comprobaciones. */
export async function reintentarAhora(): Promise<void> {
  await Promise.all([...comprobaciones].map((c) => c().catch(() => undefined)));
}

/** Solo para los tests. */
export function _reiniciar(): void {
  clearTimeout(temporizador);
  temporizador = undefined;
  intento = 0;
  servidorCaido = false;
  enLinea = true;
  oyentes.clear();
  comprobaciones.clear();
}
