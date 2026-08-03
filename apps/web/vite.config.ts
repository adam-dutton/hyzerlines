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
