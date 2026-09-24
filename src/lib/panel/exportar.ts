// Exportación del inventario (FR-160, FL-32, TR-105): el panel pide los datos planos a
// fn_exportar_inventario —que además lo anota en el registro— y genera el archivo en el navegador.
// Sin servicios externos: el .xlsx es un zip de XML según la parte mínima de OOXML que Excel,
// LibreOffice y Google Sheets abren sin avisos (DEC-067).

import { zipSync, strToU8 } from 'fflate';
import { type Resultado, rpc } from '../api';
import { nombreCaudal, nombreRacor, nombreTipo } from '../ficha';
import { fechaCorta } from '../formato';
import type { Caudal, Racor, TipoPunto } from '../puntos';
import { T } from '../textos';

export type Formato = 'xlsx' | 'csv' | 'geojson';

export interface FilaExportada {
  codigo: string;
  tipo: TipoPunto;
  diametro_mm: number;
  caudal: Caudal;
  racor: Racor | null;
  direccion: string | null;
  nucleo: string | null;
  municipio: string;
  fecha_ultima_revision: string;
  lat: number;
  lng: number;
}

/** Filtros que admite fn_exportar_inventario (05 §6.2): los del inventario que entiende el servidor. */
export interface FiltrosExportacion {
  tipo?: TipoPunto;
  caudal?: Caudal;
  nucleo?: string;
  diametro_mm?: number;
  revision_caducada?: boolean;
}

export const pedirInventario = (filtros: FiltrosExportacion) =>
  rpc<FilaExportada[]>('fn_exportar_inventario', { filtros });

export const CABECERAS = [
  T.panelInventario.colCodigo,
  T.panelInventario.colTipo,
  T.panelInventario.colDiametro,
  T.panelInventario.colEstado,
  T.panelCola.campoRacor,
  T.ficha.direccion,
  T.panelInventario.colNucleo,
  T.panelInventario.colMunicipio,
  T.panelInventario.colRevision,
  T.panelInventario.colLat,
  T.panelInventario.colLng,
];

const MUNICIPIOS: Record<string, string> = {
  albolote: T.panelInventario.albolote,
  calicasas: T.panelInventario.calicasas,
  fuera_de_zona: T.panelCola.fueraDeZona,
};

/** Una fila en palabras, igual en Excel y en CSV. */
export function celdas(f: FilaExportada): (string | number)[] {
  return [
    f.codigo,
    nombreTipo[f.tipo],
    f.diametro_mm,
    nombreCaudal[f.caudal],
    f.racor ? nombreRacor(f.racor) : '',
    f.direccion ?? '',
    f.nucleo ?? '',
    MUNICIPIOS[f.municipio] ?? f.municipio,
    fechaCorta(f.fecha_ultima_revision),
    f.lat,
    f.lng,
  ];
}

// ---------- CSV (UTF-8 con BOM, para que Excel no rompa los acentos) ----------

const campo = (v: string | number) => (typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`);

export function csv(filas: FilaExportada[]): string {
  return '﻿' + [CABECERAS, ...filas.map(celdas)].map((f) => f.map(campo).join(';')).join('\r\n') + '\r\n';
}

// ---------- GeoJSON ----------

export function geojson(filas: FilaExportada[]): string {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features: filas.map((f) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
        properties: {
          codigo: f.codigo,
          tipo: f.tipo,
          diametro_mm: f.diametro_mm,
          caudal: f.caudal,
          racor: f.racor,
          direccion: f.direccion,
          nucleo: f.nucleo,
          municipio: f.municipio,
          fecha_ultima_revision: f.fecha_ultima_revision,
        },
      })),
    },
    null,
    2,
  );
}

// ---------- XLSX (OOXML mínimo) ----------

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columna = (n: number): string => {
  let nombre = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) nombre = String.fromCharCode(65 + ((x - 1) % 26)) + nombre;
  return nombre;
};

/** Celdas de una fila: los números como número y el resto como texto en línea. */
function filaXml(valores: (string | number)[], n: number): string {
  const celdas = valores
    .map((v, i) => {
      const ref = `${columna(i + 1)}${n}`;
      if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    })
    .join('');
  return `<row r="${n}">${celdas}</row>`;
}

export function hojaXml(filas: FilaExportada[]): string {
  const cuerpo = [CABECERAS, ...filas.map(celdas)].map((f, i) => filaXml(f, i + 1)).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cuerpo}</sheetData></worksheet>`;
}

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/hoja1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
const LIBRO = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hidrantes" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const LIBRO_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/hoja1.xml"/></Relationships>`;

export function xlsx(filas: FilaExportada[]): Uint8Array {
  return zipSync(
    {
      '[Content_Types].xml': strToU8(TIPOS),
      '_rels/.rels': strToU8(RELS),
      'xl/workbook.xml': strToU8(LIBRO),
      'xl/_rels/workbook.xml.rels': strToU8(LIBRO_RELS),
      'xl/worksheets/hoja1.xml': strToU8(hojaXml(filas)),
    },
    // Fecha fija: el zip no admite 1970 y así dos exportaciones iguales dan el mismo archivo.
    { level: 6, mtime: new Date('2020-01-01T00:00:00Z') },
  );
}

// ---------- descarga ----------

const TIPO_MIME: Record<Formato, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  geojson: 'application/geo+json',
};

/** Nombre del archivo: hidrantes-albolote-2026-09-20.xlsx */
export const nombreArchivo = (formato: Formato, hoy = new Date()) =>
  `hidrantes-albolote-${hoy.toISOString().slice(0, 10)}.${formato}`;

export function contenido(formato: Formato, filas: FilaExportada[]): BlobPart {
  if (formato === 'csv') return csv(filas);
  if (formato === 'geojson') return geojson(filas);
  return xlsx(filas) as unknown as BlobPart;
}

/** Guarda el archivo en el ordenador de quien exporta. */
export function descargar(formato: Formato, filas: FilaExportada[]): void {
  const blob = new Blob([contenido(formato, filas)], { type: TIPO_MIME[formato] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo(formato);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Pide los datos y descarga. Devuelve cuántas filas salieron. */
/** Solo las filas que se ven en pantalla, si hay búsqueda (FR-160): el servidor no la conoce. */
export const soloVisibles = (filas: FilaExportada[], codigosVisibles?: string[]) => {
  if (!codigosVisibles) return filas;
  const visibles = new Set(codigosVisibles);
  return filas.filter((f) => visibles.has(f.codigo));
};

/**
 * Exporta con los filtros activos (FR-160). Con `codigosVisibles` (hay búsqueda), el archivo lleva
 * solo esas filas y el recuento devuelto es el del archivo. El registro de la exportación anota los
 * filtros que entiende fn_exportar_inventario; la búsqueda no (su lista de claves no la admite).
 */
export async function exportar(
  formato: Formato,
  filtros: FiltrosExportacion,
  codigosVisibles?: string[],
): Promise<Resultado<number>> {
  const r = await pedirInventario(filtros);
  if (!r.ok) return r;
  const filas = soloVisibles(Array.isArray(r.datos) ? r.datos : [], codigosVisibles);
  descargar(formato, filas);
  return { ok: true, datos: filas.length };
}
