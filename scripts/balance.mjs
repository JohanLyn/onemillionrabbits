// Balance harness: a bot plays real runs (no invulnerability) and reports how far each survivor gets.
//   npm run build && node scripts/balance.mjs [--runs 3] [--chars gardener,chef] [--shed none|mid|max]
//        [--mobile] [--workers 3] [--max-wave 31] [--json out.json] [--url file:///.../dist/index.html]
// The bot steers with synthetic WASD key events between short __omr.advance() steps: away from nearby
// rabbit mass, telegraphs and carrot projectiles, toward carrots (XP). Level-up cards are picked with a
// simple heuristic by pressing the 1-4 keys. Everything runs inside the page so headless frame rate
// doesn't matter.
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? def : process.argv[i + 1];
};
const ALL = ['gardener', 'chef', 'dj', 'monk', 'grandma'];
const runs = Number(arg('runs', 3));
const chars = arg('chars', ALL.join(',')).split(',');
const shed = arg('shed', 'none');
const mobile = process.argv.includes('--mobile');
const workers = Number(arg('workers', 3));
const maxWave = Number(arg('max-wave', 31));
const jsonOut = arg('json', null);
const url = arg('url', pathToFileURL(resolve('dist/index.html')).href);
const exe = '/opt/pw-browsers/chromium';

// permanent upgrades for the "strong save" profile (levels per Shed item)
const SHEDS = {
  none: {},
  mid: { hp: 3, dmg: 3, spd: 2, mag: 2, xp: 2, luck: 2, reroll: 1, ult: 1 },
  max: { hp: 5, dmg: 5, spd: 5, mag: 5, xp: 5, luck: 5, reroll: 3, ult: 3, revive: 1 },
};

const browser = await chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

// ---------------- the in-page bot ----------------
// Runs `seconds` of game time. Returns a status snapshot, or the final result when the run ended.
function botChunk({ seconds, maxWave }) {
  const O = window.__omr, G = O.G, E = O.E;
  const bot = (window.__bot ||= { keys: new Set(), lastX: 0, lastZ: 0, stuckT: 0, detour: 0, detourT: 0, fusedAt: {}, peak: 0 });
  const key = (k, down) => {
    if (down === bot.keys.has(k)) return;
    if (down) bot.keys.add(k);
    else bot.keys.delete(k);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k }));
  };
  const PREF = { spinach: 16, timer: 14, megaphone: 18, hat: 10, cake: 12, foil: 8, espresso: 6, magnet: 4, sock: 6, book: 3 };
  const NAME_PREF = { 'Suspicious Spinach': 16, 'Overclocked Egg Timer': 14, 'Megaphone of Excess': 18, 'Ridiculously Large Hat': 10, 'Carrot Cake': 12, 'Tin Foil Armor': 8, 'Triple Espresso': 6 };
  const nWeapons = () => G.weapons.length;

  function pickCard() {
    let scores = [];
    if (G.lastOptions && G.lastOptions.length) {
      scores = G.lastOptions.map((o) => {
        if (o.kind === 'fusion') return 1000;
        if (o.kind === 'wup') {
          const w = G.weapons.find((x) => x.id === o.id);
          return 50 + 6 * (w ? w.level : 0);
        }
        if (o.kind === 'wnew') return nWeapons() < 3 ? 70 : nWeapons() < 5 ? 35 : 12;
        if (o.kind === 'pup') return 34 + (PREF[o.id] || 0);
        if (o.kind === 'pnew') return 22 + (PREF[o.id] || 0);
        return 1;
      });
    } else {
      // fallback for builds without G.lastOptions: read the cards off the screen
      scores = [...document.querySelectorAll('#cards .card')].map((c) => {
        const lv = c.querySelector('.lv')?.textContent || '';
        const kind = c.querySelector('.kind')?.textContent || '';
        const nm = c.querySelector('.nm')?.textContent || '';
        if (lv === 'FUSION') return 1000;
        if (kind === 'weapon') return lv === 'NEW' ? (nWeapons() < 3 ? 70 : nWeapons() < 5 ? 35 : 12) : 50 + 6 * Number(lv.match(/\d+/)?.[0] || 0);
        if (kind === 'trinket') return (lv === 'NEW' ? 22 : 34) + (NAME_PREF[nm] || 0);
        return 1;
      });
    }
    let best = 0, bs = -Infinity;
    scores.forEach((s, i) => {
      const v = s + Math.random() * 14;
      if (v > bs) {
        bs = v;
        best = i;
      }
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: String(best + 1) }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: String(best + 1) }));
  }

  function steer() {
    const p = G.player;
    let vx = 0, vz = 0;
    // rabbits: inverse-square repulsion, heavier for big ones
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (!e.alive || e.under || e.held > G.time) continue;
      const dx = p.x - e.x, dz = p.z - e.z, d2 = dx * dx + dz * dz;
      if (d2 > 100) continue;
      const d = Math.sqrt(d2) || 0.01;
      const w = (e.dmg > 0 ? 1 : 0.1) * (0.6 + e.r) / (d2 + 0.3);
      vx += (dx / d) * w;
      vz += (dz / d) * w;
    }
    // burrowers about to pop up, boss and its slam target
    const avoid = (x, z, r, wt) => {
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d > r + 2.5) return;
      const k = wt * (r + 2.5 - d);
      vx += (dx / d) * k;
      vz += (dz / d) * k;
    };
    for (const e of E) if (e.alive && e.state === 'mound') avoid(e.x, e.z, 1.8, 1.2);
    const b = G.boss;
    if (b && b.alive) {
      avoid(b.x, b.z, b.r + 3, 1.5);
      if (b.tx !== undefined && (b.state === 'crouch' || b.state === 'air')) avoid(b.tx, b.tz, 5.5, 3);
    }
    for (const s of G.enemyShots || []) {
      if (s.lob) avoid(s.tx, s.tz, s.r, 2.5);
      else {
        const dx = p.x - s.x, dz = p.z - s.z, d2 = dx * dx + dz * dz;
        if (d2 < 30 && (s.vx * dx + s.vz * dz) > 0) {
          // sidestep perpendicular to the bullet's path
          const sp = Math.hypot(s.vx, s.vz) || 1, nx = -s.vz / sp, nz = s.vx / sp;
          const side = nx * dx + nz * dz >= 0 ? 1 : -1;
          vx += nx * side * 3 / (d2 + 1);
          vz += nz * side * 3 / (d2 + 1);
        }
      }
    }
    for (const h of G.hazards || []) avoid(h.x, h.z, h.r, 3);
    const danger = Math.hypot(vx, vz);
    // carrots, cake when hurt, chests always
    let best = null, bd = 1e9;
    for (const it of G.pickups || []) {
      if (it.dead) continue;
      const d2 = (it.x - p.x) ** 2 + (it.z - p.z) ** 2;
      const pri = it.kind === 'chest' || it.kind === 'gift' ? 0.2 : it.kind === 'cake' ? (p.hp < p.maxHp * 0.6 ? 0.3 : 3) : it.kind === 'gold' ? 0.6 : 1;
      if (d2 * pri < bd && d2 < 400) {
        bd = d2 * pri;
        best = it;
      }
    }
    if (best) {
      const dx = best.x - p.x, dz = best.z - p.z, d = Math.hypot(dx, dz) || 1;
      const k = danger < 0.5 ? 0.9 : 0.35;
      vx += (dx / d) * k;
      vz += (dz / d) * k;
    } else if (danger < 0.2) {
      // nothing nearby: drift toward the nearest rabbit so the weapons have work
      let ne = null, nd = 1e9;
      for (const e of E) {
        const d2 = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
        if (e.alive && d2 < nd) {
          nd = d2;
          ne = e;
        }
      }
      if (ne && nd > 36) {
        vx += (ne.x - p.x) / Math.sqrt(nd) * 0.4;
        vz += (ne.z - p.z) / Math.sqrt(nd) * 0.4;
      }
    }
    // stay away from the fence corners
    const lim = 80;
    if (Math.abs(p.x) > lim) vx -= Math.sign(p.x) * (Math.abs(p.x) - lim) * 0.08;
    if (Math.abs(p.z) > lim) vz -= Math.sign(p.z) * (Math.abs(p.z) - lim) * 0.08;
    // stuck on a tree: take a sideways detour for a moment
    const moved = Math.hypot(p.x - bot.lastX, p.z - bot.lastZ);
    bot.lastX = p.x;
    bot.lastZ = p.z;
    if (bot.keys.size && moved < 0.25) bot.stuckT += 0.25;
    else bot.stuckT = 0;
    if (bot.stuckT > 0.5) {
      bot.detour = Math.random() < 0.5 ? 1 : -1;
      bot.detourT = 0.75;
      bot.stuckT = 0;
    }
    if (bot.detourT > 0) {
      bot.detourT -= 0.25;
      const l = Math.hypot(vx, vz) || 1;
      const tx = (-vz / l) * bot.detour, tz = (vx / l) * bot.detour;
      vx = tx;
      vz = tz;
    }
    const l = Math.hypot(vx, vz);
    const go = l > 0.02;
    const nx = go ? vx / l : 0, nz = go ? vz / l : 0;
    key('d', go && nx > 0.38);
    key('a', go && nx < -0.38);
    key('s', go && nz > 0.38);
    key('w', go && nz < -0.38);
  }

  const step = 1 / 30;
  for (let t = 0; t < seconds; t += 0.25) {
    if (G.state === 'gameover' || G.wave > maxWave || G.victory) break;
    if (G.state === 'playing') {
      steer();
      if (G.ultCharge >= G.stats.ultCost) O.ult();
    }
    for (let s = 0; s < 0.25; s += step) {
      if (G.state === 'levelup') pickCard();
      if (G.state === 'levelup') break;
      O.advance(step);
      bot.peak = Math.max(bot.peak, E.length);
      for (const w of G.weapons) if (w.fused && bot.fusedAt[w.id] === undefined) bot.fusedAt[w.id] = Math.round(G.runTime);
      if (G.state === 'gameover' || G.victory) break;
    }
  }
  const done = G.state === 'gameover' || G.wave > maxWave || !!G.victory;
  return {
    done,
    state: G.state,
    victory: !!G.victory,
    wave: G.wave,
    t: Math.round(G.runTime),
    kills: G.kills,
    born: G.born,
    level: G.player.level,
    alive: E.length,
    peak: bot.peak,
    hp: Math.round(G.player.hp),
    weapons: G.weapons.map((w) => `${w.id}:${w.fused ? '*' : w.level}`).join(' '),
    passives: G.passives.map((p) => `${p.id}:${p.level}`).join(' '),
    fusedAt: bot.fusedAt,
    damageBy: Object.fromEntries(Object.entries(G.damageBy).map(([k, v]) => [k, Math.round(v)])),
  };
}

async function playRun(ctx, char) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__omr && window.__omr.G.state === 'menu', null, { timeout: 30000 });
  await page.evaluate(() => window.__omr.startRun());
  let r;
  for (;;) {
    r = await page.evaluate(botChunk, { seconds: 20, maxWave });
    if (r.done) break;
  }
  await page.close();
  r.char = char;
  r.errors = errors;
  return r;
}

async function makeContext(char) {
  const ctx = await browser.newContext(
    mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 760 } }
  );
  const save = { gold: 0, unlocked: ALL, char, upgrades: SHEDS[shed] || {}, muted: true, best: { kills: 0, wave: 0, time: 0 }, runs: 5 };
  await ctx.addInitScript(([s, mob]) => {
    localStorage.setItem('one-million-rabbits-v1', JSON.stringify(s));
    // this sandbox reports 4 cores, which the game treats as a low-power device; desktop balance wants the desktop cap
    if (!mob) Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  }, [save, mobile]);
  return ctx;
}

const jobs = [];
for (const c of chars) for (let i = 0; i < runs; i++) jobs.push(c);
const results = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const char = jobs[next++];
    const ctx = await makeContext(char);
    const t0 = Date.now();
    const r = await playRun(ctx, char);
    await ctx.close();
    results.push(r);
    const top = Object.entries(r.damageBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ':' + v).join(' ');
    console.log(`${char.padEnd(9)} wave ${String(r.wave).padStart(2)} ${String(r.t).padStart(4)}s kills ${String(r.kills).padStart(6)} lv ${r.level} peak ${r.peak}${r.victory ? ' VICTORY' : ''} | ${r.weapons} | ${r.passives} | top ${top} | fused ${JSON.stringify(r.fusedAt)} (${((Date.now() - t0) / 1000).toFixed(0)}s)${r.errors.length ? ' ERRORS ' + r.errors.join('; ') : ''}`);
  }
}
await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, worker));
await browser.close();

// ---------------- report ----------------
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
console.log(`\n=== ${shed} shed, ${mobile ? 'mobile' : 'desktop'}, ${runs} run(s) per survivor ===`);
console.log('survivor   waves (each run)          median wave  median time  victories');
for (const c of chars) {
  const rs = results.filter((r) => r.char === c);
  const waves = rs.map((r) => r.wave);
  console.log(`${c.padEnd(10)} ${waves.join(',').padEnd(25)} ${String(median(waves)).padStart(11)}  ${String(median(rs.map((r) => r.t))).padStart(10)}s  ${rs.filter((r) => r.victory).length}`);
}
const share = {};
let total = 0;
for (const r of results) {
  const t = Object.values(r.damageBy).reduce((a, b) => a + b, 0) || 1;
  for (const [k, v] of Object.entries(r.damageBy)) {
    share[k] = share[k] || { sum: 0, runs: 0, max: 0 };
    share[k].sum += v / t;
    share[k].runs++;
    share[k].max = Math.max(share[k].max, v / t);
  }
  total++;
}
console.log('\nweapon      avg share (all runs)  avg share (runs that had it)  max share  #runs');
for (const [k, s] of Object.entries(share).sort((a, b) => b[1].sum - a[1].sum)) {
  console.log(`${k.padEnd(11)} ${(100 * s.sum / total).toFixed(1).padStart(8)}%  ${(100 * s.sum / s.runs).toFixed(1).padStart(22)}%  ${(100 * s.max).toFixed(0).padStart(12)}%  ${String(s.runs).padStart(5)}`);
}
const fusions = {};
for (const r of results) for (const [k, t] of Object.entries(r.fusedAt)) (fusions[k] ||= []).push(t);
console.log('\nfusions: ' + (Object.entries(fusions).map(([k, ts]) => `${k} x${ts.length} (median ${median(ts)}s)`).join(', ') || 'none'));
const errs = results.flatMap((r) => r.errors);
if (errs.length) console.log('\npage errors:\n' + [...new Set(errs)].join('\n'));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));
