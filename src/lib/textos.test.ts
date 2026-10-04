// TR-112: los textos de textos.ts coinciden con el Apéndice A de docs/06.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { T } from './textos';

const MARCA = '[]';
const normalizar = (s: string) => s.replace(/\[[^\]]*\]/g, MARCA).trim();

function literalesDelApendice(): Set<string> {
  const md = readFileSync(path.resolve(import.meta.dirname, '../../docs/06-sistema-de-diseno.md'), 'utf8');
  const inicio = md.indexOf('## Apéndice A');
  const fin = md.indexOf('\n## ', inicio + 1);
  expect(inicio, 'no encuentro el Apéndice A en docs/06').toBeGreaterThan(-1);
  const apendice = md.slice(inicio, fin === -1 ? undefined : fin).replace(/\s*\n\s*/g, ' ');
  return new Set([...apendice.matchAll(/`([^`]+)`/g)].map((m) => normalizar(m[1])));
}

function hojas(obj: object, prefijo = ''): [string, string][] {
  return Object.entries(obj).flatMap(([clave, valor]): [string, string][] => {
    const ruta = prefijo ? `${prefijo}.${clave}` : clave;
    if (typeof valor === 'string') return [[ruta, valor]];
    if (typeof valor === 'function') {
      const args = Array.from({ length: valor.length }, () => MARCA);
      return [[ruta, normalizar(String(valor(...args)))]];
    }
    return hojas(valor as object, ruta);
  });
}

describe('textos.ts', () => {
  const apendice = literalesDelApendice();

  it.each(hojas(T))('%s está en el Apéndice A', (_ruta, texto) => {
    expect(apendice.has(texto), `"${texto}" no está en el Apéndice A de 06; añádelo en el mismo PR`).toBe(true);
  });

  it('el cuarto nivel es "No funciona", nunca "Defecto" (00 §6)', () => {
    // "Capa por defecto" es legítimo: lo prohibido es "defecto" como estado de un punto.
    for (const [ruta, texto] of hojas(T)) expect(texto, ruta).not.toMatch(/^defectos?$/i);
    expect(T.formulario.noFunciona).toBe('No funciona');
  });
});

// docs/24 RV-99: menos texto en las pantallas de campo. Que no vuelvan por descuido.
describe('textos quitados de las pantallas de campo (docs/24 RV-99)', () => {
  const todas = new Set(hojas(T).map(([ruta]) => ruta));
  it.each([
    'aqui.junto',
    'formulario.diametroAyuda',
    'formulario.caudalAyuda',
    'envio.avisoSinServidor',
    'envio.avisoSinCobertura',
  ])('%s ya no existe', (ruta) => {
    expect(todas.has(ruta)).toBe(false);
  });

  it('"Toca el mapa para ajustar el pin" ya no habla del círculo azul ni lleva parámetro', () => {
    expect(T.avisosFormulario.ajustaPin).toBe('Toca el mapa para ajustar el pin');
  });

  it.each(['La salida, no la tubería', 'Malo = probado', 'el círculo azul es tu GPS', 'Junto a '])(
    '"%s" tampoco sigue en el Apéndice A',
    (trozo) => {
      expect([...literalesDelApendice()].some((l) => l.includes(trozo))).toBe(false);
    },
  );

  it('Malo y No funciona se explican en la segunda pantalla de primer uso (FR-94, FR-18)', () => {
    const segunda = T.bienvenida.pantallas[1];
    expect(segunda.lineas).toEqual([
      'Malo: se probó y sale débil.',
      'No funciona: no se pudo usar (tapa, válvula, arqueta).',
    ]);
  });
});

// docs/25 RV-112 (DEC-163): en una boca de riego el campo es el «tipo de enganche». Las claves
// siguen llamándose racor (contrato con la app anterior, 04 §12); lo que se lee, no.
describe('tipo de enganche, no racor (docs/25 RV-112)', () => {
  it('ningún texto visible dice "racor"', () => {
    const conRacor = hojas(T).filter(([, texto]) => /racor/i.test(texto));
    expect(conRacor).toEqual([]);
  });

  it('los textos del enganche', () => {
    expect(T.formulario.racor).toBe('Tipo de enganche');
    expect(T.avisosFormulario.eligeRacor).toBe('Elige el tipo de enganche');
    expect(T.ficha.racor('Granada')).toBe('Enganche Granada');
    expect(T.panelCola.campoRacor).toBe('Tipo de enganche');
    expect(T.operaciones.corregirDatosDetalle).toBe('Diámetro, tipo de enganche o descripción mal anotados');
    expect(T.panelInventario.enganche('Granada')).toBe('enganche Granada');
  });
});
