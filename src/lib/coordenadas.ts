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

/** Enlace universal de Google Maps a unas coordenadas (FR-75): lo abre cualquier móvil. */
export const enlaceGoogleMaps = (p: LatLng) =>
  `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
