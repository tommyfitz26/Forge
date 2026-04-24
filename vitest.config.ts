import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` throws when bundled for the client. Vitest looks like a
      // client bundler to it, so stub it out for tests.
      'server-only': path.resolve(__dirname, 'tests/shims/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
  },
});
