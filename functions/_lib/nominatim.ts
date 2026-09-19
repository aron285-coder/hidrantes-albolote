// Reverse geocoding con Nominatim (FR-15, TR-72): como mucho una petición por segundo desde cada
// instancia, con User-Agent identificable, y nunca bloquea: sin respuesta, la dirección queda vacía.

export interface DireccionNominatim {
  address?: Record<string, string>;
  display_name?: string;
}

/** "Calle Real 14, Albolote": calle y número más cercanos, y la localidad. */
export function formatearDireccion(r: DireccionNominatim): string | null {
  const a = r.address ?? {};
  const via = a.road ?? a.pedestrian ?? a.footway ?? a.path ?? a.square ?? a.neighbourhood;
  const localidad = a.village ?? a.town ?? a.city ?? a.hamlet ?? a.suburb ?? a.municipality;
  if (!via && !localidad) return null;
  const calle = via ? [via, a.house_number].filter(Boolean).join(' ') : null;
  return [calle, localidad].filter(Boolean).join(', ');
}

let ultima = 0;

/** Cola mínima: espera lo necesario para no pasar de 1 petición/s en esta instancia. */
export async function turnoNominatim(
  ahora = () => Date.now(),
  dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms)),
) {
  const espera = Math.max(0, ultima + 1000 - ahora());
  ultima = ahora() + espera;
  if (espera > 0) await dormir(espera);
}

export async function direccionDe(lat: number, lng: number, agente: string): Promise<string | null> {
  await turnoNominatim();
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.search = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'es',
  }).toString();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': agente }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    return formatearDireccion((await r.json()) as DireccionNominatim);
  } catch {
    return null;
  }
}
