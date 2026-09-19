/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_ENTORNO?: 'local' | 'staging' | 'produccion';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_MAPABASE_URL?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
