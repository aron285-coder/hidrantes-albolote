// Tras desplegar: la app responde, sirve la versión esperada y las cabeceras de TR-100.
// Solo lectura, sin datos. La usan deploy-staging.yml y deploy-prod.yml.
//
//   npm run comprobar-despliegue -- --url https://hidrantes-albolote-staging.pages.dev --entorno staging

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, abortar, argumentos, ejecutarScript, log } from './lib/comun.ts';

export interface Pagina {
  estado: number;
  cabeceras: Headers;
  html: string;
  robots: string;
}

export function comprobarPagina(p: Pagina, entorno: 'staging' | 'produccion', version: string): string[] {
  const problemas: string[] = [];
  const c = (n: string) => p.cabeceras.get(n) ?? '';
  if (p.estado !== 200) problemas.push(`estado ${p.estado}`);
  if (!p.html.includes(`<meta name="version" content="${version}"`)) problemas.push(`no sirve la versión ${version}`);

  const csp = c('content-security-policy');
  if (!csp) problemas.push('falta Content-Security-Policy');
  if (csp.includes('unsafe-eval')) problemas.push('la CSP permite unsafe-eval');
  if (!/max-age=\d{7,}/.test(c('strict-transport-security'))) problemas.push('falta Strict-Transport-Security');
  if (c('x-content-type-options') !== 'nosniff') problemas.push('falta X-Content-Type-Options: nosniff');
  if (c('referrer-policy') !== 'strict-origin-when-cross-origin') problemas.push('Referrer-Policy incorrecta');
  const permisos = c('permissions-policy');
  if (!permisos.includes('camera=(self)') || !permisos.includes('geolocation=(self)')) {
    problemas.push('Permissions-Policy no limita cámara y geolocalización al propio origen');
  }

  const noindex = p.html.includes('name="robots" content="noindex');
  const bloqueado = /Disallow:\s*\/\s*$/m.test(p.robots);
  if (entorno === 'staging' && (!noindex || !bloqueado)) problemas.push('staging no está marcado noindex / Disallow');
  if (entorno === 'produccion' && (noindex || bloqueado)) problemas.push('producción está marcada noindex / Disallow');
  return problemas;
}

async function principal(): Promise<void> {
  const { valores } = argumentos();
  const url = valores.get('url') ?? abortar('Falta --url');
  const entorno = valores.get('entorno') as 'staging' | 'produccion';
  if (!['staging', 'produccion'].includes(entorno)) abortar('--entorno staging | produccion');
  const version = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version as string;

  // Pages tarda unos segundos en propagar un despliegue nuevo.
  let problemas: string[] = [];
  for (let intento = 1; intento <= 6; intento++) {
    const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    const robots = await (await fetch(new URL('/robots.txt', url))).text();
    problemas = comprobarPagina(
      { estado: r.status, cabeceras: r.headers, html: await r.text(), robots },
      entorno,
      version,
    );
    if (problemas.length === 0) break;
    await new Promise((ok) => setTimeout(ok, 10_000));
  }
  if (problemas.length) abortar(`${url}:\n  - ${problemas.join('\n  - ')}`);
  log.ok(`${url} responde con la versión ${version} y las cabeceras de TR-100`);
}

if (import.meta.main) ejecutarScript(principal);
