// Screenshot tour: visits every menu and overlay at laptop and phone sizes, for eyeballing layout.
//   npm run build && node scripts/screens.mjs [--out shots/screens] [--only 390x844] [--url ...]
// Fails on page errors, like the smoke test.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? def : process.argv[i + 1];
};
const out = arg('out', 'shots/screens');
const only = arg('only', null);
const url = arg('url', pathToFileURL(resolve('dist/index.html')).href);
mkdirSync(out, { recursive: true });

const SIZES = [
  { name: '1280x760', viewport: { width: 1280, height: 760 } },
  { name: '390x844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: '844x390', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
  { name: '360x640', viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true },
].filter((s) => !only || s.name === only);

const exe = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errors = [];

for (const size of SIZES) {
  const { name, ...opts } = size;
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name} console.error: ${m.text()}`);
  });
  const shot = async (label) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${out}/${name}-${label}.png`, animations: 'disabled' });
  };
  const click = (sel) => page.locator(sel).click();
  const ev = (fn, a) => page.evaluate(fn, a);

  await page.goto(url);
  await page.waitForFunction(() => window.__omr && window.__omr.G.state === 'menu', null, { timeout: 30000 });
  await shot('01-menu');
  await click('#settingsBtn');
  await shot('02-settings');
  await page.locator('#settings .panel').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot('02b-settings-bottom');
  await click('#resetBtn');
  await shot('03-confirm-reset');
  await click('#cfNo');
  await click('#settingsBack');
  await click('#trophyBtn');
  await shot('04-trophies');
  await click('#trophies [data-back]');
  await click('#creditsBtn');
  await shot('05-credits');
  await click('#credits [data-back]');
  await click('#shopBtn');
  await shot('06-shop');
  await click('#shop [data-back]');

  // a run: first-run tips, level-up, wheel, pause, countdown
  await click('#playBtn');
  await ev(() => window.__omr.advance(0.5));
  await shot('07-run-tip');
  await ev(() => {
    const o = window.__omr;
    o.G.player.invuln = 1e9;
    o.levelUp();
    o.G.state = 'playing';
    o.advance(1 / 30); // opens the level-up screen
  });
  await shot('08-levelup');
  await ev(() => {
    const o = window.__omr;
    o.give('sabre', 5);
    o.give('blower', 5);
    o.advance(1);
    o.levelUp();
    o.G.ultCharge = 1e4;
    o.advance(1 / 30);
  });
  await shot('09-levelup-fusion');
  await ev(() => {
    const o = window.__omr;
    o.advance(0.2);
    o.G.waveTime = 39.9;
    // step until the wheel opens, without auto-skipping it
    for (let i = 0; i < 20 && o.G.state !== 'wheel'; i++) o.advance(1 / 30);
  });
  await shot('10-wheel');
  await ev(() => {
    const o = window.__omr;
    for (let i = 0; i < 400 && o.G.state !== 'playing'; i++) o.advance(1 / 30);
    o.G.wave = 4;
    o.G.waveTime = 39.9;
    o.advance(0.2);
    for (let i = 0; i < 400 && !o.G.boss; i++) o.advance(1 / 30);
    o.advance(0.5);
  });
  await shot('11-boss-tip');
  await ev(() => window.__omr.G.state === 'playing' && document.getElementById('pauseBtn').click());
  await shot('12-pause');
  await click('#quitBtn');
  await shot('13-confirm-quit');
  await click('#cfNo');
  await click('#resumeBtn');
  await shot('14-countdown');
  await ev(() => window.__omr.advance(3));
  await ev(() => {
    const o = window.__omr;
    o.G.player.invuln = 0;
    o.G.player.hurt(1e9);
    o.advance(3);
  });
  await shot('15-gameover');

  // a second run that wins, so records and the victory screen show up
  await click('#retryBtn');
  await ev(() => {
    const o = window.__omr;
    o.G.player.invuln = 1e9;
    o.advance(2);
    o.G.kills += 12000;
    o.G.wave = 30;
    o.win();
    o.advance(3);
  });
  await shot('16-victory');
  await click('#vMenu');
  await shot('17-menu-after');
  await ctx.close();
  console.log(`${name} done`);
}
await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} error(s):\n` + [...new Set(errors)].join('\n'));
  process.exit(1);
}
console.log(`screens written to ${out}/`);
