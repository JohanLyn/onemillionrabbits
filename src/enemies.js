import * as THREE from 'three';
import { G, WORLD, dummy, rand, pick, clamp, fmt } from './core.js';
import { Inst, vtoon, outlined } from './toon.js';
import { rabbitGeo, hatGeo } from './models.js';
import { pushOut, blocked } from './world.js';
import { poof, burst, explosion, floater, heart, telegraph, ring, banner } from './fx.js';
import { sfx, music } from './audio.js';
import { dropXp, dropPickup } from './pickups.js';

// ---------- rabbit roster ----------
export const TYPES = {
  bunny: { hp: 10, speed: 3.0, dmg: 8, xp: 1, scale: 1, fur: 0xf4efe9 },
  hare: { hp: 8, speed: 5.0, dmg: 6, xp: 1, scale: 0.9, fur: 0xc98c55 },
  chonk: { hp: 75, speed: 1.9, dmg: 16, xp: 6, scale: 1.8, fur: 0xa3a3b8 },
  jackalope: { hp: 34, speed: 3.3, dmg: 12, xp: 3, scale: 1.1, fur: 0x8a5a3a },
  bomb: { hp: 14, speed: 4.3, dmg: 22, xp: 2, scale: 1, fur: 0x5b5566 },
  golden: { hp: 30, speed: 5.6, dmg: 0, xp: 25, scale: 1, fur: 0xffcc33 },
};
const KINDS = Object.keys(TYPES);
export const E = []; // live enemies (dead ones are compacted out each frame)
const free = [];
let nextId = 1;
let inst = {}, hats, shadows;
const flashCol = new THREE.Color(3, 3, 3);
const redCol = new THREE.Color(2.6, 0.6, 0.6);
const goldCol = new THREE.Color(1.3, 1.2, 0.9);
const BOSS_NAMES = ['BIG BUN THE UNBEARABLE', 'HOPZILLA', 'THE EASTER OVERLORD', 'SIR LETTUCE-SNATCHER', 'MEGA FLUFF 9000', 'GRAND DUKE NIBBLES'];

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

// Calls cb(e) for every living enemy (boss included) touching the circle.
export function queryCircle(x, z, r, cb) {
  const ext = r + 1.0;
  const x0 = cellOf(x - ext), x1 = cellOf(x + ext), z0 = cellOf(z - ext), z1 = cellOf(z + ext);
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      for (let i = head[cx + cz * GN]; i !== -1; i = next[i]) {
        if (i >= gridN) continue;
        const e = E[i];
        if (!e.alive) continue;
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

// ---------- setup ----------
export function initEnemies() {
  const cap = maxEnemies() + 60;
  for (const k of KINDS) inst[k] = new Inst(rabbitGeo(k), k === 'golden' ? 12 : cap, { mat: vtoon(), outline: 0.045, colors: true });
  hats = new Inst(hatGeo(), cap, { mat: vtoon(), outline: 0.035 });
  const sh = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
  shadows = new Inst(sh, cap + 20, {
    mat: new THREE.MeshBasicMaterial({ color: 0x1f3a14, transparent: true, opacity: 0.28, depthWrite: false }),
    outline: 0,
  });
  shadows.mesh.renderOrder = 1;
}

export function clearEnemies() {
  for (const e of E) {
    e.alive = false;
    free.push(e);
  }
  E.length = 0;
  gridN = 0;
  if (G.boss) {
    G.scene.remove(G.boss.mesh);
    G.boss = null;
  }
}

export function difficulty() {
  const w = G.wave - 1;
  return {
    hp: 1 + w * 0.24 + w * w * 0.014,
    dmg: 1 + w * 0.07,
    speed: 1 + Math.min(0.35, w * 0.018),
  };
}

export function spawnEnemy(type, x, z, opts = {}) {
  if (E.length >= maxEnemies() && !opts.force) return null;
  const T = TYPES[type];
  const d = G.state === 'menu' ? { hp: 1, dmg: 0, speed: 1 } : difficulty();
  const e = free.pop() || {};
  const giant = G.mod?.id === 'giant' ? 1.55 : 1;
  const baby = !!opts.baby;
  e.id = nextId++;
  e.type = type;
  e.T = T;
  e.x = x;
  e.z = z;
  e.y = 0;
  e.vy = 0;
  e.kx = e.kz = 0;
  e.maxHp = T.hp * d.hp * (giant > 1 ? 2 : 1);
  e.hp = baby ? e.maxHp * 0.3 : e.maxHp;
  e.speed = T.speed * d.speed * rand(0.9, 1.1);
  e.dmg = T.dmg * d.dmg;
  e.xp = T.xp * (giant > 1 ? 2 : 1);
  e.size = T.scale * giant;
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
  e.stateT = rand(1, 3);
  e.dirx = 0;
  e.dirz = 0;
  e.hits = {};
  e.life = type === 'golden' ? 16 : 0;
  e.wander = rand(0, 6.28);
  e.lockT = opts.lockT || 0;
  e.lockx = opts.lockx || 0;
  e.lockz = opts.lockz || 0;
  e.slipped = 0;
  E.push(e);
  return e;
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
let spawnAcc = 0, goldenAcc = 0;
function chooseType() {
  const w = G.wave;
  const weights = [['bunny', 10]];
  if (w >= 2) weights.push(['hare', 3 + w * 0.35]);
  if (w >= 3) weights.push(['chonk', 1 + w * 0.25]);
  if (w >= 5) weights.push(['jackalope', 1 + w * 0.22]);
  if (w >= 7) weights.push(['bomb', 1.2 + w * 0.16]);
  let total = 0;
  for (const [, wt] of weights) total += wt;
  let r = Math.random() * total;
  for (const [k, wt] of weights) if ((r -= wt) <= 0) return k;
  return 'bunny';
}

export function director(dt) {
  const w = G.wave;
  const slowMo = G.mod?.id === 'slowmo';
  const raid = slowMo ? 2 : 1;
  // the very first wave ramps up so you get a few seconds to find your feet
  const ramp = w === 1 ? 0.4 + 0.6 * Math.min(1, G.waveTime / 35) : 1;
  const target = Math.min(maxEnemies(), (24 + w * 20 + G.waveTime * (0.9 + w * 0.14)) * raid * ramp);
  const rate = Math.min(40, 4 + w * 2) * raid * (E.length < target ? 1 : 0.15);
  spawnAcc += rate * dt;
  while (spawnAcc >= 1) {
    spawnAcc -= 1;
    const [x, z] = spawnPoint();
    // spawn in little clumps, it reads as a horde
    const t = chooseType();
    const n = t === 'chonk' ? 1 : Math.random() < 0.3 ? 3 : 1;
    for (let i = 0; i < n; i++) spawnEnemy(t, x + rand(-1.5, 1.5), z + rand(-1.5, 1.5));
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
  const crit = Math.random() < G.stats.crit;
  if (crit) amt *= 2;
  e.hp -= amt;
  e.flash = 0.09;
  const knockMul = (G.mod?.id === 'moon' ? 2.2 : 1) / (e.isBoss ? 12 : Math.max(1, e.scale * e.scale * 0.8));
  e.kx += kx * knockMul;
  e.kz += kz * knockMul;
  if (opts.launch && !e.isBoss) launch(e, opts.launch);
  G.damageBy[src] = (G.damageBy[src] || 0) + amt;
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
  G.ultCharge = Math.min(G.stats.ultCost, G.ultCharge + 1);
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
    damage(o, 45, 'bomb', (dx / d) * 14, (dz / d) * 14, { launch: 7 });
  });
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

const canBreed = (e) => e.grow <= 0 && e.loveCd <= 0 && !e.air && e.type !== 'golden' && e.type !== 'bomb';

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
  const loveRate = G.mod?.id === 'fever' ? 4 : 1;
  const slow = G.mod?.id === 'slowmo' ? 0.55 : 1;
  const gravity = moon ? 9 : 30;
  const t = G.time;

  for (let i = 0; i < gridN; i++) {
    const e = E[i];
    if (!e.alive) continue;
    if (e.grow > 0) {
      e.grow -= dt;
      e.scale = e.size * (1 - 0.5 * Math.max(0, e.grow) / 14);
      e.r = 0.42 * e.scale;
      if (e.grow <= 0) e.hp += e.maxHp * 0.7;
    }
    e.loveCd -= dt;
    e.flash -= dt;

    // --- steering ---
    let dx = p.x - e.x, dz = p.z - e.z;
    const d = Math.hypot(dx, dz) || 0.001;
    dx /= d;
    dz /= d;
    let sp = e.speed * slow;
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
      if (Math.random() < dt * 8) burst(e.x, 1, e.z, 1, [0xffe680], 1, 0.2, 0.6, 2);
      if (e.life <= 0) {
        e.alive = false;
        poof(e.x, e.z, 1, 0xffcc33);
        floater('it got away!', e.x, 2, e.z, 'gold');
        continue;
      }
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
    }
    if (e.grow > 0) sp *= 1.15;

    e.x += (dx * sp + e.kx) * dt;
    e.z += (dz * sp + e.kz) * dt;
    const kd = Math.exp(-5 * dt);
    e.kx *= kd;
    e.kz *= kd;
    if (sp > 0.1) e.rotY = Math.atan2(dx, dz);

    // --- airborne tumbling (leaf blowers, banana peels, explosions) ---
    if (e.air) {
      e.y += e.vy * dt;
      e.vy -= gravity * dt;
      e.spin += dt * 11;
      if (e.y <= 0) {
        e.y = 0;
        e.air = false;
        e.spin = 0;
        if (e.vy < -8) burst(e.x, 0.2, e.z, 3, [0xffffff, 0x9be37a], 3, 0.25, 0.35, 2);
        e.vy = 0;
      }
    } else {
      e.phase += dt * (5 + sp * 1.2);
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
    if (G.frame % 2 === i % 2) pushOut(e, er);

    // --- hurting the player ---
    if (!menu && !e.air) {
      const pd = (p.x - e.x) ** 2 + (p.z - e.z) ** 2;
      const rr = er + p.r;
      if (e.type === 'bomb') {
        if (pd < (rr + 1.2) ** 2) {
          bombBlast(e, true);
          continue;
        }
      } else if (pd < rr * rr && e.dmg > 0) p.hurt(e.dmg);
    }
    // distant stragglers get recycled closer to the action
    if (!menu && d > G.viewR * 2.6 && e.type !== 'golden') {
      const [nx, nz] = spawnPoint();
      e.x = nx;
      e.z = nz;
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
  for (const e of E) {
    if (!e.alive) continue;
    const s = e.scale;
    const hop = e.air ? 0 : Math.abs(Math.sin(e.phase)) * 0.32 * s * (G.mod?.id === 'moon' ? 3 : 1);
    const sq = e.air ? 0 : Math.cos(e.phase * 2) * (jelly ? 0.22 : 0.07);
    dummy.position.set(e.x, e.y + hop, e.z);
    dummy.rotation.set(e.spin, e.rotY, e.air ? e.spin * 0.6 : 0);
    if (e.type === 'jackalope' && e.state === 'wind') dummy.rotation.x = -0.35;
    dummy.scale.set(s * (1 - sq * 0.5), s * (1 + sq), s * (1 - sq * 0.5));
    let col = null;
    if (e.flash > 0) col = flashCol;
    else if (e.type === 'bomb' && Math.sin(t * 14 + e.id) > 0.3) col = redCol;
    else if (e.type === 'golden') col = goldCol;
    inst[e.type].push(col || WHITE1);
    if (showHats) hats.push(null, dummy.matrix);
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
  for (const k of KINDS) inst[k].end();
  hats.end();
  shadows.end();
}
const WHITE1 = new THREE.Color(1, 1, 1);
export function drawPlayerShadow(x, z, s) {
  // the player's blob shadow rides along in the enemy shadow batch
  dummy.position.set(x, 0.04, z);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(s, 1, s);
  shadows.push();
  shadows.end();
}

// ---------- bosses ----------
let bossMesh = null;
export function spawnBoss() {
  if (!bossMesh) bossMesh = outlined(rabbitGeo('boss'), vtoon(), 0.035);
  const [x, z] = spawnPoint(G.viewR - 2);
  const n = Math.floor(G.wave / 5) - 1;
  const hp = 900 * (1 + G.wave * 0.45) * (1 + n * 0.5);
  const b = {
    isBoss: true,
    id: -1,
    alive: true,
    x, z, y: 0, vy: 0,
    kx: 0, kz: 0,
    hp, maxHp: hp,
    r: 2.4,
    scale: 3.6,
    dmg: 28 * difficulty().dmg,
    state: 'walk',
    t: 3,
    summonT: 6,
    tx: 0, tz: 0,
    flash: 0,
    hits: {},
    phase: 0,
    rotY: 0,
    T: { fur: 0xe9e3f0 },
    name: BOSS_NAMES[n % BOSS_NAMES.length],
    mesh: bossMesh,
  };
  bossMesh.scale.setScalar(b.scale);
  bossMesh.position.set(x, 0, z);
  G.scene.add(bossMesh);
  G.boss = b;
  music.boss = true;
  banner(`⚠ ${b.name} ⚠`, 'a royal rabbit has entered the meadow');
  sfx('boss');
  return b;
}

function updateBoss(dt) {
  const b = G.boss, p = G.player;
  if (!b.alive) return;
  b.flash -= dt;
  b.t -= dt;
  b.summonT -= dt;
  let dx = p.x - b.x, dz = p.z - b.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  if (b.state === 'walk') {
    const sp = 2.6 * difficulty().speed;
    b.x += (dx * sp + b.kx) * dt;
    b.z += (dz * sp + b.kz) * dt;
    b.phase += dt * 4;
    b.y = Math.abs(Math.sin(b.phase)) * 0.6;
    b.rotY = Math.atan2(dx, dz);
    if (b.t <= 0) {
      b.state = 'crouch';
      b.t = 0.7;
      b.tx = p.x;
      b.tz = p.z;
      telegraph(b.tx, b.tz, 5, 0.7 + 1.1);
    }
    if (b.summonT <= 0) {
      b.summonT = 7;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        spawnEnemy('bunny', b.x + Math.cos(a) * 3, b.z + Math.sin(a) * 3, { baby: true, force: true });
      }
      heart(b.x, 6, b.z);
      floater('BABIES!', b.x, 7, b.z, 'love');
    }
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
      b.state = 'walk';
      b.t = rand(4, 6);
      b.y = 0;
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
    }
  }
  b.kx *= Math.exp(-4 * dt);
  b.kz *= Math.exp(-4 * dt);
  pushOut(b, 1.5);
  if (b.state !== 'air' && (p.x - b.x) ** 2 + (p.z - b.z) ** 2 < (b.r + p.r) ** 2) p.hurt(b.dmg);
  const m = b.mesh;
  m.position.set(b.x, b.y, b.z);
  m.rotation.y = b.rotY;
  const sq = b.state === 'crouch' ? 0.25 : 0;
  m.scale.set(b.scale * (1 + sq * 0.5), b.scale * (1 - sq), b.scale * (1 + sq * 0.5));
  m.material.emissive?.setScalar(b.flash > 0 ? 0.6 : 0);
}

function killBoss(b) {
  b.alive = false;
  G.kills++;
  G.remaining--;
  G.scene.remove(b.mesh);
  G.boss = null;
  music.boss = false;
  for (let i = 0; i < 4; i++) setTimeout(() => explosion(b.x + rand(-2, 2), b.z + rand(-2, 2), 4, 0xb43cff, 0.8), i * 120);
  burst(b.x, 3, b.z, 40, [0xffc83d, 0xffffff, 0xff6fa8], 12, 0.6, 1.2, 12);
  dropPickup('chest', b.x, b.z);
  for (let i = 0; i < 8; i++) dropPickup('gold', b.x + rand(-3, 3), b.z + rand(-3, 3));
  dropXp(b.x, b.z, 120);
  banner(`${b.name} IS DOWN!`, 'grab the treasure chest');
  sfx('fanfare');
}

export const enemyCount = () => E.length;
export { fmt };
