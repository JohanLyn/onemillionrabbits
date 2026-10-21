// Stamps the service worker with this build's hash, then copies the build to docs/
// (playable by double-clicking docs/index.html, and servable by GitHub Pages from /docs).
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync('dist/index.html', 'utf8');
const build = createHash('sha256').update(html).digest('hex').slice(0, 10);
if (existsSync('dist/sw.js')) {
  const sw = readFileSync('dist/sw.js', 'utf8').replace("const BUILD = 'dev';", `const BUILD = '${build}';`);
  writeFileSync('dist/sw.js', sw);
}
mkdirSync('docs', { recursive: true });
cpSync('dist', 'docs', { recursive: true });
writeFileSync('docs/.nojekyll', '');
console.log(`docs/ updated (index.html ${(html.length / 1024).toFixed(0)} KB, build ${build})`);
