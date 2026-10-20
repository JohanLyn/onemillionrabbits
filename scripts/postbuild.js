// Copies the single-file build to docs/ (playable by double-clicking, and servable by GitHub Pages).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
mkdirSync('docs', { recursive: true });
writeFileSync('docs/index.html', html);
writeFileSync('docs/.nojekyll', '');
console.log(`docs/index.html written (${(html.length / 1024).toFixed(0)} KB)`);
