// TR-112: los textos de textos.ts coinciden con el Apéndice A de docs/06.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { plural, T } from './textos';

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

/** Como `hojas`, pero llamando a cada función con `valor` en todos sus argumentos. */
function hojasCon(obj: object, valor: unknown): string[] {
  return Object.values(obj).flatMap((v): string[] => {
    if (typeof v === 'string') return [v];
    if (typeof v === 'function') {
      try {
        return [normalizar(String(v(...Array.from({ length: v.length }, () => valor))))];
      } catch {
        return [];
      }
    }
    return hojasCon(v as object, valor);
  });
}

describe('textos.ts', () => {
  const apendice = literalesDelApendice();

  it.each(hojas(T))('%s está en el Apéndice A', (_ruta, texto) => {
    expect(apendice.has(texto), `"${texto}" no está en el Apéndice A de 06; añádelo en el mismo PR`).toBe(true);
  });

  // docs/39 RV-525: al revés, cada texto del Apéndice A existe en textos.ts (cada […] es un hueco que casa con cualquier
  // valor; con 1 y 2 salen los singulares y plurales), o está en esta lista cerrada, cada uno con su motivo.
  const NO_SON_DE_TEXTOS: Record<string, string> = {
    'Respaldo sin copia': 'título del aviso push de la vigilancia (vigilancia.yml), no de la app',
    'El último respaldo no tiene su copia guardada en GitHub. Mira la issue de vigilancia.': 'cuerpo de ese aviso',
    'Espacio casi lleno': 'título del aviso push de la vigilancia (vigilancia.yml)',
    'Las fotos o la base de datos se están quedando sin espacio. Mira Salud del sistema.': 'cuerpo de ese aviso',
    'Aviso técnico': 'título por defecto de fn_encolar_aviso_tecnico (0045, 0051)',
    'La comprobación diaria ha encontrado un problema. El desarrollador ya tiene el aviso. Mira Salud del sistema.':
      'texto fijo de fn_encolar_aviso_tecnico (vigilancia)',
    'El respaldo de esta semana ha fallado.': 'texto fijo de fn_encolar_aviso_tecnico (respaldo)',
    'La última actualización no se ha podido instalar entera.': 'texto fijo de fn_encolar_aviso_tecnico (despliegue)',
    'Alguien está probando códigos de acceso. Si se repite, cambia el código en Ajustes.':
      'texto fijo de fn_encolar_aviso_tecnico (intentos_codigo)',
    'Las tareas automáticas (comprobación diaria o respaldo) llevan días sin hacerse. Avisa al desarrollador.':
      'texto fijo de fn_encolar_aviso_tecnico (tareas_paradas, 0051)',
    '30S 441808 4120645': 'ejemplo de coordenadas UTM, no un texto',
    'fotos_origen = respaldo': 'una clave del Registro, no un texto',
    'staging: true': 'un campo de la respuesta de /api/lanzar-workflow, no un texto',
    'WGS84 · grados decimales: []': 'la etiqueta de textos.ts con su valor detrás, en la pantalla',
    'ETRS89 · UTM huso 30N: []': 'la etiqueta de textos.ts con su valor detrás, en la pantalla',
    'Cercanos · en línea recta': 'el título de la hoja y su nota, dos textos de textos.ts juntos',
    'Revisado: []': '«Revisado:» de textos.ts y la fecha, en la pantalla',
    'Borrado []': '«Borrado» de textos.ts y la fecha, en la pantalla',
  };
  it('cada texto del Apéndice A está en textos.ts o en la lista cerrada', () => {
    const textos = [MARCA, 1, 2]
      .flatMap((a) => hojasCon(T, a))
      .filter((t) => t.split(MARCA).join('').trim().length >= 3);
    const regex = (t: string) =>
      new RegExp(
        `^${t
          .split(MARCA)
          .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')}$`,
        's',
      );
    // Solo lo que es un texto: con un espacio y que no sea una ruta, una clase o un comando.
    const esTexto = (l: string) =>
      /\s/.test(l) &&
      !/^(fn_|docs\/|--|src\/|e2e\/|scripts\/|\.github|tinte-|bg-|text-|npm |gh |node |git |psql)/.test(l);
    const faltan = [...apendice]
      .filter(esTexto)
      .filter((l) => !(l in NO_SON_DE_TEXTOS))
      .filter((l) => !textos.some((t) => t === l || regex(l).test(t) || regex(t).test(l)));
    expect(faltan, 'textos del Apéndice A que ya no existen: quítalos o añádelos a textos.ts').toEqual([]);
  });

  it('el cuarto nivel es "No funciona", nunca "Defecto" (00 §6)', () => {
    // "Capa por defecto" es legítimo: lo prohibido es "defecto" como estado de un punto.
    for (const [ruta, texto] of hojas(T)) expect(texto, ruta).not.toMatch(/^defectos?$/i);
    expect(T.formulario.noFunciona).toBe('No funciona');
  });
});

// docs/27 RV-114 (DEC-165): la hoja de Cercanos sin tramos, compartir ni "El más cercano…".
describe('textos quitados de Cercanos (docs/27 RV-114)', () => {
  const todas = new Set(hojas(T).map(([ruta]) => ruta));
  it.each([
    'incidente.desdeTuPosicion',
    'incidente.precision',
    'incidente.masCercanoNoFunciona',
    'incidente.masCercanoMalo',
    'incidente.masCercanoBarro',
    'incidente.fila',
    'incidente.tramos',
    'incidente.compartirIncidente',
    'incidente.datos',
    'medir.tendido',
  ])('%s ya no existe', (ruta) => {
    expect(todas.has(ruta)).toBe(false);
  });

  it('el subtítulo va en minúscula, detrás de "Cercanos ·"', () => {
    expect(T.incidente.lineaRecta).toBe('en línea recta');
    expect(T.incidente.posicionDe('hace 5 min')).toBe('posición de hace 5 min');
    expect(T.incidente.pocoPrecisa(80)).toBe('posición poco precisa (±80 m)');
    expect(T.incidente.desdePuntoMarcado).toBe('desde el punto marcado');
  });
});

// docs/29 RV-125 (DEC-167): fuera "Algo no funciona en la aplicación"; nadie leería los avisos.
describe('textos quitados con "Algo no funciona" (docs/29 RV-125)', () => {
  const todas = hojas(T);
  const rutas = new Set(todas.map(([ruta]) => ruta));
  it.each([
    'ajustes.algoNoFunciona',
    'ajustes.avisarJefatura',
    'incidencia.intro',
    'incidencia.queHaPasado',
    'incidencia.enviado',
  ])('%s ya no existe', (ruta) => {
    expect(rutas.has(ruta)).toBe(false);
  });

  it('ningún texto de la app manda a "Algo no funciona"', () => {
    for (const [ruta, texto] of todas.filter(([r]) => !r.startsWith('panel'))) {
      expect(texto, ruta).not.toMatch(/Algo no funciona/);
    }
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

// docs/34 RV-350: con un solo elemento, el singular («1 enviada», «1 móvil registrado»). Cero, en plural.
describe('plurales (docs/34 RV-350)', () => {
  // TR-112 llama a cada función con «[]» y solo ve el plural: el singular se comprueba aquí.
  const SINGULARES: [string, string][] = [
    [T.mapa.nPuntos(1), '1 punto'],
    [T.medir.resultado('[]', 1, '[]'), '[] · 1 tramo de manguera de [] m'],
    [T.misPropuestas.resumen(1, '[]'), '1 enviada · [] sin enviar'],
    [
      T.misPropuestas.esperaPropuestasNuevo(1, '[]'),
      'En espera: un móvil recién dado de alta puede enviar 1 propuesta al día. Se enviará [].',
    ],
    [T.ajustes.puntosGuardadosLinea(1, '[]'), '1 punto guardado · sincronizado []'],
    [T.ajustes.perderasEnvios(1), 'Tienes 1 envío sin mandar: se perderá.'],
    [T.panelCola.seleccionadas(1), '1 seleccionada'],
    [T.panelCola.loteAprobadas(1), '1 aprobada, con su entrada en el Registro.'],
    [T.panelCola.loteRechazadas(1), '1 rechazada. Su autor verá el motivo.'],
    [T.panelCola.rechazarVarias(1), 'Rechazar 1 propuesta con un motivo común'],
    [T.panelCola.cambios(1), '1 cambio'],
    [T.panelEditar.descartarN(1), '¿Descartar 1 cambio?'],
    [T.panelInventario.exportado(1), 'Exportada 1 fila. La exportación consta en el Registro.'],
    [T.panelRegistro.entradas(1), '1 entrada'],
    [T.panelRegistro.porPagina(1), '1 entrada por página'],
    [T.panelPapelera.explicacion(1), 'Los borrados se conservan 1 día y después se purgan.'],
    [
      T.panelPapelera.avisoPurga(1),
      'Se borran definitivamente, con sus propuestas y sus fotos, los puntos que llevan más de 1 día en la papelera. No se puede deshacer.',
    ],
    [T.panelPapelera.purgados(1), '1 punto purgado.'],
    [T.panelPapelera.quedan(1), 'queda 1 día'],
    [
      T.panelAjustes.avisoRevocando(1),
      'Se pondrá en vigor un código nuevo y 1 móvil tendrá que volver a escribirlo al abrir la aplicación. Su nombre se conserva.',
    ],
    [T.panelAjustes.nPuntos(1), '1 punto'],
    [
      T.panelAjustes.atencionFrenadas(1),
      '1 móvil con el código bueno no ha podido entrar por el tope: abre la entrada 24 h.',
    ],
    [T.panelAjustes.inventarioDescargado(1), 'Inventario descargado: 1 punto.'],
    [T.panelAjustes.reservasDetalle(1, '[]'), '1 foto · [] sin subir'],
    [T.panelInventario.puntosConFiltro(1), '1 punto con este filtro'],
    [T.panelInventario.puntosConBusqueda(1), '1 punto con esta búsqueda'],
  ];

  it.each(SINGULARES)('%s', (texto, esperado) => {
    expect(texto).toBe(esperado);
  });

  it.each(SINGULARES)('«%s» está en el Apéndice A', (texto) => {
    expect(literalesDelApendice().has(normalizar(texto)), `"${texto}" no está en el Apéndice A de 06`).toBe(true);
  });

  it('plural: 0 y 2 en plural, 1 en singular', () => {
    expect(plural(0, 'enviada', 'enviadas')).toBe('0 enviadas');
    expect(plural(1, 'enviada', 'enviadas')).toBe('1 enviada');
    expect(plural(2, 'enviada', 'enviadas')).toBe('2 enviadas');
  });

  it('con dos, el plural de siempre', () => {
    expect(T.misPropuestas.resumen(2, 0)).toBe('2 enviadas · 0 sin enviar');
    expect(T.panelAjustes.avisoRevocando(2)).toBe(
      'Se pondrá en vigor un código nuevo y 2 móviles tendrán que volver a escribirlo al abrir la aplicación. Sus nombres se conservan.',
    );
    expect(T.panelInventario.puntosConFiltro(4)).toBe('4 puntos con este filtro');
    expect(T.panelPapelera.quedan(3)).toBe('quedan 3 días');
  });
});
