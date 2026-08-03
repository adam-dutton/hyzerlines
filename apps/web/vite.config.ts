import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
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
