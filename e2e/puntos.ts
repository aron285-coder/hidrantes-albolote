// Puntos de prueba para los e2e: las 12 combinaciones de 06 §4.2 alrededor del centro de Albolote,
// con los radios que calcula fn_radio_px. Ficticios, como el seed ([PRUEBA]).

import type { Punto } from '../src/tipos/punto.ts';

const COMBINACIONES: [Punto['tipo'], number, Punto['caudal'], number][] = [
  ['hidrante', 100, 'bueno', 11],
  ['hidrante', 100, 'regular', 9],
  ['hidrante', 100, 'malo', 7],
  ['hidrante', 100, 'no_funciona', 5],
  ['hidrante', 70, 'bueno', 9],
  ['hidrante', 70, 'regular', 7],
  ['hidrante', 70, 'malo', 5.5],
  ['hidrante', 70, 'no_funciona', 5],
  ['boca_riego', 45, 'bueno', 7],
  ['boca_riego', 45, 'regular', 5.5],
  ['boca_riego', 45, 'malo', 5.5],
  ['boca_riego', 45, 'no_funciona', 5],
];

export const PUNTOS: Punto[] = COMBINACIONES.map(([tipo, d, caudal, radio], i) => {
  const hid = tipo === 'hidrante';
  const n = String(9001 + i);
  return {
    id: `5eed0000-0000-4000-8000-0000000000${String(i + 10)}`,
    codigo: `${hid ? 'HID' : 'BOC'}-${n}`,
    tipo,
    diametro_mm: d,
    caudal,
    racor: hid ? null : 'granada',
    descripcion_fallo: caudal === 'no_funciona' ? '[PRUEBA] Tapa soldada' : null,
    descripcion: `[PRUEBA] Punto ${i + 1}`,
    direccion: i === 0 ? 'Calle Real 14' : i === 1 ? null : `Calle Prueba ${i}`,
    foto_path: null,
    municipio: 'albolote',
    nucleo: 'Albolote',
    fecha_ultima_revision: i === 4 ? '2025-01-10' : '2026-08-20',
    actualizado_en: '2026-09-18T10:00:00Z',
    lat: 37.2308 + (i % 4) * 0.0012,
    lng: -3.6569 + Math.floor(i / 4) * 0.0015,
    radio_px: radio,
    revision_caducada: i === 4,
  };
});

export const LISTADO = { puntos: PUNTOS, bajas: [], sincronizado_en: '2026-09-19T10:00:00Z', config: {} };
