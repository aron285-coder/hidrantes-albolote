// Crea una issue de GitHub por cada tarea de las fases 1–9 de docs/09 (09 Fase 0, paso 10),
// con la forma del skill task-shaper: por qué, qué, fuera de alcance, cómo verificar,
// criterios de aceptación como checklist y esfuerzo. Idempotente por título.
//
//   npm run crear-issues                 crea las que falten
//   npm run crear-issues -- --simular    solo imprime lo que crearía

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, argumentos, ejecutarScript, log } from './lib/comun.ts';
import { gh } from './lib/servicios.ts';

export interface Tarea {
  fase: number;
  indice: number;
  titulo: string;
  texto: string;
  objetivo: string;
  criterioSalida: string;
  esfuerzo: 'S' | 'M' | 'L';
}

function limpiar(md: string): string {
  return md.replace(/\s+/g, ' ').trim();
}

/** Título corto: hasta el primer ":" / ";" / "(" o 90 caracteres, sin markdown. */
export function tituloDe(texto: string): string {
  const sinMd = texto.replace(/\*\*|`/g, '');
  const corte = sinMd.split(/[:;(]|\. /)[0].trim();
  return corte.length > 90 ? `${corte.slice(0, 87).trimEnd()}…` : corte;
}

export function leerTareas(md = readFileSync(path.join(RAIZ, 'docs', '09-plan-implementacion.md'), 'utf8')): Tarea[] {
  const tareas: Tarea[] = [];
  const secciones = md.split(/\n(?=## Fase \d+ · )/).slice(1);
  for (const seccion of secciones) {
    const fase = Number(seccion.match(/^## Fase (\d+)/)![1]);
    if (fase < 1 || fase > 9) continue;
    const cuerpo = seccion.split(/\n---\n/)[0];
    const objetivo = limpiar(cuerpo.match(/\*\*Objetivo:\*\*([\s\S]*?)\n\n/)?.[1] ?? '');
    const criterioSalida = limpiar(cuerpo.match(/\*\*Criterio de salida:\*\*([\s\S]*?)(\n\n|$)/)?.[1] ?? '');
    const items = cuerpo.split('\n').reduce<string[]>((acc, linea) => {
      if (linea.startsWith('- [ ] ') || linea.startsWith('- [x] ')) acc.push(linea.slice(6));
      else if (acc.length && /^\s{2,}\S/.test(linea)) acc[acc.length - 1] += ` ${linea.trim()}`;
      return acc;
    }, []);
    items.forEach((texto, i) => {
      const t = limpiar(texto);
      tareas.push({
        fase,
        indice: i + 1,
        titulo: `F${fase}.${i + 1} · ${tituloDe(t)}`,
        texto: t,
        objetivo,
        criterioSalida,
        esfuerzo: t.length < 160 ? 'S' : t.length < 400 ? 'M' : 'L',
      });
    });
  }
  return tareas;
}

export function cuerpoDe(t: Tarea): string {
  return `## Por qué
${t.objetivo || `Parte de la Fase ${t.fase} de docs/09.`}

## Qué
${t.texto}

## Fuera de alcance
Lo que cubren las demás tareas de la Fase ${t.fase} y las fases siguientes (docs/09). Nada que no esté en
docs/01 o en docs/12: si falta algo, se comenta aquí y se propone en 12 antes de construirlo.

## Cómo verificar
Criterio de salida de la Fase ${t.fase}: ${t.criterioSalida}

## Criterios de aceptación
- [ ] Hecho lo descrito en "Qué", con los documentos que cita
- [ ] Tests: unitarios (\`src/lib\`), pgTAP (SQL) o Playwright (flujos), según lo tocado
- [ ] Reglas de interfaz de 06 §9 comprobadas en la pantalla tocada (si hay pantalla)
- [ ] Textos nuevos en \`src/lib/textos.ts\` y en el Apéndice A de 06
- [ ] Documento propietario actualizado si algo cambia (y entrada en 12)

**Esfuerzo:** ${t.esfuerzo} · **Referencia:** docs/09-plan-implementacion.md, Fase ${t.fase}
`;
}

export function crearIssues(repo: string, simular = false): void {
  const tareas = leerTareas();
  const existentes = new Set(
    gh([
      'issue',
      'list',
      '--repo',
      repo,
      '--state',
      'all',
      '--limit',
      '1000',
      '--json',
      'title',
      '--jq',
      '.[].title',
    ]).split('\n'),
  );
  let creadas = 0;
  for (const t of tareas) {
    if (existentes.has(t.titulo)) continue;
    if (simular) {
      log.info(`crearía: ${t.titulo} [${t.esfuerzo}]`);
    } else {
      gh(
        [
          'issue',
          'create',
          '--repo',
          repo,
          '--title',
          t.titulo,
          '--label',
          `fase-${t.fase}`,
          '--milestone',
          `Fase ${t.fase}`,
          '--body-file',
          '-',
        ],
        cuerpoDe(t),
      );
    }
    creadas++;
  }
  log.ok(
    `${tareas.length} tareas en 09 · ${creadas} ${simular ? 'por crear' : 'creadas'} · ${tareas.length - creadas} ya existían`,
  );
}

async function principal(): Promise<void> {
  const { banderas } = argumentos();
  crearIssues('aron285-coder/hidrantes-albolote', banderas.has('simular'));
}

if (import.meta.main) ejecutarScript(principal);
