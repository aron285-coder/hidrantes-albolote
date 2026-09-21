import { describe, expect, it } from 'vitest';
import { enlaceComoLlegar, urlFoto } from './ficha';

describe('ficha (FR-66, FR-161)', () => {
  const p = { lat: 37.2308, lng: -3.6569, codigo: 'HID-0147' };

  it('"Cómo llegar" abre la app de mapas de cada plataforma', () => {
    expect(enlaceComoLlegar(p, 'Mozilla/5.0 (Linux; Android 14; Pixel 7)')).toBe(
      'geo:37.230800,-3.656900?q=37.230800,-3.656900(HID-0147)',
    );
    expect(enlaceComoLlegar(p, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(
      'https://maps.apple.com/?daddr=37.230800,-3.656900&dirflg=d',
    );
    expect(enlaceComoLlegar(p, 'Mozilla/5.0 (Windows NT 10.0)')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=37.230800,-3.656900',
    );
  });

  it('foto por ruta pública del bucket del entorno', () => {
    expect(urlFoto('fotos/a b.jpg', 'https://x.supabase.co')).toBe(
      'https://x.supabase.co/storage/v1/object/public/hidrantes-fotos-dev/fotos/a%20b.jpg',
    );
    expect(urlFoto(null, 'https://x.supabase.co')).toBeNull();
  });
});
