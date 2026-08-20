import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * GitHub Pages serves the app from /<repo>/, and the repository is ChoresApp, so
 * the production base path is "/ChoresApp/". CI can override it with
 * VITE_BASE_PATH (Stage 17). Local dev and tests stay at "/".
 */
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? (process.env.VITE_BASE_PATH ?? '/ChoresApp/') : '/',
  plugins: [
    react(),
    VitePWA({
      // injectManifest, not generateSW: the worker is hand-written because it
      // carries the push and notification-click handlers from Stage 13, and a
      // generated one would have to be taught them anyway. The build's only job
      // here is to fill in the list of files to precache.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // The manifest in public/ is the approved one from Stage 2, with its
      // icons and its name. Nothing about installability needs regenerating.
      manifest: false,
      injectRegister: null,
      // Registration is done by the app, not by an injected snippet, so it can
      // wait for load and stay out of the way of first paint.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
      },
      devOptions: {
        // The worker has to exist in dev too: push is tested on localhost,
        // which is the only secure context available before the Stage 16
        // tunnel provides https.
        enabled: true,
        type: 'module',
      },
    }),
  ],
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
    // The screen tests review the design on mock data with no server, which is
    // exactly what the Pages preview build is. The tests that prove a real
    // build does NOT behave that way override this with vi.stubEnv.
    env: { VITE_PREVIEW_MODE: 'true' },
  },
}));
