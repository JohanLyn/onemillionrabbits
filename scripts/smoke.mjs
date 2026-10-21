// Headless smoke test: boots the built game, fast-forwards a run and fails on any page error.
//   npm run build && npm run smoke -- [--mobile] [--seconds 180] [--out shots] [--url file:///.../dist/index.html]
// In headless Chromium the game renders at only a few FPS, so it uses the game's
// window.__omr.advance() hook to simulate time instead of waiting in real time.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? def : process.argv[i + 1];
};
const mobile = process.argv.includes('--mobile');
const seconds = Number(arg('seconds', 180));
const out = arg('out', 'shots');
const url = arg('url', pathToFileURL(resolve('dist/index.html')).href);
mkdirSync(out, { recursive: true });

const exe = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext(
  mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 760 } }
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`);
});
await page.goto(url);
await page.waitForFunction(() => window.__omr && window.__omr.G.state === 'menu', null, { timeout: 30000 });
const tag = mobile ? 'mobile' : 'desktop';
await page.screenshot({ path: `${out}/${tag}-menu.png` });
// every menu opens and closes without errors
for (const [open, back] of [['#settingsBtn', '#settingsBack'], ['#trophyBtn', '#trophies [data-back]'], ['#shopBtn', '#shop [data-back]'], ['#creditsBtn', '#credits [data-back]']]) {
  await page.locator(open).click();
  await page.locator(back).click();
}
await page.evaluate(() => window.__omr.startRun());

const stats = () =>
  page.evaluate(() => {
    const G = window.__omr.G;
    return {
      state: G.state, wave: G.wave, t: Math.round(G.runTime), kills: G.kills, born: G.born,
      alive: window.__omr.E.length, level: G.player.level,
      weapons: G.weapons.map((w) => `${w.id}:${w.fused ? '*' : w.level}`).join(' '),
      passives: G.passives.map((p) => `${p.id}:${p.level}`).join(' '),
      mod: G.mod?.id || null,
    };
  });
const keys = ['d', 's', 'a', 'w'];
const chunk = 4;
for (let i = 0; i * chunk < seconds; i++) {
  if (!mobile) await page.keyboard.down(keys[i % 4]);
  await page.evaluate((c) => {
    const G = window.__omr.G;
    G.player.invuln = 1e9; // keep the bot alive so the whole run gets exercised
    if (G.ultCharge >= G.stats.ultCost) window.__omr.ult?.();
    window.__omr.advance(c);
  }, chunk);
  if (!mobile) await page.keyboard.up(keys[i % 4]);
  if (i % 10 === 9) console.log(JSON.stringify(await stats()));
}
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/${tag}-late.png` });
// pausing and resuming goes through the 3-2-1 countdown back to playing
const resumed = await page.evaluate(() => {
  const o = window.__omr;
  if (o.G.state !== 'playing') o.advance(0.1);
  document.getElementById('pauseBtn').click();
  const paused = o.G.state;
  document.getElementById('resumeBtn').click();
  const counting = o.G.state;
  o.advance(2.5);
  return [paused, counting, o.G.state].join('>');
});
if (!/^paused>countdown>(playing|levelup|wheel)$/.test(resumed)) errors.push(`pause/resume went ${resumed}`);
// end the run and make sure the game-over screen comes up
await page.evaluate(() => {
  const G = window.__omr.G;
  if (G.state !== 'playing') window.__omr.advance(0.1);
  G.player.invuln = 0;
  G.player.hurt(1e9);
  window.__omr.advance(3);
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/${tag}-gameover.png` });
const final = await stats();
console.log(JSON.stringify(final));
if (final.state !== 'gameover') errors.push(`expected gameover state, got ${final.state}`);
// a winning run: G.onVictory() is what the final boss calls
await page.locator('#retryBtn').click();
const won = await page.evaluate(() => {
  const o = window.__omr;
  o.G.player.invuln = 1e9;
  o.advance(1);
  o.win();
  o.advance(3);
  return { state: o.G.state, screen: !document.getElementById('victory').hidden, victories: o.save.victories };
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/${tag}-victory.png` });
console.log(JSON.stringify(won));
if (won.state !== 'victory' || !won.screen || won.victories !== 1) errors.push(`victory flow failed: ${JSON.stringify(won)}`);
await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} error(s):\n` + [...new Set(errors)].join('\n'));
  process.exit(1);
}
console.log('\nsmoke test passed');
