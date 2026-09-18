import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// TR-111 / UI-20: ningún texto de interfaz fuera de src/lib/textos.ts.
// Se considera texto de interfaz una cadena con letras acentuadas o de más de dos palabras.
const PATRON_TEXTO = '/[áéíóúüñÁÉÍÓÚÜÑ¿¡]|\S+\s+\S+\s+\S+/';
const MENSAJE = 'Texto de interfaz fuera de src/lib/textos.ts (UI-20, TR-111). Añádelo a T y al Apéndice A de 06.';
const ATRIBUTOS_VISIBLES = '/^(title|placeholder|alt|aria-label|aria-description|label)$/';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'node_modules',
      'coverage',
      'playwright-report',
      'test-results',
      'supabase/.temp',
      '.wrangler',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-syntax': [
        'error',
        { selector: `JSXText[value=${PATRON_TEXTO}]`, message: MENSAJE },
        {
          selector: `JSXAttribute[name.name=${ATRIBUTOS_VISIBLES}] > Literal[value=${PATRON_TEXTO}]`,
          message: MENSAJE,
        },
        { selector: `JSXExpressionContainer > Literal[value=${PATRON_TEXTO}]`, message: MENSAJE },
        {
          selector: `JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=${PATRON_TEXTO}]`,
          message: MENSAJE,
        },
      ],
    },
  },
  {
    // TR-11 / 03: nada de console.log con datos personales; los errores van a fn_registrar_error.
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] },
  },
);
