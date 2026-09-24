// Lo que la búsqueda encuentra además de los puntos (FR-73, docs/18 GM-04 D): unas coordenadas
// pegadas, calles y lugares del callejero (sin cobertura) y, si el texto lleva número y hay
// cobertura, direcciones con número de portal.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useConexion } from './estado';
import {
  type EntradaCallejero,
  callejeroCargado,
  cargarCallejero,
  type Enfoque,
  llevaNumero,
  resaltarCalle,
} from '@/lib/callejero';
import { type Interpretadas, type LatLng, esEnlaceCorto, interpretar, parametroLatLng } from '@/lib/coordenadas';
import type { Credencial, Direccion, Direcciones } from '@/lib/direcciones';
import { leerSesion } from '@/lib/sesion';
import { supabase } from '@/lib/supabase';
import { centroGuardado } from '@/lib/vista';
import { dentroDeZona } from '@/lib/zona';

export type EstadoDirecciones =
  | { estado: 'nada' }
  | { estado: 'buscando' }
  | { estado: 'ok'; resultados: Direccion[] }
  | { estado: 'sin_cobertura' }
  /** 401: el token ya no vale; no es la cobertura (docs/19 RV-63). */
  | { estado: 'sin_acceso' };

/** Espera tras la última tecla antes de preguntar por el portal (docs/18 GM-04 D). */
const RETARDO_MS = 400;

/**
 * Las direcciones necesitan red, y su código también: se carga al preguntar. Si no se puede cargar,
 * es que no hay red, y se dice como tal (TR-118).
 */
async function preguntar(q: string, senal: AbortSignal): Promise<Direcciones> {
  try {
    const s = leerSesion();
    let c: Credencial | null = s ? { token: s.token } : null;
    if (!c) {
      const { data } = (await supabase()?.auth.getSession()) ?? { data: { session: null } };
      c = data.session ? { jwt: data.session.access_token } : null;
    }
    if (!c) return { ok: false };
    const m = await import('@/lib/direcciones');
    return await m.buscarDirecciones(q, c, senal);
  } catch {
    return { ok: false };
  }
}

export interface Lugares {
  /** Con `oesteSupuesto` si la longitud llegó sin signo y se ha tomado como oeste (docs/19 RV-69). */
  coordenadas: Interpretadas | null;
  fueraDeZona: boolean;
  enlaceCorto: boolean;
  calles: EntradaCallejero[];
  direcciones: EstadoDirecciones;
}

export function useBusquedaLugares(texto: string): Lugares {
  const conexion = useConexion();
  const q = texto.trim();

  // El callejero se descarga la primera vez que se escribe algo (TR-117).
  const [callejero, setCallejero] = useState(callejeroCargado);
  useEffect(() => {
    if (q && !callejero) void cargarCallejero().then((c) => c && setCallejero(c));
  }, [q, callejero]);

  const coordenadas = useMemo(() => (q ? interpretar(q) : null), [q]);
  const calles = useMemo(() => {
    if (!q || !callejero || coordenadas) return [];
    const centro = centroGuardado();
    const { datos, f } = callejero;
    return f.buscarCalles(datos, q, centro ? f.municipioCercano(datos, centro) : null);
  }, [q, callejero, coordenadas]);

  // Direcciones: 400 ms tras la última tecla y una petición a la vez; la anterior se cancela.
  const conNumero = q.length >= 3 && !coordenadas && llevaNumero(q);
  const sinRed = conexion === 'sin_cobertura';
  const [respuesta, setRespuesta] = useState<{ q: string; estado: EstadoDirecciones } | null>(null);
  useEffect(() => {
    if (!conNumero || sinRed) return;
    const control = new AbortController();
    const reloj = setTimeout(() => {
      void preguntar(q, control.signal).then((r) => {
        if (control.signal.aborted) return;
        setRespuesta({
          q,
          estado: r.ok
            ? { estado: 'ok', resultados: r.resultados }
            : r.sinAcceso
              ? { estado: 'sin_acceso' }
              : { estado: 'sin_cobertura' },
        });
      });
    }, RETARDO_MS);
    return () => {
      clearTimeout(reloj);
      control.abort();
    };
  }, [q, conNumero, sinRed]);

  const direcciones: EstadoDirecciones = !conNumero
    ? { estado: 'nada' }
    : sinRed
      ? { estado: 'sin_cobertura' }
      : respuesta?.q === q
        ? respuesta.estado
        : { estado: 'buscando' };

  return {
    coordenadas,
    fueraDeZona: !!coordenadas && !dentroDeZona(coordenadas.lat, coordenadas.lng),
    enlaceCorto: !!q && esEnlaceCorto(q),
    calles,
    direcciones,
  };
}

/** ¿La búsqueda encuentra algo más que puntos? Para el estado vacío y las cabeceras de grupo. */
export const hayLugares = (l: Lugares) =>
  !!l.coordenadas || l.enlaceCorto || l.calles.length > 0 || l.direcciones.estado !== 'nada';

export type Destino = { tipo: 'sitio'; l: LatLng } | { tipo: 'calle'; calle: EntradaCallejero };

/**
 * Elegir un resultado que no es un punto (docs/18 GM-04 D): un sitio (lugar, dirección o
 * coordenadas) centra el mapa a z18 y abre "¿Qué hay aquí?" ahí; una calle se encuadra, se resalta y
 * abre "¿Qué hay aquí?" en su punto más cercano al centro del mapa.
 */
export function useIrADestino(): (d: Destino) => void {
  const navegar = useNavigate();
  return useCallback(
    (d: Destino) => {
      if (d.tipo === 'sitio') {
        const enfoque: Enfoque = { centro: d.l };
        navegar(`/?aqui=${parametroLatLng(d.l)}`, { state: { enfoque } });
        return;
      }
      // Una calle sale del callejero, así que ya está cargado con sus funciones.
      const f = callejeroCargado()?.f;
      if (!f) return;
      resaltarCalle(d.calle);
      const recuadro = f.recuadroDe(d.calle);
      const centro = centroGuardado() ?? {
        lat: (recuadro[0][0] + recuadro[1][0]) / 2,
        lng: (recuadro[0][1] + recuadro[1][1]) / 2,
      };
      const enfoque: Enfoque = { recuadro };
      navegar(`/?aqui=${parametroLatLng(f.puntoCercano(d.calle, centro))}`, { state: { enfoque } });
    },
    [navegar],
  );
}
