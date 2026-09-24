import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { type FilaExportada, CABECERAS, celdas, csv, geojson, hojaXml, nombreArchivo, xlsx } from './exportar';

const FILAS: FilaExportada[] = [
  {
    codigo: 'HID-0001',
    tipo: 'hidrante',
    diametro_mm: 100,
    caudal: 'bueno',
    racor: null,
    direccion: 'Calle "Real" 14',
    nucleo: 'Albolote',
    municipio: 'albolote',
    fecha_ultima_revision: '2026-08-20',
    lat: 37.2308,
    lng: -3.6569,
  },
  {
    codigo: 'BOC-0002',
    tipo: 'boca_riego',
    diametro_mm: 45,
    caudal: 'no_funciona',
    racor: 'granada',
    direccion: null,
    nucleo: null,
    municipio: 'fuera_de_zona',
    fecha_ultima_revision: '2025-01-10',
    lat: 37.24,
    lng: -3.66,
  },
];

describe('exportación (FR-160, FL-32)', () => {
  it('la fila sale en palabras, no en códigos internos (UI-22)', () => {
    expect(celdas(FILAS[0])).toEqual([
      'HID-0001',
      'Hidrante',
      100,
      'Bueno',
      '',
      'Calle "Real" 14',
      'Albolote',
      'Albolote',
      '20 ago 2026',
      37.2308,
      -3.6569,
    ]);
    expect(celdas(FILAS[1])[3]).toBe('No funciona');
    expect(celdas(FILAS[1])[7]).toBe('Fuera de zona');
  });

  it('CSV con BOM, punto y coma y comillas escapadas para Excel en español', () => {
    const texto = csv(FILAS);
    expect(texto.startsWith('﻿')).toBe(true);
    const lineas = texto.trimEnd().split('\r\n');
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toContain(CABECERAS[0]);
    expect(lineas[1]).toContain('"Calle ""Real"" 14"');
    expect(lineas[1]).toContain(';37.2308;');
  });

  it('GeoJSON con las coordenadas en el orden correcto y los datos crudos', () => {
    const g = JSON.parse(geojson(FILAS));
    expect(g.type).toBe('FeatureCollection');
    expect(g.features[0].geometry.coordinates).toEqual([-3.6569, 37.2308]);
    expect(g.features[1].properties).toMatchObject({ codigo: 'BOC-0002', racor: 'granada', nucleo: null });
  });

  it('el .xlsx es un zip con las partes que Excel espera y los números como números', () => {
    const archivos = unzipSync(xlsx(FILAS));
    expect(Object.keys(archivos).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/workbook.xml',
      'xl/worksheets/hoja1.xml',
    ]);
    const hoja = strFromU8(archivos['xl/worksheets/hoja1.xml']);
    expect(hoja).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Código</t></is></c>');
    expect(hoja).toContain('<c r="C2"><v>100</v></c>');
    expect(hoja).toContain('<c r="J2"><v>37.2308</v></c>');
    expect(hojaXml(FILAS).split('<row ').length - 1).toBe(3);
  });

  it('escapa lo que rompería el XML', () => {
    const conXml = { ...FILAS[0], direccion: 'Calle <A & B> "1"' };
    expect(hojaXml([conXml])).toContain('Calle &lt;A &amp; B&gt; &quot;1&quot;');
  });

  it('el archivo lleva la fecha del día', () => {
    expect(nombreArchivo('xlsx', new Date('2026-09-20T10:00:00Z'))).toBe('hidrantes-albolote-2026-09-20.xlsx');
    expect(nombreArchivo('geojson', new Date('2026-01-02T10:00:00Z'))).toBe('hidrantes-albolote-2026-01-02.geojson');
  });
});

// FR-160: la exportación usa los filtros activos, también la búsqueda, que el servidor no conoce.
describe('exportar con búsqueda (RV-24)', () => {
  it('con búsqueda exporta solo las filas visibles', async () => {
    const { soloVisibles } = await import('./exportar');
    expect(soloVisibles(FILAS, undefined)).toEqual(FILAS);
    expect(soloVisibles(FILAS, [FILAS[1]!.codigo]).map((f) => f.codigo)).toEqual([FILAS[1]!.codigo]);
    expect(soloVisibles(FILAS, [])).toEqual([]);
  });
});
