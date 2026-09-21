import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  define: { __VERSION__: JSON.stringify('0.0.0-test') },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'config/**/*.test.ts', 'functions/**/*.test.ts'],
    environment: 'node',
  },
});
