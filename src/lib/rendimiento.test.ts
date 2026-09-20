// Lo que 03 promete sobre velocidad y se puede medir sin navegador: la búsqueda local con 1.000
// puntos (TR-13). El resto del presupuesto vive en `npm run presupuesto` (TR-11, tamaño del
// JavaScript inicial) y en e2e/rendimiento.spec.ts (TR-10 y TR-14, con la red frenada).
//
// El número que se comprueba es el de 03, no el que da esta máquina: en un móvil de gama media el
// margen es menor, y por eso el límite está donde está.

import { describe, expect, it } from 'vitest';
import { buscar, filtrar, ordenar, type Punto } from './puntos';

const CAUDALES = ['bueno', 'regular', 'malo', 'no_funciona'] as const;
const NUCLEOS = ['Albolote', 'Calicasas', 'El Chaparral', 'Cortijo del Aire', 'Juncaril'];

/** Mil puntos repartidos como los de verdad: códigos correlativos, calles y núcleos repetidos. */
function milPuntos(): Punto[] {
  return Array.from({ length: 1000 }, (_, i) => {
    const hidrante = i % 3 !== 0;
    return {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      codigo: `${hidrante ? 'HID' : 'BOC'}-${String(i + 1).padStart(4, '0')}`,
      tipo: hidrante ? 'hidrante' : 'boca_riego',
      diametro_mm: hidrante ? (i % 2 ? 100 : 70) : 45,
      caudal: CAUDALES[i % 4],
      racor: hidrante ? null : 'granada',
      descripcion_fallo: null,
      descripcion: `Punto de prueba ${i}`,
      direccion: `Calle ${NUCLEOS[i % NUCLEOS.length]} ${i}`,
      foto_path: null,
      municipio: i % 7 === 0 ? 'calicasas' : 'albolote',
      nucleo: NUCLEOS[i % NUCLEOS.length],
      fecha_ultima_revision: '2026-08-20',
      actualizado_en: '2026-09-18T10:00:00Z',
      lat: 37.2 + (i % 100) * 0.0004,
      lng: -3.66 + Math.floor(i / 100) * 0.0004,
      radio_px: 7,
      revision_caducada: i % 11 === 0,
    } as Punto;
  });
}

/** Mediana de varias pasadas: una sola mediría el ruido de la máquina, no el algoritmo. */
function mediana(veces: number, hacer: () => unknown): number {
  const tiempos = Array.from({ length: veces }, () => {
    const t = performance.now();
    hacer();
    return performance.now() - t;
  }).sort((a, b) => a - b);
  return tiempos[Math.floor(veces / 2)];
}

describe('con 1.000 puntos encima (TR-13)', () => {
  const puntos = milPuntos();

  it('son mil, variados', () => {
    expect(puntos).toHaveLength(1000);
    expect(new Set(puntos.map((p) => p.nucleo)).size).toBe(NUCLEOS.length);
  });

  it('buscar por código tarda menos de 200 ms', () => {
    expect(mediana(11, () => buscar(puntos, 'HID-0500'))).toBeLessThan(200);
  });

  it('buscar por calle, que recorre todos los campos, también', () => {
    expect(mediana(11, () => buscar(puntos, 'calle juncaril'))).toBeLessThan(200);
    // Y encuentra lo que debe: rápido no vale de nada si además está mal.
    expect(buscar(puntos, 'HID-0500').map((p) => p.codigo)).toEqual(['HID-0500']);
    expect(buscar(puntos, 'juncaril').length).toBe(200);
  });

  it('una búsqueda sin resultados no es más lenta que una con ellos', () => {
    expect(mediana(11, () => buscar(puntos, 'zzzz no existe'))).toBeLessThan(200);
  });

  it('filtrar y ordenar por distancia, lo que hace la lista al abrirse', () => {
    const desde = { lat: 37.2308, lng: -3.6569 };
    expect(mediana(11, () => ordenar(filtrar(puntos, 'no_funciona'), 'distancia', desde))).toBeLessThan(200);
  });
});
