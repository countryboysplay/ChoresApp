import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages serves the app from /<repo>/, and the repository is ChoresApp, so
 * the production base path is "/ChoresApp/". CI can override it with
 * VITE_BASE_PATH (Stage 17). Local dev and tests stay at "/".
 */
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? (process.env.VITE_BASE_PATH ?? '/ChoresApp/') : '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Listen on the LAN so a phone on the same network can open the dev server.
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
}));
