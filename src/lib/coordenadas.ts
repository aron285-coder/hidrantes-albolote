// Coordenadas para compartir, buscar y enseñar (FR-72, FR-73, FR-75; docs/18 GM-01). UTM ETRS89
// huso 30 (EPSG:25830), que es lo que usan bomberos y el 112 en la zona, con la serie de Krüger de
// la transversa de Mercator sobre GRS80: error de milímetros en el huso, muy por debajo del metro de
// TR-119. ETRS89 y WGS84 se tratan como iguales: difieren en menos de un metro y el GPS da WGS84.
// Sin dependencias (DEC-089).

export interface LatLng {
  lat: number;
  lng: number;
}

/** ETRS89 / UTM 30N (EPSG:25830). */
export interface Utm {
  huso: 30;
  x: number;
  y: number;
}

// GRS80
const A_ELIPSOIDE = 6378137;
const F = 1 / 298.257222101;
const K0 = 0.9996;
const FALSO_ESTE = 500000;
/** Meridiano central del huso 30. */
const LNG0 = -3;

const n = F / (2 - F);
const n2 = n * n;
const n3 = n2 * n;
const n4 = n3 * n;
/** Radio rectificante. */
const A = (A_ELIPSOIDE / (1 + n)) * (1 + n2 / 4 + n4 / 64);
const ALFA = [
  n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180,
  (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440,
  (61 * n3) / 240 - (103 * n4) / 140,
  (49561 * n4) / 161280,
];
const BETA = [
  n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360,
  n2 / 48 + n3 / 15 - (437 * n4) / 1440,
  (17 * n3) / 480 - (37 * n4) / 840,
  (4397 * n4) / 161280,
];
const DELTA = [
  2 * n - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45,
  (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45,
  (56 * n3) / 15 - (136 * n4) / 35,
  (4279 * n4) / 630,
];
const E2 = (2 * Math.sqrt(n)) / (1 + n);
const rad = (g: number) => (g * Math.PI) / 180;
const grados = (r: number) => (r * 180) / Math.PI;

/** Lo que cubre el huso 30 con margen: la zona está en torno a −3,66. Fuera, `aUtm` lanza. */
export const dentroDelHuso = (p: LatLng) => p.lng >= -6 && p.lng <= 0 && p.lat >= 0 && p.lat <= 84;

export function aUtm(p: LatLng): Utm {
  if (!dentroDelHuso(p)) throw new RangeError(`Fuera del huso 30: ${p.lat}, ${p.lng}`);
  const fi = rad(p.lat);
  const dl = rad(p.lng - LNG0);
  const t = Math.sinh(Math.atanh(Math.sin(fi)) - E2 * Math.atanh(E2 * Math.sin(fi)));
  const xi = Math.atan2(t, Math.cos(dl));
  const eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let x = eta;
  let y = xi;
  for (let j = 1; j <= 4; j++) {
    x += ALFA[j - 1]! * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    y += ALFA[j - 1]! * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  return { huso: 30, x: FALSO_ESTE + K0 * A * x, y: K0 * A * y };
}

export function desdeUtm(u: { x: number; y: number }): LatLng {
  const xi = u.y / (K0 * A);
  const eta = (u.x - FALSO_ESTE) / (K0 * A);
  let xi1 = xi;
  let eta1 = eta;
  for (let j = 1; j <= 4; j++) {
    xi1 -= BETA[j - 1]! * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    eta1 -= BETA[j - 1]! * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  let fi = chi;
  for (let j = 1; j <= 4; j++) fi += DELTA[j - 1]! * Math.sin(2 * j * chi);
  return { lat: grados(fi), lng: LNG0 + grados(Math.atan2(Math.sinh(eta1), Math.cos(xi1))) };
}

/** "37.230500, -3.656000": seis decimales, unos 10 cm. */
export const formatoDecimal = (p: LatLng) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;

/** Letra de la banda de latitud: la zona está en la S (32° a 40° N). */
function banda(lat: number): string {
  const letras = 'CDEFGHJKLMNPQRSTUVWX';
  return letras[Math.min(letras.length - 1, Math.max(0, Math.floor((lat + 80) / 8)))]!;
}

/** "30S 441808 4120645": redondeado a metro. */
export function formatoUtm(u: Utm, lat?: number): string {
  const letra = banda(lat ?? desdeUtm(u).lat);
  return `${u.huso}${letra} ${Math.round(u.x)} ${Math.round(u.y)}`;
}

/** "37°13′49.8″N 3°39′21.6″O": oeste es O, en español. */
export function formatoGms(p: LatLng): string {
  const parte = (g: number, pos: string, neg: string) => {
    const abs = Math.abs(g);
    let d = Math.floor(abs);
    let m = Math.floor((abs - d) * 60);
    let s = Math.round(((abs - d) * 60 - m) * 600) / 10;
    if (s >= 60) {
      s = 0;
      m++;
    }
    if (m >= 60) {
      m = 0;
      d++;
    }
    return `${d}°${m}′${s.toFixed(1)}″${g >= 0 ? pos : neg}`;
  };
  return `${parte(p.lat, 'N', 'S')} ${parte(p.lng, 'E', 'O')}`;
}

/** `37.230500,-3.656000` en la URL (`?aqui=`, `?incidente=`) → coordenadas, o null si no lo son. */
export function leerLatLng(valor: string | null): LatLng | null {
  if (!valor) return null;
  const partes = valor.split(',').map(Number);
  const [lat, lng] = partes;
  if (partes.length !== 2 || lat === undefined || lng === undefined) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Coordenadas para la URL: seis decimales, unos 10 cm. */
export const parametroLatLng = (l: LatLng) => `${l.lat.toFixed(6)},${l.lng.toFixed(6)}`;

/** Enlace universal de Google Maps a unas coordenadas (FR-75): lo abre cualquier móvil. */
export const enlaceGoogleMaps = (p: LatLng) =>
  `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

// ---------- interpretar lo que se pega en la búsqueda (FR-73, docs/18 GM-04 B) ----------

/** Recuadro de la zona de cobertura, [oeste, sur, este, norte] (datos/meta.json). */
export const RECUADRO_ZONA = [-3.711504, 37.206212, -3.601049, 37.404078] as const;

/** Dentro del recuadro de la zona con `margen` metros alrededor. */
export function cercaDeLaZona(p: LatLng, margen: number): boolean {
  const [oeste, sur, este, norte] = RECUADRO_ZONA;
  const dLat = margen / 111_195;
  const dLng = margen / (111_195 * Math.cos(rad((sur + norte) / 2)));
  return p.lat >= sur - dLat && p.lat <= norte + dLat && p.lng >= oeste - dLng && p.lng <= este + dLng;
}

/**
 * Un UTM solo se acepta cerca de la zona: dos números sueltos de 6 y 7 cifras pueden ser otra cosa.
 * El mismo margen decide si una longitud sin signo se toma como oeste (docs/19 RV-69).
 */
const MARGEN_UTM = 5000;

/** Lo que devuelve `interpretar`: unas coordenadas y, si hubo que suponer algo, qué. */
export interface Interpretadas extends LatLng {
  /** La longitud se escribió sin signo y se ha tomado como oeste: el número tal como se escribió. */
  oesteSupuesto?: string;
}

/** Enlaces cortos de Google Maps: no se resuelven, porque exigiría ir a Google desde el servidor. */
export const esEnlaceCorto = (texto: string) => /\b(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(texto);

const valida = (lat: number, lng: number): LatLng | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;

function desdeEnlace(texto: string): LatLng | null {
  let t = texto;
  try {
    t = decodeURIComponent(texto);
  } catch {
    // Un % suelto: se lee tal cual.
  }
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  // El sitio marcado (!3d…!4d…) manda sobre el centro de la vista (@lat,lng).
  const patrones = [
    new RegExp(String.raw`!3d${num}!4d${num}`),
    new RegExp(String.raw`[?&](?:q|query|ll)=(?:loc:)?${num}\s*,\s*${num}`),
    // Google "search" o "place" con las coordenadas en la ruta, con "+" por espacio (".../37.2305,+-3.656").
    new RegExp(String.raw`/maps/(?:search|place)/\+?${num}\s*,[\s+]*${num}(?=$|[/?&#])`),
    new RegExp(String.raw`@${num},${num}`),
    new RegExp(String.raw`^geo:${num},${num}`),
  ];
  for (const p of patrones) {
    const m = p.exec(t);
    if (m) return valida(Number(m[1]), Number(m[2]));
  }
  return null;
}

/** Grados, minutos y segundos, o grados y minutos decimales (37°13.830'N), que usan GPS de mano y bomberos. */
function desdeGms(texto: string): LatLng | null {
  const partes = [
    ...texto.matchAll(
      /(\d{1,3})\s*°\s*(\d{1,2}(?:[.,]\d+)?)\s*'\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|'')?)?\s*([NSEOW])/gi,
    ),
  ];
  if (partes.length !== 2) return null;
  let lat: number | null = null;
  let lng: number | null = null;
  for (const [, g, m, s, h] of partes) {
    // Minutos con decimales y además segundos no es un formato: se descarta.
    if (/[.,]/.test(m!) && s !== undefined) return null;
    const valor = Number(g) + Number(m!.replace(',', '.')) / 60 + Number((s ?? '0').replace(',', '.')) / 3600;
    const letra = h!.toUpperCase();
    if (letra === 'N' || letra === 'S') lat = letra === 'S' ? -valor : valor;
    else lng = letra === 'E' ? valor : -valor;
  }
  return lat === null || lng === null ? null : valida(lat, lng);
}

function desdeUtmTexto(texto: string): LatLng | null {
  const m =
    /^(?:30\s*[A-Z]?\s+)?(\d{6}(?:\.\d+)?)\s*[,;\s]\s*(\d{7}(?:\.\d+)?)$/i.exec(texto) ??
    /^X\s*[:=]?\s*(\d{6}(?:\.\d+)?)\s*[,;]?\s*Y\s*[:=]?\s*(\d{7}(?:\.\d+)?)$/i.exec(texto);
  if (!m) return null;
  const p = desdeUtm({ x: Number(m[1]), y: Number(m[2]) });
  return cercaDeLaZona(p, MARGEN_UTM) ? p : null;
}

function desdeDecimal(texto: string): Interpretadas | null {
  // Con punto decimal, separados por coma, punto y coma o espacio; o con coma decimal y, entre los dos
  // números, un espacio o una coma (o punto y coma) seguida de espacio ("37,2305 -3,656",
  // "37,2305, -3,656"). Sin ese espacio ("37,2305,-3,656") no se sabe qué coma separa.
  const m =
    /^([+-]?\d{1,2}\.\d+)\s*°?\s*([NS])?\s*[,;\s]\s*([+-]?\d{1,3}\.\d+)\s*°?\s*([EOW])?$/i.exec(texto) ??
    /^([+-]?\d{1,2},\d+)\s*°?\s*([NS])?(?:\s*[,;]\s+|\s+)([+-]?\d{1,3},\d+)\s*°?\s*([EOW])?$/i.exec(texto);
  if (!m) return null;
  let lat = Number(m[1]!.replace(',', '.'));
  let lng = Number(m[3]!.replace(',', '.'));
  if (m[2]?.toUpperCase() === 'S') lat = -Math.abs(lat);
  if (m[4] && m[4].toUpperCase() !== 'E') lng = -Math.abs(lng);
  const p = valida(lat, lng);
  // Longitud sin signo ni letra: la zona está al oeste de Greenwich. Si con el signo cambiado cae en
  // la zona, se toma como oeste y se avisa (docs/19 RV-69); si no, se deja como se escribió.
  if (p && !m[4] && !/^[+-]/.test(m[3]!) && lng > 0) {
    const oeste = { lat: p.lat, lng: -p.lng };
    if (cercaDeLaZona(oeste, MARGEN_UTM)) return { ...oeste, oesteSupuesto: m[3]! };
  }
  return p;
}

/** Texto delante de las coordenadas ("Mi ubicación: 37.2305, -3.656"): se quita hasta el primer número. */
const sinTextoDelante = (t: string) => t.replace(/^[^\d+-]*[:\s](?=\s*[+-]?\d)/, '').trim();

/**
 * Coordenadas pegadas en la búsqueda: decimal, grados-minutos-segundos, grados y minutos decimales,
 * UTM 30 ETRS89 o un enlace de Google Maps, Apple Plans o `geo:`, con o sin texto delante. Null si no
 * lo son, también un enlace corto (`esEnlaceCorto`). Unas coordenadas lejos de la zona se aceptan (el
 * llamador avisa de fuera de zona, FR-55); un UTM no. Si la longitud llegó sin signo y se ha tomado
 * como oeste, lo dice `oesteSupuesto`.
 */
export function interpretar(texto: string): Interpretadas | null {
  const t = texto.trim().replace(/[′’´]/g, "'").replace(/[″”“]/g, '"').replace(/º/g, '°');
  if (!t || esEnlaceCorto(t)) return null;
  if (/^(?:https?:\/\/|geo:)|\b(?:google\.[a-z.]+\/maps|maps\.google\.|maps\.apple\.com)/i.test(t))
    return desdeEnlace(t);
  const leer = (s: string) => desdeGms(s) ?? desdeUtmTexto(s) ?? desdeDecimal(s);
  const directo = leer(t);
  if (directo) return directo;
  const resto = sinTextoDelante(t);
  return resto && resto !== t ? leer(resto) : null;
}
