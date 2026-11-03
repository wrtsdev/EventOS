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
    // Browsers from late 2022 on (Vite 7's default). esbuild 0.28 can't build for Vite 6's older default.
    target: ['es2022', 'chrome107', 'edge107', 'firefox104', 'safari16'],
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
