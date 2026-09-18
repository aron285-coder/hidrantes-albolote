import { describe, expect, it } from 'vitest';
import { archivoProhibido, buscarSecretos } from './detectar-secretos.ts';

describe('buscarSecretos', () => {
  it.each([
    ['-----BEGIN PGP PRIVATE KEY BLOCK-----'],
    ['const k = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop"'],
    ['sb_secret_abcdefghijklmnopqrstu'],
    ['token: ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['postgresql://hidrantes_migrador.abc:Sup3rClave@aws-0.pooler.supabase.com:5432/postgres'],
    ['SERVICE_ROLE_KEY=abcdefghijklmnop123'],
  ])('detecta %s', (linea) => {
    expect(buscarSecretos(linea)).toHaveLength(1);
  });

  it.each([
    ['postgresql://postgres:postgres@127.0.0.1:55422/postgres'],
    ['postgresql://hidrantes_migrador:migrador-local@127.0.0.1:55422/postgres'],
    ['postgresql://hidrantes_migrador.${ref}:${clave}@${host}:5432/postgres'],
    ['SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}'],
    ['VITE_SUPABASE_URL='],
    ['    SUPABASE_SERVICE_ROLE_KEY: sb.servicio,'],
    ['    PGPASSWORD: decodeURIComponent(u.password),'],
    ['// `postgresql://usuario:clave@host:puerto/bd`'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abcdefghijklmnop  # detectar-secretos:permitir'],
  ])('no molesta con %s', (linea) => {
    expect(buscarSecretos(linea)).toHaveLength(0);
  });
});

describe('archivoProhibido', () => {
  it.each(['.env', '.env.local', 'config/.env.produccion', 'respaldo.sql.gpg', 'datos/mapa.pmtiles'])('%s', (r) =>
    expect(archivoProhibido(r)).toBe(true),
  );
  it.each(['.env.example', 'src/lib/entorno.ts', 'datos/zona-cobertura.geojson'])('%s se permite', (r) =>
    expect(archivoProhibido(r)).toBe(false),
  );
});
