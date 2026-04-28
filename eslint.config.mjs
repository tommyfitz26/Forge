import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  // Generated outputs — Serwist writes a minified sw.js + chunked workers into
  // public/ on every build. Linting them produces hundreds of irrelevant
  // warnings against compiled code.
  {
    ignores: ['public/sw.js', 'public/sw.js.map', 'public/swe-worker-*.js', 'public/workbox-*.js'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default config;
