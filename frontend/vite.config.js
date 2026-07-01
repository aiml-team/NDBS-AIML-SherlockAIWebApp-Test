import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const FLASK = 'http://localhost:5001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': FLASK,
      '/save-prospect': FLASK,
      '/upload': FLASK,
      '/generate': FLASK,
      '/preview': FLASK,
      '/download': FLASK,
      '/delete-file': FLASK,
      '/delete-prospect': FLASK,
    },
  },
  build: {
    outDir: '../static',
    emptyOutDir: true,
  },
});
