import { readFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { archivoHeaders, archivoRobots, type Entorno } from './config/cabeceras.ts';
import { T } from './src/lib/textos.ts';

const version: string = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')).version;

/** Versión en <meta>, noindex fuera de producción, `_headers` y `robots.txt` por entorno (04 §4, TR-100). */
function entornoPlugin(entorno: Entorno, env: Record<string, string>): Plugin {
  return {
    name: 'hidrantes-entorno',
    transformIndexHtml(html) {
      const etiquetas = [{ tag: 'meta', attrs: { name: 'version', content: version }, injectTo: 'head' as const }];
      if (entorno !== 'produccion') {
        etiquetas.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' });
      }
      return {
        html: html
          .replace('%TITULO%', `${T.app.nombreCorto} · ${T.app.nombre}`)
          .replace('%NOMBRE_CORTO%', T.app.nombreCorto),
        tags: etiquetas,
      };
    },
    generateBundle() {
      const opciones = { entorno, supabaseUrl: env.VITE_SUPABASE_URL, mapabaseUrl: env.VITE_MAPABASE_URL };
      this.emitFile({ type: 'asset', fileName: '_headers', source: archivoHeaders(opciones) });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: archivoRobots(entorno) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const entorno = (env.VITE_ENTORNO || 'local') as Entorno;
  if (!['local', 'staging', 'produccion'].includes(entorno)) {
    throw new Error(`VITE_ENTORNO no válido: ${entorno}`);
  }

  return {
    define: { __VERSION__: JSON.stringify(version) },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    plugins: [
      react(),
      tailwindcss(),
      entornoPlugin(entorno, env),
      VitePWA({
        // Registro y aviso "hay una versión nueva, recargar" en src/lib/pwa.ts (TR-24).
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          name: `${T.app.nombreCorto} · ${T.app.nombre}`,
          short_name: T.app.nombreCorto,
          lang: 'es',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          theme_color: '#0E1B30',
          background_color: '#F1F3EE',
          icons: [
            { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
          // Rutas de la SPA sin red: el armazón precacheado. Las Functions nunca desde la caché.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          // Fotos ya vistas, para que la ficha las enseñe sin cobertura (DEC-011). Solo lectura pública.
          runtimeCaching: [
            {
              urlPattern: /\/storage\/v1\/object\/public\/hidrantes-fotos/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'hidrantes-fotos',
                expiration: { maxEntries: 800, maxAgeSeconds: 180 * 24 * 3600 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': 'http://127.0.0.1:8788' },
    },
    build: { target: 'es2022', sourcemap: true },
  };
});
