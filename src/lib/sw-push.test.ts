// docs/31 RV-157: tocar una notificación con un formulario a medias no navega encima de él. El
// Service Worker (public/sw-push.js) se carga en un contexto con un `self` falso.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const ORIGEN = 'https://hidrantes.example';
const CODIGO = readFileSync(path.resolve(import.meta.dirname, '../../public/sw-push.js'), 'utf8');

interface Ventana {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
}

function ventana(ruta: string): Ventana {
  return {
    url: `${ORIGEN}${ruta}`,
    focus: vi.fn(async () => undefined),
    navigate: vi.fn(async () => undefined),
    postMessage: vi.fn(),
  };
}

/** Carga el SW con estas ventanas abiertas y toca una notificación que lleva a `url`. */
async function tocar(ventanas: Ventana[], url = '/mis-propuestas') {
  const oyentes = new Map<string, (e: unknown) => void>();
  const openWindow = vi.fn(async () => null);
  const self = {
    location: { origin: ORIGEN },
    addEventListener: (tipo: string, f: (e: unknown) => void) => oyentes.set(tipo, f),
    clients: { matchAll: async () => ventanas, openWindow },
    registration: {},
  };
  runInNewContext(CODIGO, { self, URL, caches: {}, indexedDB: {}, Promise });
  let espera: Promise<unknown> = Promise.resolve();
  oyentes.get('notificationclick')!({
    notification: { close: vi.fn(), data: { url } },
    waitUntil: (p: Promise<unknown>) => (espera = p),
  });
  await espera;
  return { openWindow };
}

describe('notificationclick (docs/31 RV-157)', () => {
  it('sin formulario abierto, navega la ventana como siempre', async () => {
    const v = ventana('/');
    await tocar([v]);
    expect(v.navigate).toHaveBeenCalledWith(`${ORIGEN}/mis-propuestas`);
    expect(v.postMessage).not.toHaveBeenCalled();
  });

  it('con un formulario abierto, no navega: avisa a la app, que pregunta antes de salir', async () => {
    const v = ventana('/proponer/alta?p=x');
    const { openWindow } = await tocar([v]);
    expect(v.focus).toHaveBeenCalled();
    expect(v.navigate).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
    expect(v.postMessage).toHaveBeenCalledWith({ tipo: 'aviso_push', url: '/mis-propuestas' });
  });

  it('desde la pantalla de resultado (/proponer/hecho) navega sin preguntar (docs/32 RV-240)', async () => {
    const v = ventana('/proponer/hecho');
    await tocar([v]);
    expect(v.navigate).toHaveBeenCalledWith(`${ORIGEN}/mis-propuestas`);
    expect(v.postMessage).not.toHaveBeenCalled();
  });

  it('si hay otra ventana sin formulario, se usa esa', async () => {
    const formulario = ventana('/proponer/revision?p=x');
    const mapa = ventana('/lista');
    await tocar([formulario, mapa]);
    expect(mapa.navigate).toHaveBeenCalled();
    expect(formulario.navigate).not.toHaveBeenCalled();
    expect(formulario.postMessage).not.toHaveBeenCalled();
  });
});
