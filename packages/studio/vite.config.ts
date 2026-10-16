import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The studio (cue marker + preview) and the project dashboard are static vanilla-TS pages served by
// the CLI's local servers.
export default defineConfig({
  root: 'client',
  base: './',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: { studio: resolve(__dirname, 'client/index.html'), hub: resolve(__dirname, 'client/hub.html') },
    },
  },
  logLevel: 'warn',
});
