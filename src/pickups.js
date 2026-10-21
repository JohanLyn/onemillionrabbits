import { G, WORLD, dummy, rand, clamp } from './core.js';
import { Inst, vtoon } from './toon.js';
import { carrotGeo, cakeGeo, magnetGeo, chestGeo } from './models.js';
import { giftGeo } from './models-extra.js';
import { pushOut } from './world.js';
import { burst, floater, ring } from './fx.js';
import { sfx } from './audio.js';

// Carrots (XP), cake (healing), magnets, golden carrots (permanent currency), boss chests and elite presents.
const KINDS = {
  xp1: { geo: () => carrotGeo(), cap: 700, scale: 1, outline: 0.03 },
  xp5: { geo: () => carrotGeo(0xa24bff, 0x4caf50), cap: 300, scale: 1.4, outline: 0.03 },
  xp25: { geo: () => carrotGeo(0x3bd4ff, 0xffffff), cap: 120, scale: 1.9, outline: 0.03 },
  gold: { geo: () => carrotGeo(0xffc83d, 0xfff3a0), cap: 80, scale: 1.6, outline: 0.04 },
  cake: { geo: cakeGeo, cap: 20, scale: 1.3, outline: 0.04 },
  magnet: { geo: magnetGeo, cap: 10, scale: 1.4, outline: 0.04 },
  chest: { geo: chestGeo, cap: 4, scale: 1.4, outline: 0.05 },
  gift: { geo: giftGeo, cap: 16, scale: 1.3, outline: 0.05 },
};
const items = [];
const inst = {};
let comboT = 0, combo = 0, xpCount = 0;

export function initPickups() {
  for (const k in KINDS) inst[k] = new Inst(KINDS[k].geo(), KINDS[k].cap, { mat: vtoon(), outline: KINDS[k].outline });
  G.pickups = items; // read-only view for the balance bot
}
export function clearPickups() {
  items.length = 0;
  xpCount = 0;
}

function add(kind, x, z, value = 1, y = 0) {
  const it = { kind, x: clamp(x, -WORLD + 0.8, WORLD - 0.8), z: clamp(z, -WORLD + 0.8, WORLD - 0.8), y, vy: y > 0 ? 0 : 6, value, fly: false, speed: 0, t: rand(0, 6), dead: false };
  // never leave loot inside a tree or past the fence where you can't walk to it
  pushOut(it, 0.4);
  items.push(it);
  if (kind.startsWith('xp')) xpCount++;
  return it;
}

export function dropXp(x, z, v) {
  // too many carrots lying around: fold the new value into an old one instead
  if (xpCount > 650) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.dead && !it.fly && it.kind.startsWith('xp')) {
        it.value += v;
        it.kind = it.value >= 25 ? 'xp25' : it.value >= 5 ? 'xp5' : 'xp1';
        items.push(items.splice(i, 1)[0]);
        return;
      }
    }
  }
  add(v >= 25 ? 'xp25' : v >= 5 ? 'xp5' : 'xp1', x, z, v);
}
export const dropPickup = (kind, x, z, y = 0) => add(kind, x, z, 1, y);

export function vacuum() {
  for (const it of items) if (it.kind.startsWith('xp')) it.fly = true;
}

let rainAcc = 0;
export function updatePickups(dt) {
  const p = G.player;
  const mag = 2.6 * G.stats.magnet * (G.mod?.id === 'magnet' ? 3 : 1);
  comboT -= dt;
  if (comboT <= 0) combo = 0;
  if (G.mod?.id === 'rain' && G.state === 'playing') {
    rainAcc += dt * 6;
    while (rainAcc > 1) {
      rainAcc--;
      add('xp1', p.x + rand(-14, 14), p.z + rand(-11, 11), 1, rand(10, 16));
    }
  }
  let w = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.dead) continue;
    it.t += dt;
    if (it.y > 0 || it.vy > 0) {
      it.vy -= 30 * dt;
      it.y = Math.max(0, it.y + it.vy * dt);
      if (it.y === 0) it.vy = 0;
    }
    const dx = p.x - it.x, dz = p.z - it.z;
    const d2 = dx * dx + dz * dz;
    // treasure gets pulled in from further away, so you never miss a boss chest
    const reach = it.kind === 'chest' ? 7 : it.kind === 'gift' ? 5 : it.kind === 'gold' ? mag * 2 : mag;
    // cake waits on the grass until you actually need it (no '+0 cake')
    if (!it.fly && d2 < reach * reach && (it.kind !== 'cake' || p.hp < p.maxHp)) it.fly = true;
    if (it.fly) {
      const d = Math.sqrt(d2) || 1;
      it.speed = Math.min(it.speed + dt * 40, 26);
      const step = Math.min(d, it.speed * dt);
      it.x += (dx / d) * step;
      it.z += (dz / d) * step;
      if (d < 0.7) {
        collect(it);
        continue;
      }
    }
    items[w++] = it;
  }
  items.length = w;
}

function collect(it) {
  it.dead = true;
  const p = G.player;
  if (it.kind.startsWith('xp')) {
    xpCount--;
    combo++;
    comboT = 0.5;
    sfx('pickup', 1 + Math.min(combo, 24) * 0.04);
    p.gainXp(it.value);
  } else if (it.kind === 'cake') {
    const h = Math.min(p.maxHp - p.hp, 30 + p.maxHp * 0.15);
    p.hp += h;
    if (h >= 1) floater('+' + Math.round(h) + ' cake', p.x, 2.4, p.z, 'heal');
    burst(p.x, 1, p.z, 10, [0xff7fb6, 0xffffff], 4, 0.3, 0.6, 5);
    sfx('heart');
  } else if (it.kind === 'magnet') {
    vacuum();
    floater('MAGNET!', p.x, 2.6, p.z, 'gold');
    ring(p.x, p.z, 1, 30, 0.6, 0xff4d5e, 0.8);
    sfx('levelup');
  } else if (it.kind === 'gold') {
    G.goldThisRun++;
    floater('+1 🥕', p.x, 2.4, p.z, 'gold');
    sfx('gold');
  } else if (it.kind === 'chest') {
    G.openChest();
  } else if (it.kind === 'gift') {
    G.openGift?.();
  }
}

export function drawPickups() {
  for (const k in inst) inst[k].begin();
  for (const it of items) {
    if (it.dead) continue;
    const K = KINDS[it.kind];
    const big = it.kind === 'chest' || it.kind === 'cake' || it.kind === 'magnet' || it.kind === 'gift';
    const bob = Math.sin(it.t * 4) * 0.12 + (big ? 0.4 : 0.35);
    dummy.position.set(it.x, it.y + bob, it.z);
    dummy.rotation.set(big ? 0 : 0.5, it.t * (big ? 1.2 : 2.5), big ? 0 : 0.3);
    dummy.scale.setScalar(K.scale);
    inst[it.kind].push();
  }
  for (const k in inst) inst[k].end();
}
