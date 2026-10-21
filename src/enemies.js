import * as THREE from 'three';
import { G, WORLD, dummy, rand, pick, clamp, fmt } from './core.js';
import { Inst, vtoon, outlined } from './toon.js';
import { rabbitGeo, hatGeo } from './models.js';
import { archerGeo, burrowerGeo, moundGeo, eggGeo, auraGeo, dartGeo, dizzyGeo, spinnerBossGeo, broodBossGeo, queenGeo } from './models-extra.js';
import { pushOut, blocked } from './world.js';
import { poof, burst, explosion, floater, heart, telegraph, ring, banner, particle, sparkle, dust } from './fx.js';
import { sfx, music } from './audio.js';
import { dropXp, dropPickup } from './pickups.js';

// ---------- rabbit roster ----------
// shot: damage of a ranged attack; geo: model builder for rabbits that aren't in models.js
export const TYPES = {
  bunny: { hp: 10, speed: 3.0, dmg: 8, xp: 1, scale: 1, fur: 0xf4efe9 },
  hare: { hp: 8, speed: 5.0, dmg: 6, xp: 1, scale: 0.9, fur: 0xc98c55 },
  chonk: { hp: 75, speed: 1.9, dmg: 16, xp: 6, scale: 1.8, fur: 0xa3a3b8 },
  jackalope: { hp: 34, speed: 3.3, dmg: 12, xp: 3, scale: 1.1, fur: 0x8a5a3a },
  bomb: { hp: 14, speed: 4.3, dmg: 22, xp: 2, scale: 1, fur: 0x5b5566 },
  golden: { hp: 30, speed: 5.6, dmg: 0, xp: 25, scale: 1, fur: 0xffcc33 },
  archer: { hp: 20, speed: 2.7, dmg: 6, shot: 12, xp: 3, scale: 1, fur: 0xd9b77e, geo: archerGeo },
  burrower: { hp: 28, speed: 3.1, dmg: 8, shot: 15, xp: 3, scale: 1, fur: 0x8c6f56, geo: burrowerGeo },
  egg: { hp: 40, speed: 0, dmg: 0, xp: 1, scale: 1.1, fur: 0xfff1f8, geo: eggGeo },
};
const KINDS = Object.keys(TYPES);
export const E = []; // live enemies (dead ones are compacted out each frame)
const free = [];
let nextId = 1;
let inst = {}, hats, shadows, mounds, auras, dizzy, darts;
const flashCol = new THREE.Color(3, 3, 3);
const redCol = new THREE.Color(2.6, 0.6, 0.6);
const goldCol = new THREE.Color(1.3, 1.2, 0.9);
const eliteCol = new THREE.Color();
const WHITE1 = new THREE.Color(1, 1, 1);
export const FINAL_WAVE = 30;

export const LOVE_TIME = 3.2;

export function maxEnemies() {
  return G.lowPower ? 420 : 850;
}

// ---------- spatial hash ----------
const CS = 2.5, OFF = WORLD + 14, GN = Math.ceil((OFF * 2) / CS);
const head = new Int32Array(GN * GN);
let next = new Int32Array(2048);
const cellOf = (v) => clamp(Math.floor((v + OFF) / CS), 0, GN - 1);
function rebuildGrid() {
  head.fill(-1);
  if (next.length < E.length) next = new Int32Array(E.length * 2);
  for (let i = 0; i < E.length; i++) {
    const c = cellOf(E[i].x) + cellOf(E[i].z) * GN;
    next[i] = head[c];
    head[c] = i;
  }
}
let gridN = 0;

// Calls cb(e) for every living, hittable enemy (boss included) touching the circle.
// Burrowers underground can't be hit.
export function queryCircle(x, z, r, cb) {
  const ext = r + 1.6;
  const x0 = cellOf(x - ext), x1 = cellOf(x + ext), z0 = cellOf(z - ext), z1 = cellOf(z + ext);
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      for (let i = head[cx + cz * GN]; i !== -1; i = next[i]) {
        if (i >= gridN) continue;
        const e = E[i];
        if (!e.alive || e.under) continue;
        const dx = e.x - x, dz = e.z - z, rr = r + e.r;
        if (dx * dx + dz * dz < rr * rr) cb(e);
      }
    }
  }
  const b = G.boss;
  if (b && b.alive) {
    const dx = b.x - x, dz = b.z - z, rr = r + b.r;
    if (dx * dx + dz * dz < rr * rr) cb(b);
  }
}

export function nearest(x, z, maxR = 14, exclude = null) {
  let best = null, bd = Infinity;
  queryCircle(x, z, maxR, (e) => {
    if (exclude && exclude.has(e.id)) return;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = e;
    }
  });
  return best;
}

const tmpList = [];
export function randomNear(x, z, maxR = 12) {
  tmpList.length = 0;
  queryCircle(x, z, maxR, (e) => tmpList.push(e));
  return tmpList.length ? pick(tmpList) : null;
}

// Nearest rabbit that can be grabbed (lassos): no bosses, no rabbits already held.
export function nearestGrabbable(x, z, maxR) {
  let best = null, bd = Infinity;
  queryCircle(x, z, maxR, (e) => {
    if (e.isBoss || e.held > G.time || e.type === 'golden') return;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = e;
    }
  });
  return best;
}

// ---------- setup ----------
export function initEnemies() {
  const cap = maxEnemies() + 60;
  for (const k of KINDS) {
    const T = TYPES[k];
    inst[k] = new Inst(T.geo ? T.geo() : rabbitGeo(k), k === 'golden' ? 12 : k === 'egg' ? 60 : cap, { mat: vtoon(), outline: 0.045, colors: true });
  }
  hats = new Inst(hatGeo(), cap, { mat: vtoon(), outline: 0.035 });
  mounds = new Inst(moundGeo(), 80, { mat: vtoon(), outline: 0.04 });
  dizzy = new Inst(dizzyGeo(), 300, { mat: vtoon({ emissive: 0x554400 }), outline: 0.02 });
  darts = new Inst(dartGeo(), 500, { mat: vtoon({ emissive: 0x803000 }), outline: 0.03 });
  auras = new Inst(auraGeo(), 40, {
    mat: new THREE.MeshBasicMaterial({ color: 0xff5ce1, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    outline: 0,
  });
  auras.mesh.renderOrder = 2;
  const sh = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
  shadows = new Inst(sh, cap + 120, {
    mat: new THREE.MeshBasicMaterial({ color: 0x1f3a14, transparent: true, opacity: 0.28, depthWrite: false }),
    outline: 0,
  });
  shadows.mesh.renderOrder = 1;
  G.enemyShots = shots; // read-only view for the balance bot
  G.finalWave = FINAL_WAVE;
  G.dev = { spawnEnemy, spawnBoss }; // for scripted screenshots and balance tests
}

export function clearEnemies() {
  for (const e of E) {
    e.alive = false;
    free.push(e);
  }
  E.length = 0;
  gridN = 0;
  shots.length = 0;
  if (G.boss) {
    G.scene.remove(G.boss.mesh);
    G.boss = null;
  }
  bossQueue = 0;
  bossSeen = {};
  G.seenElite = false;
  eliteAcc = 0;
  spawnAcc = 0;
  ultBudget = 0;
  volley = 0;
  G.victory = false;
  G.bossLog = [];
}

export function difficulty() {
  const w = G.wave - 1;
  // the back half of the run ramps on top of the curve, so a snowballing build still has to sweat
  const late = Math.max(0, w - 14);
  return {
    hp: (1 + w * 0.3 + w * w * 0.088) * (1 + late * late * 0.012),
    // the first waves bite gently while you find your feet; it gets mean after that
    dmg: (w < 3 ? 0.75 + w * 0.08 : 1) + w * 0.165 + late * 0.12,
    speed: 1 + Math.min(0.42, w * 0.02),
  };
}

export function spawnEnemy(type, x, z, opts = {}) {
  // forced spawns (horde rings, boss summons) may overshoot the cap a little, never past what we can draw
  if (E.length >= maxEnemies() + (opts.force ? 55 : 0)) return null;
  if (type === 'egg' && eggCount() >= 50) return null;
  const T = TYPES[type];
  const d = G.state === 'menu' ? { hp: 1, dmg: 0, speed: 1 } : difficulty();
  const e = free.pop() || {};
  const giant = G.mod?.id === 'giant' ? 1.55 : 1;
  const baby = !!opts.baby;
  const elite = !!opts.elite;
  // phones get a smaller crowd, so each rabbit there is a bit beefier (and worth a bit more)
  const dense = G.lowPower && G.state !== 'menu' ? 1.3 : 1;
  e.id = nextId++;
  e.type = type;
  e.T = T;
  e.x = x;
  e.z = z;
  e.y = 0;
  e.vy = 0;
  e.kx = e.kz = 0;
  e.maxHp = T.hp * d.hp * (giant > 1 ? 2 : 1) * (elite ? 12 : 1) * dense;
  e.hp = baby ? e.maxHp * 0.3 : e.maxHp;
  e.speed = T.speed * d.speed * rand(0.9, 1.1) * (elite ? 0.9 : 1);
  e.dmg = T.dmg * d.dmg * (elite ? 1.5 : 1);
  e.shot = (T.shot || 0) * d.dmg;
  e.xp = T.xp * (giant > 1 ? 2 : 1) * (elite ? 10 : 1) * dense;
  e.size = T.scale * giant * (elite ? 1.4 : 1);
  e.grow = baby ? 14 : 0;
  e.scale = baby ? e.size * 0.5 : e.size;
  e.r = 0.42 * e.scale;
  e.phase = rand(0, 6);
  e.flash = 0;
  e.alive = true;
  e.air = false;
  e.spin = 0;
  e.rotY = 0;
  e.love = 0;
  e.loveCd = rand(2, 5);
  e.state = 'walk';
  e.stateT = type === 'egg' ? opts.hatch || 5 : rand(1, 3);
  e.dirx = 0;
  e.dirz = 0;
  e.tx = 0;
  e.tz = 0;
  e.hits = {};
  e.life = type === 'golden' ? 16 : 0;
  e.wander = rand(0, 6.28);
  e.lockT = opts.lockT || 0;
  e.lockx = opts.lockx || 0;
  e.lockz = opts.lockz || 0;
  e.slipped = 0;
  e.elite = elite;
  e.under = false;
  e.held = 0;
  e.confused = 0;
  e.slT = 0;
  e.slx = e.slz = 0;
  E.push(e);
  return e;
}

function eggCount() {
  let n = 0;
  for (const e of E) if (e.alive && e.type === 'egg') n++;
  return n;
}

// Pick a spawn spot just beyond the edge of the screen.
export function spawnPoint(dist = G.viewR + 3, angle = rand(0, Math.PI * 2)) {
  const p = G.player;
  for (let i = 0; i < 8; i++) {
    const a = angle + i * 0.8;
    const x = p.x + Math.cos(a) * dist, z = p.z + Math.sin(a) * dist;
    if (Math.abs(x) < WORLD - 1 && Math.abs(z) < WORLD - 1 && !blocked(x, z, 0.6)) return [x, z];
  }
  return [clamp(p.x + rand(-dist, dist), -WORLD + 2, WORLD - 2), clamp(p.z + rand(-dist, dist), -WORLD + 2, WORLD - 2)];
}

// ---------- the wave director ----------
let spawnAcc = 0, goldenAcc = 0, eliteAcc = 0, ultBudget = 0, volley = 0;
function chooseType() {
  const w = G.wave;
  const weights = [['bunny', 10]];
  if (w >= 2) weights.push(['hare', 3 + w * 0.35]);
  if (w >= 3) weights.push(['chonk', 1 + w * 0.25]);
  if (w >= 4) weights.push(['archer', 0.7 + w * 0.05]);
  if (w >= 5) weights.push(['jackalope', 1 + w * 0.22]);
  if (w >= 7) weights.push(['bomb', 1.2 + w * 0.16]);
  if (w >= 8) weights.push(['burrower', 0.8 + w * 0.08]);
  let total = 0;
  for (const [, wt] of weights) total += wt;
  let r = Math.random() * total;
  for (const [k, wt] of weights) if ((r -= wt) <= 0) return k;
  return 'bunny';
}

// The horde target size: grows with the wave, swells through each wave and peaks at the finale.
function hordeTarget() {
  const w = G.wave;
  const slowMo = G.mod?.id === 'slowmo';
  // the very first wave ramps up so you get a few seconds to find your feet
  const ramp = w === 1 ? 0.4 + 0.6 * Math.min(1, G.waveTime / 35) : 1;
  let t = (16 + w * 24 + G.waveTime * (0.9 + w * 0.16)) * (slowMo ? 2 : 1) * ramp;
  // boss fights thin the crowd so the boss can be read
  if (G.boss) t *= G.boss.kind === 'queen' ? 0.55 : 0.75;
  return Math.min(maxEnemies(), t);
}

export function director(dt) {
  const w = G.wave;
  ultBudget = Math.min(ultBudget + (dt * G.stats.ultCost) / 40, G.stats.ultCost);
  // archers share a fire budget so a big crowd of them stays a hazard, not a bullet hell
  volley = Math.min(volley + dt * Math.min(1.3, 0.6 + w * 0.025), 2);
  const raid = G.mod?.id === 'slowmo' ? 2 : 1;
  const target = hordeTarget();
  const rate = Math.min(40, 4 + w * 2) * raid * (E.length < target ? 1 : 0.15);
  spawnAcc += rate * dt;
  while (spawnAcc >= 1) {
    spawnAcc -= 1;
    const [x, z] = spawnPoint();
    // spawn in little clumps, it reads as a horde
    const t = chooseType();
    const n = t === 'chonk' || t === 'archer' || t === 'burrower' ? 1 : Math.random() < 0.3 ? 3 : 1;
    for (let i = 0; i < n; i++) spawnEnemy(t, x + rand(-1.5, 1.5), z + rand(-1.5, 1.5));
  }
  // elite rabbits: rare, glowing, tanky, and worth a present
  if (w >= 6) {
    eliteAcc += dt;
    const every = Math.max(8, 28 - w * 0.8);
    if (eliteAcc > every) {
      eliteAcc = rand(-3, 3);
      let t = chooseType();
      if (t === 'bomb') t = 'chonk';
      const [x, z] = spawnPoint();
      const e = spawnEnemy(t, x, z, { elite: true, force: true });
      if (e && !G.seenElite) {
        G.seenElite = true;
        banner('AN ELITE RABBIT!', 'it glows. it hits hard. it drops a present');
      }
    }
  }
  goldenAcc += dt;
  if (goldenAcc > 1) {
    goldenAcc = 0;
    if (Math.random() < 0.012 * G.stats.luck * (w >= 2 ? 1 : 0)) {
      const [x, z] = spawnPoint(G.viewR - 4);
      spawnEnemy('golden', x, z, { force: true });
      banner('A GOLDEN BUNNY!', 'catch it before it escapes');
      sfx('gold');
    }
  }
}

// Horde events: surround the player, or stampede across the screen.
export function hordeEvent() {
  const w = G.wave;
  const p = G.player;
  if (Math.random() < 0.55) {
    const n = Math.min(40 + w * 6, 140);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = p.x + Math.cos(a) * (G.viewR + 1), z = p.z + Math.sin(a) * (G.viewR + 1);
      if (Math.abs(x) < WORLD && Math.abs(z) < WORLD) spawnEnemy(w >= 6 && i % 5 === 0 ? 'chonk' : 'bunny', x, z, { force: true });
    }
    banner('THEY SURROUNDED YOU', 'a ring of rabbits closes in');
  } else {
    const a = rand(0, Math.PI * 2);
    const dx = Math.cos(a), dz = Math.sin(a);
    const n = Math.min(30 + w * 5, 110);
    for (let i = 0; i < n; i++) {
      const side = rand(-G.viewR, G.viewR);
      const back = rand(0, 8);
      const x = p.x - dx * (G.viewR + 2 + back) - dz * side, z = p.z - dz * (G.viewR + 2 + back) + dx * side;
      if (Math.abs(x) < WORLD && Math.abs(z) < WORLD) spawnEnemy('hare', x, z, { force: true, lockT: 5, lockx: dx, lockz: dz });
    }
    banner('HARE STAMPEDE!', 'get out of the way');
  }
  sfx('boss');
}

// ---------- damage & death ----------
export function damage(e, amount, src, kx = 0, kz = 0, opts = {}) {
  if (!e.alive) return 0;
  let amt = amount * G.stats.damage;
  if (G.mod?.id === 'glass') amt *= 2;
  if (G.mod?.id === 'disco') amt *= 1.3;
  if (e.confused > G.time) amt *= 1.2; // dizzy rabbits forget to dodge
  const crit = Math.random() < G.stats.crit;
  if (crit) amt *= 2;
  // only count damage that landed, so overkill doesn't inflate the end-of-run stats
  G.damageBy[src] = (G.damageBy[src] || 0) + Math.min(amt, Math.max(0, e.hp));
  e.hp -= amt;
  e.flash = 0.09;
  const knockMul = (G.mod?.id === 'moon' ? 2.2 : 1) / (e.isBoss ? 12 : Math.max(1, e.scale * e.scale * 0.8));
  if (e.type !== 'egg') {
    e.kx += kx * knockMul;
    e.kz += kz * knockMul;
  }
  if (opts.launch && !e.isBoss && e.type !== 'egg') launch(e, opts.launch);
  if ((crit && amt >= 15) || amt >= 40 || Math.random() < 0.05) floater(Math.round(amt) + (crit ? '!' : ''), e.x, 1.6 * e.scale + 0.5, e.z, crit ? 'crit' : '');
  if (e.hp <= 0) kill(e);
  return amt;
}

export function launch(e, vy) {
  if (e.isBoss) return;
  e.air = true;
  e.vy = Math.max(e.vy, vy * (G.mod?.id === 'moon' ? 1.6 : 1));
  e.y = Math.max(e.y, 0.01);
}

function kill(e) {
  if (e.isBoss) return killBoss(e);
  e.alive = false;
  G.kills++;
  G.remaining--;
  // kills charge the strike, but no faster than once every ~40s even when the horde melts
  const gain = Math.min(ultBudget, e.elite ? 10 : 1);
  ultBudget -= gain;
  G.ultCharge = Math.min(G.stats.ultCost, G.ultCharge + gain);
  poof(e.x, e.z, e.scale, e.T.fur);
  sfx('pop');
  let xp = e.xp * (G.mod?.id === 'hats' ? 2 : 1);
  if (e.grow > 0) xp = 1;
  dropXp(e.x, e.z, xp);
  const roll = Math.random() / G.stats.luck;
  if (roll < 0.004) dropPickup('cake', e.x, e.z);
  else if (roll < 0.0055) dropPickup('magnet', e.x, e.z);
  if (e.type === 'golden') {
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) dropPickup('gold', e.x + rand(-1.5, 1.5), e.z + rand(-1.5, 1.5));
    burst(e.x, 1, e.z, 20, [0xffc83d, 0xffffff], 7, 0.35, 0.8, 8);
  }
  if (e.elite) {
    dropPickup('gift', e.x, e.z);
    dropPickup('gold', e.x + rand(-1, 1), e.z + rand(-1, 1));
    if (Math.random() < 0.5) dropPickup('cake', e.x + rand(-1, 1), e.z + rand(-1, 1));
    burst(e.x, 1, e.z, 24, [0xff5ce1, 0xc77dff, 0xffffff], 8, 0.4, 0.8, 8);
    ring(e.x, e.z, 0.5, 4, 0.4, 0xff5ce1, 0.9);
    floater('ELITE DOWN!', e.x, 2.6, e.z, 'gold');
  }
  if (e.type === 'bomb') bombBlast(e, false);
}

function bombBlast(e, hurtPlayer) {
  e.alive = false;
  const R = 3.2;
  explosion(e.x, e.z, R, 0xff4d2e, 0.35);
  if (hurtPlayer) {
    const p = G.player;
    if ((p.x - e.x) ** 2 + (p.z - e.z) ** 2 < (R + 0.4) ** 2) p.hurt(e.dmg);
  }
  // chain reactions are the best kind of reactions
  queryCircle(e.x, e.z, R, (o) => {
    if (o === e) return;
    const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz) || 1;
    damage(o, 36, 'bomb', (dx / d) * 14, (dz / d) * 14, { launch: 7 });
  });
}

// An egg that wasn't smashed in time hatches into a little gang.
function hatch(e) {
  e.alive = false;
  poof(e.x, e.z, 1.2, 0xfff1f8);
  burst(e.x, 0.8, e.z, 10, [0xfff1f8, 0xff6fa8, 0x7ad7ff], 5, 0.25, 0.6, 5);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const b = spawnEnemy(G.wave >= 15 && i === 0 ? 'jackalope' : 'bunny', e.x + rand(-0.6, 0.6), e.z + rand(-0.6, 0.6), { force: true });
    if (b) launch(b, 5);
  }
  if (G.state === 'playing') {
    G.born += n;
    G.remaining += n;
    G.bornFlash = 0.4;
    floater('+3 🐣', e.x, 2, e.z, 'love');
  }
  sfx('pop');
}

// ---------- breeding (the counter can go UP) ----------
function breed(a, b) {
  if (E.length >= maxEnemies() || (G.state === 'menu' && E.length > 70)) return;
  a.love = b.love = 0;
  a.loveCd = b.loveCd = rand(7, 11);
  const kind = a.type === b.type ? a.type : Math.random() < 0.5 ? a.type : b.type;
  const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
  const baby = spawnEnemy(kind === 'chonk' && Math.random() < 0.7 ? 'bunny' : kind, x, z, { baby: true });
  if (!baby) return;
  baby.vy = 5;
  baby.air = true;
  heart(x, 1.8, z);
  if (G.state === 'playing') {
    G.born++;
    G.remaining++;
    G.bornFlash = 0.4;
    floater('+1 💕', x, 2.2, z, 'love');
    sfx('heart');
  }
}

const canBreed = (e) => e.grow <= 0 && e.loveCd <= 0 && !e.air && !e.elite && !e.under && e.type !== 'golden' && e.type !== 'bomb' && e.type !== 'egg';

// ---------- enemy projectiles: lobbed carrots (telegraphed) and carrot darts ----------
const shots = [];
const MAX_SHOTS = 420;
// Lob a carrot that lands at (tx, tz) after T seconds; a disc on the ground shows where.
function lob(x, z, tx, tz, dmg, T = 1.1, r = 1.4, h = 4) {
  if (shots.length >= MAX_SHOTS) return;
  tx = clamp(tx, -WORLD, WORLD);
  tz = clamp(tz, -WORLD, WORLD);
  shots.push({ lob: true, sx: x, sz: z, tx, tz, x, z, y: 1, t: 0, T, r, h, dmg, spin: rand(0, 6), vx: 0, vz: 0, life: 0 });
  telegraph(tx, tz, r, T, 0xff8a1f);
}
function dart(x, z, a, speed, dmg, life = 4.5) {
  if (shots.length >= MAX_SHOTS) return;
  shots.push({ lob: false, x, z, y: 1.7, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, dmg, life, t: 0, spin: 0, r: 0.42 });
}

function updateShots(dt) {
  const p = G.player;
  let j = 0;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    s.t += dt;
    let keep = true;
    if (s.lob) {
      const k = Math.min(1, s.t / s.T);
      s.x = s.sx + (s.tx - s.sx) * k;
      s.z = s.sz + (s.tz - s.sz) * k;
      s.y = 1 + s.h * 4 * k * (1 - k);
      s.spin += dt * 9;
      if (k >= 1) {
        keep = false;
        burst(s.tx, 0.3, s.tz, 8, [0xff8a1f, 0x3fae49, 0xb98552], 5, 0.25, 0.45, 5);
        ring(s.tx, s.tz, 0.3, s.r, 0.25, 0xff8a1f, 0.8);
        if ((p.x - s.tx) ** 2 + (p.z - s.tz) ** 2 < (s.r + p.r * 0.6) ** 2) p.hurt(s.dmg);
      }
    } else {
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.life -= dt;
      if (s.life <= 0 || Math.abs(s.x) > WORLD + 2 || Math.abs(s.z) > WORLD + 2) keep = false;
      else if ((p.x - s.x) ** 2 + (p.z - s.z) ** 2 < (s.r + p.r) ** 2) {
        p.hurt(s.dmg);
        burst(s.x, 1, s.z, 5, [0xff8a1f, 0xffffff], 4, 0.2, 0.3, 3);
        keep = false;
      }
    }
    if (keep) shots[j++] = s;
  }
  shots.length = j;
}

function drawShots() {
  for (const s of shots) {
    dummy.position.set(s.x, s.y, s.z);
    if (s.lob) {
      dummy.rotation.set(s.spin, s.spin * 0.5, 0);
      dummy.scale.setScalar(1.9);
    } else {
      dummy.rotation.set(0, Math.atan2(s.vx, s.vz), 0);
      dummy.scale.setScalar(2 * Math.min(1, s.t * 8 + 0.3));
    }
    darts.push();
  }
}

// ---------- special rabbit brains ----------
// Archers keep their distance, draw their bow, then lob a carrot at where you're standing.
function archerBrain(e, d, dt) {
  e.stateT -= dt;
  if (e.state === 'walk') {
    if (d < 9.5) {
      if (e.stateT <= 0) {
        e.state = 'aim';
        e.stateT = 0.7;
      }
      return d < 5.5 ? -0.7 : 0; // back off if you get close, otherwise hold the line
    }
    return 1;
  }
  if (e.state === 'aim') {
    if (e.stateT <= 0 && volley < 1) e.stateT = rand(0.2, 0.6); // wait for a gap in the volley
    else if (e.stateT <= 0) {
      volley--;
      const p = G.player;
      lob(e.x, e.z, p.x + rand(-0.6, 0.6), p.z + rand(-0.6, 0.6), e.shot, 1.15, 1.35);
      e.state = 'walk';
      e.stateT = rand(2.8, 4);
      sfx('toast');
    }
    return 0;
  }
  return 1;
}

// Burrowers dive, tunnel toward you, and burst out of a mound after a short warning.
function burrowerBrain(e, d, dt) {
  const p = G.player;
  e.stateT -= dt;
  if (e.state === 'walk') {
    if (d < 15 && e.stateT <= 0 && !e.air) {
      e.state = 'dig';
      e.stateT = 0.45;
      burst(e.x, 0.3, e.z, 8, [0x9c6a3c, 0x7a4f2b], 4, 0.3, 0.5, 4);
      sfx('dig');
    }
    return 1;
  }
  if (e.state === 'dig') {
    if (e.stateT <= 0) {
      e.state = 'under';
      e.under = true;
      e.stateT = 3.2;
      const a = rand(0, Math.PI * 2);
      e.dirx = Math.cos(a) * 1.3;
      e.dirz = Math.sin(a) * 1.3;
    }
    return 0;
  }
  if (e.state === 'under') {
    // aim for a spot right next to you; it keeps tracking until it gets there
    e.tx = p.x + e.dirx;
    e.tz = p.z + e.dirz;
    const dx = e.tx - e.x, dz = e.tz - e.z, dd = Math.hypot(dx, dz) || 1;
    const sp = 7.5 * dt;
    e.x += (dx / dd) * Math.min(dd, sp);
    e.z += (dz / dd) * Math.min(dd, sp);
    e.rotY = Math.atan2(dx, dz);
    if (Math.random() < dt * 14) particle(e.x + rand(-0.3, 0.3), 0.2, e.z + rand(-0.3, 0.3), rand(-1, 1), rand(2, 4), rand(-1, 1), 0x8a5a33, 0.22, 0.4, -18, 1);
    if (dd < 0.4 || e.stateT <= 0) {
      e.state = 'mound';
      e.stateT = 0.85;
      telegraph(e.x, e.z, 1.9, 0.85, 0x8a5a33);
    }
    return 0;
  }
  if (e.state === 'mound') {
    e.under = false;
    if (e.stateT <= 0) {
      e.state = 'walk';
      e.stateT = rand(5, 8);
      launch(e, 9);
      burst(e.x, 0.4, e.z, 14, [0x9c6a3c, 0x7a4f2b, 0x5fcf55], 7, 0.35, 0.6, 7);
      ring(e.x, e.z, 0.4, 1.9, 0.3, 0xb98552, 0.9);
      G.shake = Math.max(G.shake, 0.2);
      sfx('slam');
      if ((p.x - e.x) ** 2 + (p.z - e.z) ** 2 < (1.9 + p.r * 0.5) ** 2) p.hurt(e.shot);
    }
    return 0;
  }
  return 1;
}

// ---------- per-frame update ----------
export function updateEnemies(dt) {
  // compact dead
  let j = 0;
  for (let i = 0; i < E.length; i++) {
    const e = E[i];
    if (e.alive) E[j++] = e;
    else free.push(e);
  }
  E.length = j;
  rebuildGrid();
  gridN = E.length;

  const p = G.player;
  const menu = G.state === 'menu';
  const moon = G.mod?.id === 'moon';
  const jelly = G.mod?.id === 'jelly';
  // a gentler first wave: love takes its time
  const loveRate = (G.mod?.id === 'fever' ? 4 : 1) * (G.wave === 1 ? 0.5 : 1);
  const slow = G.mod?.id === 'slowmo' ? 0.55 : 1;
  const gravity = moon ? 9 : 30;
  const t = G.time;

  for (let i = 0; i < gridN; i++) {
    const e = E[i];
    if (!e.alive) continue;
    e.flash -= dt;
    // a lasso or a cart is carrying this one around: the weapon moves it
    if (e.held > t) continue;
    if (e.grow > 0) {
      e.grow -= dt;
      e.scale = e.size * (1 - 0.5 * Math.max(0, e.grow) / 14);
      e.r = 0.42 * e.scale;
      if (e.grow <= 0) e.hp += e.maxHp * 0.7;
    }
    e.loveCd -= dt;

    // --- steering ---
    let dx = p.x - e.x, dz = p.z - e.z;
    const d = Math.hypot(dx, dz) || 0.001;
    dx /= d;
    dz /= d;
    let sp = e.speed * slow;
    const dizzy = e.confused > t;
    if (menu) {
      e.wander += rand(-1, 1) * dt * 2;
      dx = Math.cos(e.wander);
      dz = Math.sin(e.wander);
      sp *= 0.35;
      if (Math.hypot(e.x, e.z) > 22) {
        dx = -e.x / 22;
        dz = -e.z / 22;
      }
    } else if (e.lockT > 0) {
      e.lockT -= dt;
      dx = e.lockx;
      dz = e.lockz;
      sp *= 1.3;
    } else if (e.type === 'golden') {
      dx = -dx + Math.sin(t * 2 + e.id) * 0.5;
      dz = -dz + Math.cos(t * 2 + e.id) * 0.5;
      e.life -= dt;
      if (Math.random() < dt * 8) sparkle(e.x, 1, e.z, 1);
      if (e.life <= 0) {
        e.alive = false;
        poof(e.x, e.z, 1, 0xffcc33);
        floater('it got away!', e.x, 2, e.z, 'gold');
        continue;
      }
    } else if (e.type === 'egg') {
      sp = 0;
      e.stateT -= dt;
      if (e.stateT <= 0) {
        hatch(e);
        continue;
      }
    } else if (dizzy) {
      // kazoo'd: wander backwards in a daze
      dx = -dx + Math.sin(t * 5 + e.id) * 0.6;
      dz = -dz + Math.cos(t * 5 + e.id) * 0.6;
      sp *= 0.6;
      if (e.state === 'wind' || e.state === 'dash' || e.state === 'aim') e.state = 'walk';
    } else if (e.type === 'jackalope') {
      e.stateT -= dt;
      if (e.state === 'walk' && e.stateT <= 0 && d < 11) {
        e.state = 'wind';
        e.stateT = 0.6;
        e.dirx = dx;
        e.dirz = dz;
      } else if (e.state === 'wind') {
        sp = 0;
        e.flash = Math.sin(t * 40) > 0 ? 0.05 : 0;
        if (e.stateT <= 0) {
          e.state = 'dash';
          e.stateT = 0.5;
        }
      } else if (e.state === 'dash') {
        dx = e.dirx;
        dz = e.dirz;
        sp = 15;
        if (Math.random() < dt * 30) burst(e.x, 0.3, e.z, 1, [0xd9b48f], 1, 0.25, 0.4, 1);
        if (e.stateT <= 0) {
          e.state = 'walk';
          e.stateT = rand(2.5, 4);
        }
      }
    } else if (e.type === 'archer') {
      sp *= archerBrain(e, d, dt);
    } else if (e.type === 'burrower') {
      sp *= burrowerBrain(e, d, dt);
      if (e.under) {
        // tunnelling: no collisions, no contact damage
        if (d > G.viewR * 2.6) e.stateT = 0;
        continue;
      }
    }
    if (e.grow > 0) sp *= 1.15;
    // sliding around a tree we bumped into, instead of pushing into it forever
    if (e.slT > 0) {
      e.slT -= dt;
      dx = dx * 0.35 + e.slx;
      dz = dz * 0.35 + e.slz;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
    }

    e.x += (dx * sp + e.kx) * dt;
    e.z += (dz * sp + e.kz) * dt;
    const kd = Math.exp(-5 * dt);
    e.kx *= kd;
    e.kz *= kd;
    if (sp > 0.1) e.rotY = Math.atan2(dx, dz);
    else if (sp < -0.1) e.rotY = Math.atan2(-dx, -dz);
    else if (e.type === 'archer') e.rotY = Math.atan2(p.x - e.x, p.z - e.z);

    // --- airborne tumbling (leaf blowers, banana peels, explosions) ---
    if (e.air) {
      e.y += e.vy * dt;
      e.vy -= gravity * dt;
      e.spin += dt * 11;
      if (e.y <= 0) {
        e.y = 0;
        e.air = false;
        e.spin = 0;
        if (e.vy < -8) dust(e.x, e.z, e.scale, 3);
        e.vy = 0;
      }
    } else {
      e.phase += dt * (5 + Math.abs(sp) * 1.2);
    }

    // --- separation + breeding ---
    let touches = 0;
    const er = e.r;
    queryCircle(e.x, e.z, er, (o) => {
      if (o === e || o.isBoss || touches > 6) return;
      touches++;
      let ox = e.x - o.x, oz = e.z - o.z;
      let dd = Math.hypot(ox, oz);
      if (dd < 0.001) {
        ox = rand(-1, 1);
        oz = rand(-1, 1);
        dd = 1;
      }
      const push = (er + o.r - dd) * 0.5;
      if (push > 0) {
        e.x += (ox / dd) * push * (jelly ? 1.6 : 1);
        e.z += (oz / dd) * push * (jelly ? 1.6 : 1);
      }
      if (o.id > e.id && canBreed(e) && canBreed(o)) {
        e.love += dt * loveRate;
        o.love += dt * loveRate;
        if (e.love > LOVE_TIME && o.love > LOVE_TIME) breed(e, o);
      }
    });
    if (G.frame % 2 === i % 2) {
      const bx = e.x, bz = e.z;
      if (pushOut(e, er) && !e.lockT && sp > 0) {
        // obstacle normal from the push; slide along it, on the side that heads toward the player
        const nx = e.x - bx, nz = e.z - bz, nl = Math.hypot(nx, nz);
        if (nl > 1e-4) {
          let tx = -nz / nl, tz = nx / nl;
          if (tx * (p.x - e.x) + tz * (p.z - e.z) < 0) {
            tx = -tx;
            tz = -tz;
          }
          e.slx = tx;
          e.slz = tz;
          e.slT = 0.45;
        }
      }
    }

    // --- hurting the player ---
    if (!menu && !e.air) {
      const pd = (p.x - e.x) ** 2 + (p.z - e.z) ** 2;
      const rr = er + p.r;
      if (e.type === 'bomb') {
        if (pd < (rr + 1.2) ** 2) {
          bombBlast(e, true);
          continue;
        }
      } else if (pd < rr * rr && e.dmg > 0 && !dizzy) p.hurt(e.dmg);
    }
    // distant stragglers get recycled closer to the action
    if (!menu && d > G.viewR * 2.6 && e.type !== 'golden' && e.type !== 'egg') {
      const [nx, nz] = spawnPoint();
      e.x = nx;
      e.z = nz;
    }
  }
  updateShots(dt);
  if (!menu) {
    if (!G.boss && bossQueue > 0 && G.state === 'playing') {
      bossQueue--;
      spawnBoss();
    }
    // the final wave lasts until the Queen is dethroned
    if (G.wave >= FINAL_WAVE && !G.victory && G.state === 'playing') {
      if (!G.boss && bossQueue === 0 && G.waveTime > 3) spawnBoss();
      G.waveTime = Math.min(G.waveTime, 38);
    }
  }
  if (G.boss) updateBoss(dt);
}

// ---------- drawing ----------
export function drawEnemies() {
  const showHats = G.mod?.id === 'hats';
  const jelly = G.mod?.id === 'jelly';
  const t = G.time;
  for (const k of KINDS) inst[k].begin();
  hats.begin();
  shadows.begin();
  mounds.begin();
  auras.begin();
  dizzy.begin();
  darts.begin();
  for (const e of E) {
    if (!e.alive) continue;
    const s = e.scale;
    if (e.under) {
      // just a moving lump of dirt
      dummy.position.set(e.x, 0, e.z);
      dummy.rotation.set(0, e.rotY, 0);
      dummy.scale.set(0.8, 0.5 + Math.abs(Math.sin(t * 14 + e.id)) * 0.3, 0.8);
      mounds.push();
      continue;
    }
    let hop = e.air ? 0 : Math.abs(Math.sin(e.phase)) * 0.32 * s * (G.mod?.id === 'moon' ? 3 : 1);
    if (e.type === 'egg') hop = 0;
    const sq = e.air ? 0 : Math.cos(e.phase * 2) * (jelly ? 0.22 : 0.07);
    dummy.position.set(e.x, e.y + hop, e.z);
    dummy.rotation.set(e.spin, e.rotY, e.air ? e.spin * 0.6 : 0);
    if (e.type === 'jackalope' && e.state === 'wind') dummy.rotation.x = -0.35;
    else if (e.type === 'archer' && e.state === 'aim') dummy.rotation.x = -0.25;
    else if (e.type === 'egg') dummy.rotation.z = Math.sin(t * (6 + 18 / Math.max(0.6, e.stateT))) * Math.min(0.35, 0.6 / Math.max(0.6, e.stateT));
    if (e.type === 'burrower' && e.state === 'mound') {
      // shaking mound, the rabbit is about to burst out
      dummy.position.set(e.x + Math.sin(t * 50) * 0.06, 0, e.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.2, 0.8 + Math.abs(Math.sin(t * 25)) * 0.4, 1.2);
      mounds.push();
      continue;
    }
    if (e.type === 'burrower' && e.state === 'dig') {
      dummy.position.y = -1.2 * (1 - e.stateT / 0.45);
      dummy.rotation.x = 0.6;
    }
    dummy.scale.set(s * (1 - sq * 0.5), s * (1 + sq), s * (1 - sq * 0.5));
    let col = null;
    if (e.flash > 0) col = flashCol;
    else if (e.type === 'bomb' && Math.sin(t * 14 + e.id) > 0.3) col = redCol;
    else if (e.type === 'golden') col = goldCol;
    else if (e.elite) {
      const k = 0.5 + 0.5 * Math.sin(t * 5 + e.id);
      col = eliteCol.setRGB(1.5 + k * 0.6, 0.75 + k * 0.25, 1.6 + k * 0.6);
    } else if (e.type === 'archer' && e.state === 'aim') col = goldCol;
    inst[e.type].push(col || WHITE1);
    if (showHats || e.confused > t) {
      dummy.updateMatrix();
      if (showHats) hats.push(null, dummy.matrix);
      if (e.confused > t) {
        dummy.rotation.y = t * 7 + e.id;
        dizzy.push();
      }
    }
    if (e.elite) {
      dummy.position.set(e.x, 0.08, e.z);
      dummy.rotation.set(0, t * 2, 0);
      const as = s * (1.1 + Math.sin(t * 6 + e.id) * 0.08);
      dummy.scale.set(as, 1, as);
      auras.push();
    }
    dummy.position.set(e.x, 0.04, e.z);
    dummy.rotation.set(0, 0, 0);
    const shs = s * 1.5 * Math.max(0.4, 1 - (e.y + hop) * 0.12);
    dummy.scale.set(shs, 1, shs);
    shadows.push();
  }
  const b = G.boss;
  if (b && b.alive) {
    dummy.position.set(b.x, 0.04, b.z);
    dummy.rotation.set(0, 0, 0);
    const shs = b.scale * 1.6 * Math.max(0.3, 1 - b.y * 0.05);
    dummy.scale.set(shs, 1, shs);
    shadows.push();
  }
  drawShots();
  for (const k of KINDS) inst[k].end();
  hats.end();
  shadows.end();
  mounds.end();
  auras.end();
  dizzy.end();
  darts.end();
}
export function drawPlayerShadow(x, z, s) {
  // the player's blob shadow rides along in the enemy shadow batch
  dummy.position.set(x, 0.04, z);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(s, 1, s);
  shadows.push();
  shadows.end();
}

// ======================================================================
// Bosses. Each has a set of telegraphed attacks per phase; at 50% HP it gets angry
// (the Queen has three phases). Between attacks it walks (or keeps its distance).
// ======================================================================
const BOSSES = {
  slammer: {
    names: ['BIG BUN THE UNBEARABLE', 'HOPZILLA', 'GRAND DUKE NIBBLES'],
    sub: 'a royal rabbit has entered the meadow',
    geo: () => rabbitGeo('boss'),
    hp: 1, scale: 3.6, r: 2.4, speed: 2.6,
    phases: [0.5],
    attacks: [['leap'], ['leap2', 'leap2', 'volley']],
    rest: [[4, 5.5], [2.2, 3.2]],
    summon: 'babies', summonCd: [7, 5],
  },
  spinner: {
    names: ['COLONEL CARROTS', 'GENERAL HOPPENHEIMER'],
    sub: 'it brought a carrot gatling',
    geo: spinnerBossGeo,
    hp: 0.75, scale: 3.3, r: 2.2, speed: 1.9, keep: 7,
    phases: [0.5],
    attacks: [['spiral', 'volley'], ['spiral3', 'volley', 'fan']],
    rest: [[2.6, 3.6], [1.8, 2.6]],
    summon: 'babies', summonCd: [12, 9],
  },
  brood: {
    names: ['MOTHER FLUFFINGTON'],
    sub: 'she has a LOT of children',
    geo: broodBossGeo,
    hp: 1.15, scale: 3.8, r: 2.6, speed: 2.1,
    phases: [0.5],
    attacks: [['lay', 'volley'], ['lay', 'charge', 'charge']],
    rest: [[3, 4.2], [2, 3]],
    summon: 'babies', summonCd: [9, 6],
  },
  queen: {
    names: ['THE RABBIT QUEEN'],
    sub: 'the mother of all one million rabbits',
    geo: queenGeo,
    hp: 1.7, scale: 4.3, r: 2.9, speed: 2.4,
    phases: [0.66, 0.33],
    attacks: [['leap', 'volley', 'leap'], ['spiral', 'lay', 'leap', 'volley'], ['leap2', 'spiral3', 'charge', 'fan', 'lay']],
    rest: [[2.8, 3.6], [2.2, 3], [1.4, 2.2]],
    summon: 'guard', summonCd: [14, 11, 8],
  },
};
const ROTATION = ['slammer', 'spinner', 'brood', 'slammer', 'spinner'];
const bossMeshes = {};
let bossQueue = 0, bossSeen = {};

export function spawnBoss() {
  // one boss at a time: if the last one is still stomping around, this one waits its turn
  if (G.boss && G.boss.alive) {
    bossQueue++;
    return null;
  }
  const kind = G.wave === FINAL_WAVE ? 'queen' : ROTATION[Math.max(0, Math.floor(G.wave / 5) - 1) % ROTATION.length];
  const K = BOSSES[kind];
  if (!bossMeshes[kind]) bossMeshes[kind] = outlined(K.geo(), vtoon(), 0.035);
  const mesh = bossMeshes[kind];
  const [x, z] = spawnPoint(G.viewR - 2);
  const n = Math.floor(G.wave / 5) - 1;
  const hp = 900 * (1 + G.wave * 0.45) * (1 + n * 0.5) * K.hp;
  const b = {
    isBoss: true,
    kind,
    K,
    id: -1,
    alive: true,
    x, z, y: 0, vy: 0,
    kx: 0, kz: 0,
    hp, maxHp: hp,
    r: K.r,
    scale: K.scale,
    // bosses hit hard but on their own, gentler curve: their attacks are telegraphed, not swarming
    dmg: 28 * (1 + (G.wave - 1) * 0.075),
    state: 'walk',
    t: 3,
    summonT: 5,
    ph: 0,
    queue: [],
    chain: 0,
    tx: 0, tz: 0, sx: 0, sz: 0,
    spinA: 0, fireT: 0,
    flash: 0,
    hits: {},
    phase: 0,
    rotY: 0,
    born: G.runTime,
    T: { fur: 0xe9e3f0 },
    name: K.names[(bossSeen[kind] || 0) % K.names.length],
    mesh,
  };
  bossSeen[kind] = (bossSeen[kind] || 0) + 1;
  mesh.scale.setScalar(b.scale);
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  G.boss = b;
  music.boss = true;
  banner(`⚠ ${b.name} ⚠`, kind === 'queen' ? `FINAL WAVE · ${K.sub}` : K.sub);
  sfx('boss');
  if (kind === 'queen') {
    G.shake = 1;
    ring(x, z, 1, 14, 0.9, 0xc77dff, 1);
  }
  return b;
}

function pickAttack(b) {
  if (!b.queue.length) {
    const list = b.K.attacks[b.ph];
    for (let i = 0; i < list.length; i++) b.queue.push(list[i]);
    // shuffle so patterns don't become a metronome
    for (let i = b.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = b.queue[i];
      b.queue[i] = b.queue[j];
      b.queue[j] = tmp;
    }
  }
  return b.queue.pop();
}

function rest(b) {
  const [a, c] = b.K.rest[b.ph];
  b.state = 'walk';
  b.t = rand(a, c);
  b.y = 0;
}

function startAttack(b, atk) {
  const p = G.player;
  b.atk = atk;
  if (atk === 'leap' || atk === 'leap2') {
    b.chain = atk === 'leap2' ? 1 : 0;
    crouch(b, 0.7);
  } else if (atk === 'spiral' || atk === 'spiral3') {
    b.state = 'spinup';
    b.t = 0.9;
    b.arms = atk === 'spiral3' ? 3 : 2;
    ring(b.x, b.z, b.r + 4, b.r, 0.9, 0xff8a1f, 0.6);
    floater('!!', b.x, b.scale * 1.8, b.z, 'crit');
  } else if (atk === 'volley') {
    // carrots rain down around you; each landing spot is marked
    const n = b.kind === 'queen' ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(0, 1), r = i === 0 ? 0 : rand(1.8, 4.5);
      lob(b.x, b.z, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, b.dmg * 0.7, 1.2 + i * 0.08, 1.6, 7);
    }
    b.state = 'recover';
    b.t = 0.6;
    sfx('toast');
  } else if (atk === 'fan') {
    b.state = 'fanaim';
    b.t = 0.6;
    b.fired = 0;
    floater('!!', b.x, b.scale * 1.8, b.z, 'crit');
  } else if (atk === 'lay') {
    b.state = 'lay';
    b.t = 0.8;
  } else if (atk === 'charge') {
    b.state = 'chargeaim';
    b.t = 1.0;
    const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz) || 1;
    b.dirx = dx / d;
    b.dirz = dz / d;
    // mark the whole lane
    for (let i = 1; i <= 6; i++) telegraph(b.x + b.dirx * i * 2.6, b.z + b.dirz * i * 2.6, b.r * 0.85, 1.0, 0xff3355);
  }
}

function crouch(b, T) {
  const p = G.player;
  b.state = 'crouch';
  b.t = T;
  b.tx = clamp(p.x, -WORLD + 2, WORLD - 2);
  b.tz = clamp(p.z, -WORLD + 2, WORLD - 2);
  telegraph(b.tx, b.tz, 5, T + 1.1);
}

function summon(b) {
  const what = b.K.summon;
  if (what === 'guard') {
    // the Queen's royal guard: a ring of rabbits and a couple of elites
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      spawnEnemy(i % 7 === 0 ? 'jackalope' : 'bunny', b.x + Math.cos(a) * 4, b.z + Math.sin(a) * 4, { force: true });
    }
    for (let i = 0; i <= b.ph; i++) {
      const a = rand(0, 6.28);
      spawnEnemy(pick(['chonk', 'archer', 'jackalope']), b.x + Math.cos(a) * 5, b.z + Math.sin(a) * 5, { elite: true, force: true });
    }
    floater('GUARDS!', b.x, b.scale * 2, b.z, 'crit');
  } else {
    const n = b.ph ? 12 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      spawnEnemy('bunny', b.x + Math.cos(a) * 3, b.z + Math.sin(a) * 3, { baby: true, force: true });
    }
    heart(b.x, 6, b.z);
    floater('BABIES!', b.x, 7, b.z, 'love');
  }
}

function slam(b, p) {
  ring(b.x, b.z, 1, 9, 0.5, 0xffffff, 0.9);
  burst(b.x, 0.5, b.z, 24, [0xffffff, 0x9be37a, 0xb98552], 10, 0.5, 0.7, 6);
  G.shake = 0.9;
  sfx('slam');
  if ((p.x - b.x) ** 2 + (p.z - b.z) ** 2 < 5.2 * 5.2) p.hurt(b.dmg * 1.2, true);
  queryCircle(b.x, b.z, 6, (o) => {
    if (o.isBoss) return;
    const ox = o.x - b.x, oz = o.z - b.z, od = Math.hypot(ox, oz) || 1;
    o.kx += (ox / od) * 12;
    o.kz += (oz / od) * 12;
    launch(o, 6);
  });
  // angry slams send a ring of carrot darts skittering outward
  if (b.ph > 0 || b.kind === 'queen') {
    const n = b.kind === 'queen' ? 16 : 10, off = rand(0, 1);
    for (let i = 0; i < n; i++) dart(b.x, b.z, ((i + off) / n) * Math.PI * 2, 6.5, b.dmg * 0.45);
  }
}

function updateBoss(dt) {
  const b = G.boss, p = G.player;
  if (!b.alive) return;
  const K = b.K;
  b.flash -= dt;
  b.t -= dt;
  b.summonT -= dt;
  let dx = p.x - b.x, dz = p.z - b.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  // phase changes
  if (b.ph < K.phases.length && b.hp < b.maxHp * K.phases[b.ph] && (b.state === 'walk' || b.state === 'recover')) {
    b.ph++;
    b.queue.length = 0;
    b.state = 'roar';
    b.t = 1.1;
    b.y = 0;
    banner(b.kind === 'queen' ? (b.ph === 1 ? 'THE QUEEN IS FURIOUS' : 'OFF WITH YOUR HEAD!') : `${b.name} IS FURIOUS`, b.ph === 1 ? 'new moves unlocked' : 'final phase');
    sfx('boss');
    ring(b.x, b.z, 1, 12, 0.7, 0xff3355, 1);
    G.shake = 0.7;
    queryCircle(b.x, b.z, 8, (o) => {
      if (o.isBoss) return;
      const ox = o.x - b.x, oz = o.z - b.z, od = Math.hypot(ox, oz) || 1;
      o.kx += (ox / od) * 16;
      o.kz += (oz / od) * 16;
    });
  }
  const sp = K.speed * difficulty().speed * (1 + b.ph * 0.15);
  if (b.state === 'walk') {
    // spinners hang back to shoot (but never run away from melee builds); everyone else wants a hug
    const dir = K.keep ? (d > K.keep + 2 ? 1 : 0.15) : 1;
    b.x += (dx * sp * dir + b.kx) * dt;
    b.z += (dz * sp * dir + b.kz) * dt;
    b.phase += dt * 4;
    b.y = Math.abs(Math.sin(b.phase)) * 0.6;
    b.rotY = Math.atan2(dx, dz);
    if (b.t <= 0 && d < G.viewR + 4) startAttack(b, pickAttack(b));
    if (b.summonT <= 0) {
      b.summonT = K.summonCd[b.ph];
      summon(b);
    }
  } else if (b.state === 'roar') {
    b.rotY += dt * 9;
    if (Math.random() < dt * 30) burst(b.x, b.scale, b.z, 1, [0xff3355, 0xffffff], 6, 0.35, 0.5, 4);
    if (b.t <= 0) rest(b);
  } else if (b.state === 'recover') {
    b.y = 0;
    if (b.t <= 0) rest(b);
  } else if (b.state === 'crouch') {
    b.y = 0;
    if (b.t <= 0) {
      b.state = 'air';
      b.t = 1.1;
      b.sx = b.x;
      b.sz = b.z;
    }
  } else if (b.state === 'air') {
    const k = 1 - b.t / 1.1;
    b.x = b.sx + (b.tx - b.sx) * k;
    b.z = b.sz + (b.tz - b.sz) * k;
    b.y = Math.sin(k * Math.PI) * 9;
    if (b.t <= 0) {
      b.x = b.tx;
      b.z = b.tz;
      b.y = 0;
      slam(b, p);
      if (b.chain > 0) {
        b.chain--;
        crouch(b, 0.5);
      } else rest(b);
    }
  } else if (b.state === 'spinup') {
    b.rotY += dt * (6 + (0.9 - b.t) * 20);
    b.flash = Math.sin(G.time * 40) > 0 ? 0.05 : 0;
    if (b.t <= 0) {
      b.state = 'spiral';
      b.t = b.kind === 'queen' ? 3 : 2.6;
      b.spinA = Math.atan2(dz, dx);
      b.fireT = 0;
    }
  } else if (b.state === 'spiral') {
    b.fireT -= dt;
    b.rotY += dt * 10;
    while (b.fireT <= 0) {
      b.fireT += 0.11;
      b.spinA += 0.36;
      for (let i = 0; i < b.arms; i++) dart(b.x, b.z, b.spinA + (i / b.arms) * Math.PI * 2, 6.2, b.dmg * 0.45);
      sfx('laser');
    }
    if (b.t <= 0) {
      b.state = 'recover';
      b.t = 0.6;
    }
  } else if (b.state === 'fanaim') {
    b.rotY = Math.atan2(dx, dz);
    if (b.t <= 0) {
      // three aimed fans of darts, one after another
      b.fired++;
      const a0 = Math.atan2(dz, dx);
      for (let i = -3; i <= 3; i++) dart(b.x, b.z, a0 + i * 0.16, 9, b.dmg * 0.45);
      sfx('laser');
      if (b.fired >= 3) {
        b.state = 'recover';
        b.t = 0.7;
      } else b.t = 0.45;
    }
  } else if (b.state === 'lay') {
    b.y = Math.abs(Math.sin(G.time * 18)) * 0.3;
    if (b.t <= 0) {
      const n = b.ph ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const a = rand(0, 6.28), r = rand(3, 5.5);
        const x = clamp(b.x + Math.cos(a) * r, -WORLD + 1, WORLD - 1), z = clamp(b.z + Math.sin(a) * r, -WORLD + 1, WORLD - 1);
        const e = spawnEnemy('egg', x, z, { force: true, hatch: rand(5, 6.5) });
        if (e) poof(x, z, 1, 0xff9ec4);
      }
      floater('EGGS!', b.x, b.scale * 2, b.z, 'love');
      sfx('heart');
      b.state = 'recover';
      b.t = 0.5;
    }
  } else if (b.state === 'chargeaim') {
    b.rotY = Math.atan2(b.dirx, b.dirz);
    b.flash = Math.sin(G.time * 30) > 0 ? 0.05 : 0;
    if (b.t <= 0) {
      b.state = 'charge';
      b.t = 0.9;
      sfx('wind');
    }
  } else if (b.state === 'charge') {
    b.x += b.dirx * 17 * dt;
    b.z += b.dirz * 17 * dt;
    b.phase += dt * 14;
    b.y = Math.abs(Math.sin(b.phase)) * 0.8;
    if (Math.random() < dt * 40) burst(b.x, 0.3, b.z, 2, [0xd9b48f, 0xffffff], 3, 0.4, 0.4, 2);
    queryCircle(b.x, b.z, b.r, (o) => {
      if (o.isBoss) return;
      o.kx += -b.dirz * 14;
      o.kz += b.dirx * 14;
      launch(o, 7);
    });
    if ((p.x - b.x) ** 2 + (p.z - b.z) ** 2 < (b.r + p.r) ** 2) p.hurt(b.dmg * 1.1, true);
    if (b.t <= 0 || Math.abs(b.x) > WORLD - 2 || Math.abs(b.z) > WORLD - 2) {
      b.state = 'recover';
      b.t = 0.6;
      G.shake = Math.max(G.shake, 0.4);
    }
  }
  b.kx *= Math.exp(-4 * dt);
  b.kz *= Math.exp(-4 * dt);
  pushOut(b, b.r * 0.6);
  if (b.state !== 'air' && b.state !== 'charge' && (p.x - b.x) ** 2 + (p.z - b.z) ** 2 < (b.r + p.r) ** 2) p.hurt(b.dmg);
  const m = b.mesh;
  m.position.set(b.x, b.y, b.z);
  m.rotation.y = b.rotY;
  const sq = b.state === 'crouch' ? 0.25 : b.state === 'lay' ? 0.12 : 0;
  m.scale.set(b.scale * (1 + sq * 0.5), b.scale * (1 - sq), b.scale * (1 + sq * 0.5));
  // angry bosses glow a little red
  const glow = b.flash > 0 ? 0.6 : b.ph > 0 ? 0.12 + 0.1 * Math.sin(G.time * 6) : 0;
  m.material.emissive?.setRGB(glow, b.flash > 0 ? glow : glow * 0.2, b.flash > 0 ? glow : glow * 0.2);
}

function killBoss(b) {
  b.alive = false;
  G.kills++;
  G.remaining--;
  G.scene.remove(b.mesh);
  G.boss = null;
  music.boss = false;
  G.bossLog?.push({ wave: G.wave, kind: b.kind, t: Math.round(G.runTime - b.born) });
  for (let i = 0; i < 4; i++) setTimeout(() => explosion(b.x + rand(-2, 2), b.z + rand(-2, 2), 4, 0xb43cff, 0.8), i * 120);
  burst(b.x, 3, b.z, 40, [0xffc83d, 0xffffff, 0xff6fa8], 12, 0.6, 1.2, 12);
  // her guards and eggs scatter when she falls
  if (b.kind === 'queen') {
    for (const e of E) if (e.alive && e.type === 'egg') e.alive = false;
    shots.length = 0;
  }
  const x = clamp(b.x, -WORLD + 2, WORLD - 2), z = clamp(b.z, -WORLD + 2, WORLD - 2);
  dropPickup('chest', x, z);
  for (let i = 0; i < (b.kind === 'queen' ? 30 : 8); i++) dropPickup('gold', x + rand(-3, 3), z + rand(-3, 3));
  dropXp(x, z, 120);
  sfx('fanfare');
  if (b.kind === 'queen') {
    G.victory = true;
    banner('THE QUEEN HAS FALLEN!', 'the meadow is yours');
    G.shake = 1.2;
    for (let i = 0; i < 3; i++) ring(b.x, b.z, 1, 10 + i * 6, 0.8 + i * 0.2, [0xffc83d, 0xff6fa8, 0x47e5ff][i], 1);
    G.onVictory?.();
  } else banner(`${b.name} IS DOWN!`, 'grab the treasure chest');
}

export const enemyCount = () => E.length;
export { fmt };
