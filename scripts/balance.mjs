// Balance harness: a bot plays real runs (no invulnerability) and reports how far each survivor gets.
//   npm run build && node scripts/balance.mjs [--runs 3] [--chars gardener,chef] [--shed none|mid|max]
//        [--mobile] [--workers 3] [--max-wave 31] [--json out.json] [--url file:///.../dist/index.html]
// The bot steers with synthetic WASD key events between short __omr.advance() steps: every 0.25s it
// tries 16 directions and keeps the one that stays furthest from rabbits, telegraphs and carrot darts,
// with a gentle pull toward carrots (XP). Level-up cards are picked with a
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
  const bot = (window.__bot ||= { keys: new Set(), lastX: 0, lastZ: 0, stuckT: 0, detour: 0, detourT: 0, px: 0, pz: 0, fusedAt: {}, peak: 0 });
  const key = (k, down) => {
    if (down === bot.keys.has(k)) return;
    if (down) bot.keys.add(k);
    else bot.keys.delete(k);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k }));
  };
  // record what hurts us, by source, so balance reports can say what kills runs
  if (!bot.hurtHooked) {
    bot.hurtHooked = true;
    bot.taken = {};
    bot.recent = [];
    const p = G.player, orig = p.hurt.bind(p);
    p.hurt = (dmg, big) => {
      const before = p.hp;
      orig(dmg, big);
      const lost = before - p.hp;
      if (lost <= 0) return;
      let cause = 'other', bd = 9;
      const b = G.boss;
      if (b && b.alive && Math.hypot(b.x - p.x, b.z - p.z) < b.r + 6) cause = 'boss:' + b.kind;
      else {
        for (const s of G.enemyShots || []) {
          const d = Math.hypot((s.lob ? s.tx : s.x) - p.x, (s.lob ? s.tz : s.z) - p.z);
          if (d < 2.2 && d < bd) {
            bd = d;
            cause = s.lob ? 'lob' : 'dart';
          }
        }
        if (cause === 'other') {
          for (const e of E) {
            if (!e.alive) continue;
            const d = Math.hypot(e.x - p.x, e.z - p.z) - e.r;
            if (d < bd) {
              bd = d;
              cause = (e.elite ? 'elite-' : '') + e.type;
            }
          }
        }
      }
      bot.taken[cause] = (bot.taken[cause] || 0) + lost;
      bot.recent.push([G.runTime, cause, lost]);
      while (bot.recent.length && bot.recent[0][0] < G.runTime - 12) bot.recent.shift();
    };
  }
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

  // Try 16 directions; score where each one puts us in ~0.4s and ~0.9s, keep the safest.
  const DIRS = 16;
  function steer() {
    const p = G.player;
    const sp = 6.2 * G.stats.speed;
    const near = [];
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (!e.alive || e.under || e.held > G.time || e.dmg <= 0) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      if (dx * dx + dz * dz < 144) near.push(e);
    }
    const b = G.boss && G.boss.alive ? G.boss : null;
    const zones = [];
    for (const e of E) if (e.alive && (e.state === 'mound' || e.state === 'under') && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 100) zones.push([e.state === 'under' ? e.tx : e.x, e.state === 'under' ? e.tz : e.z, 2.3]);
    if (b && (b.state === 'crouch' || b.state === 'air')) zones.push([b.tx, b.tz, 5.8]);
    if (b && (b.state === 'chargeaim' || b.state === 'charge')) for (let i = 0; i <= 8; i++) zones.push([b.x + b.dirx * i * 2.4, b.z + b.dirz * i * 2.4, b.r + 1]);
    for (const s of G.enemyShots || []) if (s.lob) zones.push([s.tx, s.tz, s.r + 0.6]);
    // where we'd like to go: nearest valuable pickup, else toward rabbits from a distance
    let gx = 0, gz = 0, goal = null, bd = 1e9;
    for (const it of G.pickups || []) {
      if (it.dead) continue;
      if (it.kind === 'cake' && p.hp > p.maxHp * 0.7) continue;
      const d2 = (it.x - p.x) ** 2 + (it.z - p.z) ** 2;
      const pri = it.kind === 'chest' || it.kind === 'gift' ? 0.15 : it.kind === 'cake' ? 0.3 : it.kind === 'gold' ? 0.6 : 1;
      if (d2 * pri < bd && d2 < 625) {
        bd = d2 * pri;
        goal = it;
      }
    }
    if (goal) {
      const d = Math.hypot(goal.x - p.x, goal.z - p.z) || 1;
      gx = (goal.x - p.x) / d;
      gz = (goal.z - p.z) / d;
    }
    const crowded = near.some((e) => (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 12);
    let best = -1, bs = Infinity;
    for (let k = 0; k <= DIRS; k++) {
      // k === DIRS means standing still
      const a = (k / DIRS) * Math.PI * 2;
      const dx = k === DIRS ? 0 : Math.cos(a), dz = k === DIRS ? 0 : Math.sin(a);
      let score = 0;
      for (const [tt, wt] of [[0.35, 1], [0.9, 0.5]]) {
        const x = p.x + dx * sp * tt, z = p.z + dz * sp * tt;
        for (const e of near) {
          // rabbits close in on us meanwhile
          const ex = e.x + (p.x - e.x) * Math.min(1, (e.speed * tt) / (Math.hypot(p.x - e.x, p.z - e.z) + 0.01)) * 0.7;
          const ez = e.z + (p.z - e.z) * Math.min(1, (e.speed * tt) / (Math.hypot(p.x - e.x, p.z - e.z) + 0.01)) * 0.7;
          const d2 = (x - ex) ** 2 + (z - ez) ** 2;
          const rr = e.r + p.r + 0.3;
          // only rabbits that could plausibly reach us matter
          score += wt * (e.dmg + 4) * Math.max(0, 1 / (Math.max(0.05, d2 - rr * rr * 0.5) + 0.4) - 0.05);
        }
        if (b) {
          const d2 = (x - b.x) ** 2 + (z - b.z) ** 2, rr = b.r + 1.5;
          score += (wt * 400) / (Math.max(0.05, d2 - rr * rr) + 1);
        }
        for (const [zx, zz, zr] of zones) if ((x - zx) ** 2 + (z - zz) ** 2 < zr * zr) score += wt * 400;
        for (const s of G.enemyShots || []) {
          if (s.lob) continue;
          const sx = s.x + s.vx * tt, sz = s.z + s.vz * tt;
          const d2 = (x - sx) ** 2 + (z - sz) ** 2;
          if (d2 < 2.5) score += (wt * 150) / (d2 + 0.3);
        }
        if (Math.abs(x) > 98 || Math.abs(z) > 98) score += wt * 300;
      }
      score -= (crowded ? 3 : 10) * (dx * gx + dz * gz); // a pull toward the goal, weaker when rabbits are close
      score -= 2 * (dx * bot.px + dz * bot.pz); // and a little momentum against jitter
      if (Math.abs(p.x) > 75) score += dx * Math.sign(p.x) * 3;
      if (Math.abs(p.z) > 75) score += dz * Math.sign(p.z) * 3;
      if (score < bs) {
        bs = score;
        best = k;
      }
    }
    let nx = 0, nz = 0;
    if (best < DIRS) {
      const a = (best / DIRS) * Math.PI * 2;
      nx = Math.cos(a);
      nz = Math.sin(a);
    }
    // stuck on a tree: take a sideways detour for a moment
    const moved = Math.hypot(p.x - bot.lastX, p.z - bot.lastZ);
    bot.lastX = p.x;
    bot.lastZ = p.z;
    if (bot.keys.size && moved < 0.3) bot.stuckT += 0.25;
    else bot.stuckT = 0;
    if (bot.stuckT > 0.5) {
      bot.detour = Math.random() < 0.5 ? 1 : -1;
      bot.detourT = 0.75;
      bot.stuckT = 0;
    }
    if (bot.detourT > 0 && (nx || nz)) {
      bot.detourT -= 0.25;
      const tx = -nz * bot.detour, tz = nx * bot.detour;
      nx = tx;
      nz = tz;
    }
    bot.px = nx;
    bot.pz = nz;
    key('d', nx > 0.38);
    key('a', nx < -0.38);
    key('s', nz > 0.38);
    key('w', nz < -0.38);
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
    taken: Object.fromEntries(Object.entries(bot.taken).map(([k, v]) => [k, Math.round(v)])),
    killer: Object.entries(bot.recent.reduce((m, [, c, v]) => ((m[c] = (m[c] || 0) + v), m), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${Math.round(v)}`).join(' '),
    bosses: (G.bossLog || []).map((x) => `${x.wave}:${x.kind}:${x.t}s`).join(' '),
    damageBy: Object.fromEntries(Object.entries(G.damageBy).map(([k, v]) => [k, Math.round(v)])),
  };
}

async function playRun(ctx, char) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => window.__omr && window.__omr.G.state === 'menu', null, { timeout: 120000 });
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
const crashes = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const char = jobs[next++];
    const t0 = Date.now();
    let r = null;
    for (let attempt = 0; attempt < 3 && !r; attempt++) {
      const ctx = await makeContext(char);
      try {
        r = await playRun(ctx, char);
      } catch (err) {
        const msg = err.message.split('\n')[0];
        // only a slow page load is worth a retry; anything else is a real bug and gets reported
        if (!/Timeout/.test(msg)) {
          console.log(`${char}: RUN CRASHED: ${msg}`);
          crashes.push(`${char}: ${msg}`);
          attempt = 3;
        } else console.log(`(${char}: retrying after ${msg})`);
      }
      await ctx.close();
    }
    if (!r) continue;
    results.push(r);
    const top = Object.entries(r.damageBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ':' + v).join(' ');
    console.log(`${char.padEnd(9)} wave ${String(r.wave).padStart(2)} ${String(r.t).padStart(4)}s kills ${String(r.kills).padStart(6)} lv ${r.level} peak ${r.peak}${r.victory ? ' VICTORY' : ''} | ${r.weapons} | ${r.passives} | top ${top} | fused ${JSON.stringify(r.fusedAt)} | bosses ${r.bosses || '-'} | last 12s hurt by ${r.killer || '-'} (${((Date.now() - t0) / 1000).toFixed(0)}s)${r.errors.length ? ' ERRORS ' + r.errors.join('; ') : ''}`);
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
const taken = {};
for (const r of results) if (!r.victory) for (const k of (r.killer || '').split(' ').filter(Boolean)) {
  const [c, v] = k.split(':').length === 3 ? [k.split(':').slice(0, 2).join(':'), k.split(':')[2]] : k.split(':');
  taken[c] = (taken[c] || 0) + Number(v);
}
console.log('\nwhat hurt runs in their last 12s: ' + Object.entries(taken).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
const errs = results.flatMap((r) => r.errors).concat(crashes);
if (errs.length) console.log('\npage errors:\n' + [...new Set(errs)].join('\n'));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));
if (errs.length) process.exitCode = 1;
