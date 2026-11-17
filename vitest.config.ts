import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Needed so .tsx test files (and any .tsx module they import) get their JSX
  // transformed — the root tsconfig.json sets "jsx": "preserve" (left for the
  // bundler to handle), and without this plugin vitest's own esbuild/rolldown
  // transform leaves JSX untouched, which fails to parse.
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./client/src/test-setup.ts'],
    // Playwright specs live in e2e/ and run with `npm run e2e`, not Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});