// Packs the production build into one self-contained HTML page for sharing
// as a hosted preview (no external scripts; fonts from Google Fonts).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist/assets';
const files = readdirSync(dist);
const js = readFileSync(join(dist, files.find((f) => f.endsWith('.js'))), 'utf8').replace(/<\/script/gi, '<\\/script');
// Inline the brand images so the single-file preview shows the real logo.
let jsInlined = js;
for (const f of ['wrts-wordmark.webp', 'wrts-primary-logo.webp']) {
  const uri = 'data:image/webp;base64,' + readFileSync(join('dist/assets/brand', f)).toString('base64');
  // Vite emits `${BASE}assets/brand/<file>`; swap the whole template for the data URI.
  const tpl = new RegExp(String.raw`\x60\$\{[A-Za-z_$][\w$]*\}assets/brand/` + f.replace('.', String.raw`\.`) + String.raw`\x60`, 'g');
  jsInlined = jsInlined.replace(tpl, JSON.stringify(uri)).split('./assets/brand/' + f).join(uri);
}
const css = readFileSync(join(dist, files.find((f) => f.endsWith('.css'))), 'utf8').replace(/<\/style/gi, '<\\/style');

const html = `<title>WRTS EventOS</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="From idea to impact. Build your community event in one guided system.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800;900&family=Figtree:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${jsInlined}</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/eventos.html', html);
console.log(`artifact/eventos.html ${(html.length / 1024).toFixed(0)} KB`);
