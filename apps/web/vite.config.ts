import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@bbcm/schema': path.resolve(here, '../../packages/schema/src/index.ts'),
      // Import the marker module directly rather than the package index, so the
      // browser bundle never pulls in the `docx` dependency used for Word export.
      '@bbcm/documents/markers': path.resolve(here, '../../packages/documents/src/markers.ts'),
      '@': path.resolve(here, 'src'),
    },
  },
  server: {
    port: 5173,
    // The API runs under `wrangler dev` on 8787; same-origin in production.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
});
