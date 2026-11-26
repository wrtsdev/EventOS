import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Absolute base for the EventOS server (deep links such as /e/:slug need it).
// The standalone preview build sets EVENTOS_BASE=./ so it runs from any path.
// Preload the fonts the first screen paints with, so text doesn't reflow when they arrive.
const PRELOAD_FONTS = [/big-shoulders-display-latin-(800|900)-normal-.*\.woff2$/, /figtree-latin-(400|700)-normal-.*\.woff2$/];
const preloadFonts = {
  name: 'eventos-preload-fonts',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (!ctx.bundle) return html;
      const base = process.env.EVENTOS_BASE || '/';
      return Object.keys(ctx.bundle)
        .filter((f) => PRELOAD_FONTS.some((re) => re.test(f)))
        .map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: base + f, crossorigin: '' }, injectTo: 'head' }));
    },
  },
};

export default defineConfig({
  plugins: [react(), preloadFonts],
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
