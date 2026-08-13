import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * GitHub Pages serves the site from a subpath (`/hyzerlines/`, and
 * `/hyzerlines/pr-12/` for previews), so asset URLs have to be built with that
 * prefix baked in. Locally it stays `/`.
 *
 * Set by the deploy workflow; a trailing slash is required or Vite emits paths
 * like `/hyzerlines-assets/…` and every asset 404s.
 */
const base = process.env['VITE_BASE'] ?? '/';

export default defineConfig({
  base,
  /*
   * `.env` lives at the workspace root, not beside this file.
   *
   * Vite's default is the project root — `apps/web` — which is the wrong place
   * in a monorepo whose commands are all run from the top. A key dropped in the
   * obvious spot next to `package.json` and `.gitignore` was silently ignored,
   * and the failure is invisible: the build succeeds, the app runs, and it
   * quietly serves the fallback basemaps as though no key had been offered.
   */
  envDir: '../../',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // MapLibre is ~800kB on its own. Splitting it lets the shell paint
          // and the search box become usable while the map engine streams in.
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
});
