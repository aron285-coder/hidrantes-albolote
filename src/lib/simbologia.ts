// Marcador del punto, exactamente como 06 §4. El radio viene del servidor (`radio_px` de
// v_puntos_activos, con la escala de config); aquí solo se dibuja. Mismo dibujo en mapa, lista,
// ficha y leyenda.

import { caudalParaDibujar } from './caudal';
import type { Caudal, TipoPunto } from './puntos';

/** Rellenos de estado (06 §2.2), idénticos en claro y oscuro. */
export const COLOR_CAUDAL: Record<Caudal, string> = {
  bueno: 'var(--verde-600)',
  regular: 'var(--amarillo-500)',
  malo: 'var(--rojo-700)',
  // docs/24 RV-102 (DEC-149): marrón, con tamaño mínimo y tachado; sin atenuar.
  barro: 'var(--marron-600)',
  no_funciona: 'var(--gris-700)',
};

/** Objetivo táctil mínimo alrededor de cada marcador (06 §4.3, UI-15). */
export const OBJETIVO_TACTIL = 44;

export interface Simbolo {
  tipo: TipoPunto;
  caudal: Caudal;
  radio_px: number;
  revision_caducada: boolean;
}

/** Radio de esquina del cuadrado de la boca de riego (06 §4.3). */
export function esquina(r: number): number {
  if (r <= 5) return 2;
  if (r <= 5.5) return 2.5;
  return 3;
}

/** Grosor del borde: 2,5 px, o 2 px si el radio es ≤ 5,5. */
export const grosorBorde = (r: number) => (r <= 5.5 ? 2 : 2.5);

/** Radio con el que se dibuja un `radio_px` roto: el mínimo de la escala (R5, 06 §4.1). */
const RADIO_DE_RESERVA = 5;

/** Anillo de "sin revisar" (06 §4.3, DEC-155): grosor y separación desde la cara exterior del borde. */
const ANILLO_GROSOR = 1.5;
const ANILLO_SEPARACION = 2.5;
/** Rayas del anillo, sea cual sea el tamaño: dash = gap = perímetro / (2 × RAYAS). */
const ANILLO_RAYAS = 8;

const redondo = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Medio lado del anillo de "sin revisar", medido a la línea central de su trazo: el radio del
 * círculo, o la mitad del lado del cuadrado de la boca.
 */
const medioAnillo = (r: number) => r + grosorBorde(r) / 2 + ANILLO_SEPARACION + ANILLO_GROSOR / 2;

/**
 * Anillo exterior discontinuo de "sin revisar" (DEC-155): continuo el borde, y fuera, a 2,5 px, un
 * anillo fino de 8 rayas. Un borde discontinuo sobre un radio de 5 a 7 px parecía una rueda dentada
 * (docs/25 RV-107). En la boca es un cuadrado concéntrico, con la esquina desplazada lo mismo.
 */
function anilloSinRevisar(tipo: TipoPunto, r: number): string {
  const h = medioAnillo(r);
  const comun = `fill="none" stroke="var(--anillo-sin-revisar)" stroke-width="${ANILLO_GROSOR}"`;
  if (tipo === 'hidrante') {
    const d = redondo((2 * Math.PI * h) / (2 * ANILLO_RAYAS));
    return `<circle data-sin-revisar r="${redondo(h)}" ${comun} stroke-dasharray="${d} ${d}"/>`;
  }
  const rx = esquina(r) + (h - r);
  const perimetro = 8 * h - (8 - 2 * Math.PI) * rx;
  const d = redondo(perimetro / (2 * ANILLO_RAYAS));
  const [x, lado] = [redondo(-h), redondo(2 * h)];
  return `<rect data-sin-revisar x="${x}" y="${x}" width="${lado}" height="${lado}" rx="${redondo(rx)}" ${comun} stroke-dasharray="${d} ${d}"/>`;
}

/**
 * SVG del marcador centrado en (0, 0). `tamano` es el lado del lienzo (44 en el mapa para el
 * objetivo táctil). El borde usa --borde-marcador, blanco en los dos modos (DEC-072), salvo el
 * amarillo de regular, que lleva --borde-marcador-regular: oscuro, porque es claro (DEC-154).
 *
 * En un lienzo pequeño (lista, leyenda, ficha) el viewBox crece lo justo para que quepa el anillo
 * de "sin revisar" sin recortarse (DEC-155). Crece por el radio, no por si el punto está revisado:
 * dos puntos del mismo radio se ven del mismo tamaño en la misma lista.
 */
export function svgMarcador(p: Simbolo, { tamano = OBJETIVO_TACTIL, seleccionado = false } = {}): string {
  // Un radio que no es un número positivo (dato roto) se dibuja con el mínimo, R5, como un estado
  // desconocido: así no sale un anillo de "sin revisar" vacío ni un viewBox con NaN.
  const r = Number.isFinite(p.radio_px) && p.radio_px > 0 ? p.radio_px : RADIO_DE_RESERVA;
  const bw = grosorBorde(r);
  // Un caudal que esta versión no conoce se dibuja como no funciona (docs/24 RV-102a).
  const caudal = caudalParaDibujar(p.caudal);
  const nf = caudal === 'no_funciona';
  // docs/33 RV-319 (U10): Barro y No funciona se distinguen sin color (WCAG 1.4.1, FR-61). Barro,
  // marrón lleno con una «B» blanca; No funciona, blanco con borde gris y un aspa gris.
  const borde = nf
    ? 'var(--gris-700)'
    : caudal === 'regular'
      ? 'var(--borde-marcador-regular)'
      : 'var(--borde-marcador)';
  // El borde es siempre continuo (DEC-155): "sin revisar" lo dice el anillo de fuera.
  // El borde gris de No funciona, más fino: grueso, a tamaño de leyenda el blanco no se veía.
  const trazo = `stroke="${borde}" stroke-width="${nf ? 1.5 : bw}"`;
  // El blanco de No funciona es el del borde de los marcadores: blanco en los dos modos (DEC-072).
  const relleno = `fill="${nf ? 'var(--borde-marcador)' : COLOR_CAUDAL[caudal]}"`;
  const forma =
    p.tipo === 'hidrante'
      ? `<circle data-forma="circulo" r="${r}" ${relleno} ${trazo}/>`
      : `<rect data-forma="cuadrado" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" rx="${esquina(r)}" ${relleno} ${trazo}/>`;
  const k = redondo(r * 0.4);
  const tachado =
    caudal === 'barro'
      ? `<text data-letra x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-weight="700" font-size="${redondo(r * 1.15)}" fill="var(--borde-marcador)">B</text>`
      : nf
        ? `<line data-aspa x1="${-k}" y1="${-k}" x2="${k}" y2="${k}" stroke="var(--gris-700)" stroke-width="1.25" stroke-linecap="round"/>` +
          `<line data-aspa x1="${-k}" y1="${k}" x2="${k}" y2="${-k}" stroke="var(--gris-700)" stroke-width="1.25" stroke-linecap="round"/>`
        : '';
  const sinRevisar = p.revision_caducada ? anilloSinRevisar(p.tipo, r) : '';
  // Medio lado de la caja del anillo de "sin revisar", hasta su cara exterior.
  const h = medioAnillo(r);
  const cajaAnillo = h + ANILLO_GROSOR / 2;
  // Su punto más lejos del centro: en el cuadrado, sobre el arco de la esquina.
  const rxAnillo = esquina(r) + (h - r);
  const lejosAnillo = p.tipo === 'hidrante' ? cajaAnillo : Math.SQRT2 * (h - rxAnillo) + rxAnillo + ANILLO_GROSOR / 2;
  // El de selección (trazo de 2 px) va a 3 px del borde; si el punto está sin revisar, a 2 px por
  // fuera de su anillo, para que los dos no se monten.
  const rSeleccion = p.revision_caducada ? lejosAnillo + 2 + 1 : r + bw + 3;
  const anillo = seleccionado
    ? `<circle data-seleccion r="${redondo(rSeleccion)}" fill="none" stroke="var(--anillo-seleccion)" stroke-width="2"/>`
    : '';
  // Lo que hay que dejar dentro del lienzo. Se calcula como si el punto estuviera sin revisar, para
  // que la escala no cambie entre uno revisado y otro que no lo está.
  const alcance = seleccionado ? Math.max(cajaAnillo, lejosAnillo + 2 + 2) : cajaAnillo;
  const m = redondo(Math.max(tamano / 2, alcance));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamano}" height="${tamano}" viewBox="${-m} ${-m} ${2 * m} ${2 * m}" aria-hidden="true">${anillo}${sinRevisar}${forma}${tachado}</svg>`;
}

/** Declutter por zoom (06 §4.4): al alejar desaparecen primero los más pequeños. Sin racimos. */
export function radioMinimo(zoom: number): number {
  if (zoom <= 13) return 9;
  if (zoom <= 15) return 7;
  return 0;
}

export const visibleEnZoom = (radio: number, zoom: number) => radio >= radioMinimo(zoom);
