import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Absolute base for the EventOS server (deep links such as /e/:slug need it).
// The standalone preview build sets EVENTOS_BASE=./ so it runs from any path.
export default defineConfig({
  plugins: [react()],
  base: process.env.EVENTOS_BASE || '/',
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
