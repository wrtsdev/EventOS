// Packs the production build into one self-contained HTML page for sharing
// as a hosted preview (no external scripts; fonts from Google Fonts).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist/assets';
const files = readdirSync(dist);
const js = readFileSync(join(dist, files.find((f) => f.endsWith('.js'))), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(dist, files.find((f) => f.endsWith('.css'))), 'utf8').replace(/<\/style/gi, '<\\/style');

const html = `<title>WRTS EventOS</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="From idea to impact. Build your community event in one guided system.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800;900&family=Figtree:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/eventos.html', html);
console.log(`artifact/eventos.html ${(html.length / 1024).toFixed(0)} KB`);
