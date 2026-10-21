// Renders public/icons/icon.svg to the PNG sizes the web manifest and iOS ask for.
//   node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const exe = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: existsSync(exe) ? exe : undefined });
for (const size of [512, 192, 180]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `public/icons/icon-${size}.png`, omitBackground: false });
  await page.close();
  console.log(`public/icons/icon-${size}.png`);
}
await browser.close();
