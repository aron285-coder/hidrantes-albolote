// Reglas de las seis operaciones (FR-40–FR-46) y forma de `datos` (05 §7).

import { describe, expect, it } from 'vitest';
import type { Punto } from '../tipos/punto';
import {
  type Formulario,
  argumentos,
  cambiosDatos,
  coordenadasDe,
  datosDe,
  medidaValida,
  queFalta,
  rutaAltaEn,
} from './propuestas';
import { T } from './textos';

const a = T.avisosFormulario;
const PIN = { lat: 37.2308, lng: -3.6569 };
const P: Punto = {
  id: 'p1',
  codigo: 'HID-0147',
  tipo: 'hidrante',
  diametro_mm: 100,
  caudal: 'bueno',
  racor: null,
  descripcion_fallo: null,
  descripcion: 'Junto a la farmacia',
  direccion: null,
  foto_path: null,
  municipio: 'albolote',
  nucleo: 'Albolote',
  fecha_ultima_revision: '2026-01-01',
  actualizado_en: '2026-01-01T00:00:00Z',
  lat: 37.23,
  lng: -3.65,
  radio_px: 11,
  revision_caducada: false,
};

describe('alta (FL-03)', () => {
  const base: Formulario = { operacion: 'alta', pin: PIN };

  it('pide en orden: tipo, diámetro, medida, estado, fallo y foto', () => {
    expect(queFalta({ operacion: 'alta' }, null)).toBe(a.muevePin);
    expect(queFalta(base, null)).toBe(a.eligeTipo);
    expect(queFalta({ ...base, tipo: 'hidrante' }, null)).toBe(a.eligeDiametro);
    expect(queFalta({ ...base, tipo: 'hidrante', diametro: 'otro', diametroOtro: '5' }, null)).toBe(a.indicaMedida);
    expect(queFalta({ ...base, tipo: 'boca_riego' }, null)).toBe(a.eligeRacor);
    expect(queFalta({ ...base, tipo: 'hidrante', diametro: 70 }, null)).toBe(a.eligeEstado);
    expect(queFalta({ ...base, tipo: 'hidrante', diametro: 70, caudal: 'no_funciona', fallo: ' ' }, null)).toBe(
      a.describeFallo,
    );
    expect(queFalta({ ...base, tipo: 'hidrante', diametro: 70, caudal: 'bueno' }, null)).toBe(a.faltaFoto);
    expect(queFalta({ ...base, tipo: 'hidrante', diametro: 70, caudal: 'bueno', hayFoto: true }, null)).toBeNull();
  });

  it('boca de riego: 45 mm fijo y racor; hidrante: sin racor', () => {
    expect(datosDe({ ...base, tipo: 'boca_riego', racor: 'granada', caudal: 'regular' }, null)).toEqual({
      tipo: 'boca_riego',
      diametro_mm: 45,
      racor: 'granada',
      caudal: 'regular',
    });
    expect(datosDe({ ...base, tipo: 'hidrante', diametro: 100, racor: 'granada', caudal: 'bueno' }, null)).toEqual({
      tipo: 'hidrante',
      diametro_mm: 100,
      caudal: 'bueno',
    });
  });

  it('"otra medida" va en diametro_otro, sin diametro_mm (FR-17)', () => {
    const d = datosDe({ ...base, tipo: 'hidrante', diametro: 'otro', diametroOtro: '80', caudal: 'bueno' }, null);
    expect(d).toEqual({ tipo: 'hidrante', diametro_otro: 80, caudal: 'bueno' });
    expect(medidaValida('80')).toBe(true);
    expect(medidaValida('abc')).toBe(false);
  });

  it('el fallo solo viaja si no funciona; origen gps o manual según el pin', () => {
    const f: Formulario = { ...base, tipo: 'hidrante', diametro: 70, caudal: 'bueno', fallo: 'x', hayFoto: true };
    expect(datosDe(f, null)).not.toHaveProperty('descripcion_fallo');
    const gps = { lat: 37.23081, lng: -3.65691, precision: 8.4 };
    const args = argumentos({ ...f, gps }, null, { nombre: 'Ana', apellido: 'Ruiz' }, 'clave-0001');
    expect(args).toMatchObject({ operacion: 'alta', punto_id: null, origen: 'gps', lat: PIN.lat, precision_gps_m: 8 });
    expect(argumentos({ ...f, gps, pinMovido: true }, null, { nombre: 'A', apellido: 'R' }, 'k').origen).toBe('manual');
  });
});

describe('operaciones sobre un punto', () => {
  it('revisión: solo foto y nota opcional', () => {
    expect(queFalta({ operacion: 'revision' }, P)).toBe(a.faltaFoto);
    expect(datosDe({ operacion: 'revision', nota: '  ' }, P)).toEqual({});
    const args = argumentos(
      { operacion: 'revision', nota: 'ok', hayFoto: true },
      P,
      { nombre: 'A', apellido: 'R' },
      'k',
    );
    expect(args).toMatchObject({ punto_id: 'p1', datos: { nota: 'ok' }, lat: null, origen: null });
  });

  it('actualizar estado exige fallo si no funciona', () => {
    expect(queFalta({ operacion: 'estado', hayFoto: true }, P)).toBe(a.eligeEstado);
    expect(queFalta({ operacion: 'estado', caudal: 'no_funciona', hayFoto: true }, P)).toBe(a.describeFallo);
    expect(datosDe({ operacion: 'estado', caudal: 'malo', fallo: 'x' }, P)).toEqual({ caudal: 'malo' });
  });

  it('corregir datos: solo lo que cambia; sin cambios no se envía', () => {
    expect(queFalta({ operacion: 'datos' }, P)).toBe(a.sinCambios);
    expect(cambiosDatos({ operacion: 'datos', diametro: 70 }, P)).toEqual({ diametro_mm: 70 });
    // El tipo no se cambia (FR-11, DEC-090, docs/18 RV-41): aunque llegue en el formulario, no viaja.
    expect(cambiosDatos({ operacion: 'datos', tipo: 'boca_riego', racor: 'barcelona' }, P)).toEqual({});
    expect(queFalta({ operacion: 'datos', tipo: 'boca_riego' }, P)).toBe(a.sinCambios);
    expect(cambiosDatos({ operacion: 'datos', descripcion: 'Junto a la farmacia ' }, P)).toEqual({});
    expect(queFalta({ operacion: 'datos', descripcion: 'Otra referencia' }, P)).toBeNull();
  });

  it('corregir ubicación: hay que mover el pin', () => {
    expect(queFalta({ operacion: 'ubicacion', pin: PIN, hayFoto: true }, P)).toBe(a.muevePin);
    expect(queFalta({ operacion: 'ubicacion', pin: PIN, pinMovido: true, hayFoto: true }, P)).toBeNull();
    const args = argumentos(
      { operacion: 'ubicacion', pin: PIN, pinMovido: true },
      P,
      { nombre: 'A', apellido: 'R' },
      'k',
    );
    expect(args).toMatchObject({ origen: 'manual', lat: PIN.lat, lng: PIN.lng, datos: {} });
  });

  it('retirada: motivo rápido, explicación y foto', () => {
    expect(queFalta({ operacion: 'retirada', hayFoto: true }, P)).toBe(a.eligeMotivo);
    expect(queFalta({ operacion: 'retirada', motivoRapido: 'obras', hayFoto: true }, P)).toBe(a.explicaMotivo);
    expect(datosDe({ operacion: 'retirada', motivoRapido: 'obras', motivo: ' Zanja ' }, P)).toEqual({
      motivo_rapido: 'obras',
      motivo: 'Zanja',
    });
  });
});

describe('alta desde una pulsación larga en el mapa (DEC-077)', () => {
  it('la ruta lleva las coordenadas con los seis decimales de TR-61', () => {
    expect(rutaAltaEn(37.2308123456, -3.6569987654)).toBe('/proponer/alta?lat=37.230812&lng=-3.656999');
  });

  it('y se leen de vuelta tal cual', () => {
    expect(coordenadasDe('37.230812', '-3.656999')).toEqual({ lat: 37.230812, lng: -3.656999 });
  });

  it('sin coordenadas, el alta empieza como siempre (con el GPS)', () => {
    expect(coordenadasDe(null, null)).toBe(null);
    expect(coordenadasDe('37.23', null)).toBe(null);
    expect(coordenadasDe('', '')).toBe(null);
  });

  it('lo que no sea un par de coordenadas de este planeta se ignora', () => {
    expect(coordenadasDe('norte', 'oeste')).toBe(null);
    expect(coordenadasDe('91', '0')).toBe(null);
    expect(coordenadasDe('0', '181')).toBe(null);
    expect(coordenadasDe('NaN', '0')).toBe(null);
  });
});
