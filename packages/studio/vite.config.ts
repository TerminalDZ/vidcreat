import { defineConfig } from 'vite';

// The studio client is a static vanilla-TS app served by the CLI's local server.
export default defineConfig({
  root: 'client',
  base: './',
  build: { outDir: '../dist/client', emptyOutDir: true, target: 'es2022', sourcemap: true },
  logLevel: 'warn',
});
