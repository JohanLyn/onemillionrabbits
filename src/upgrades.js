import { G, ULT_COST, pick } from './core.js';
import { CHARS } from './player.js';
import { WEAPONS, FUSIONS, MAX_LEVEL, MAX_WEAPONS, addWeapon, fusionOptions, fuse, weaponInfo } from './weapons.js';
import { upgradeLevel } from './save.js';
import { banner, burst, floater, sparkle } from './fx.js';
import { sfx } from './audio.js';
import { renderLoadout } from './ui.js';

// ---------- in-run trinkets ----------
export const PASSIVES = {
  espresso: { name: 'Triple Espresso', emoji: '☕', desc: '+8% move speed', max: 5, apply: (s, l) => (s.speed += 0.08 * l) },
  cake: { name: 'Carrot Cake', emoji: '🎂', desc: '+20 max HP, slowly heal', max: 5, apply: (s, l) => { s.maxHp += 20 * l; s.regen += 0.3 * l; } },
  magnet: { name: 'Fridge Magnet', emoji: '🧲', desc: '+25% pickup range', max: 5, apply: (s, l) => (s.magnet += 0.25 * l) },
  hat: { name: 'Ridiculously Large Hat', emoji: '🎩', desc: '+10% area of everything', max: 5, apply: (s, l) => (s.area += 0.1 * l) },
  timer: { name: 'Overclocked Egg Timer', emoji: '⏲️', desc: '-7% weapon cooldowns', max: 5, apply: (s, l) => (s.cooldown -= 0.07 * l) },
  spinach: { name: 'Suspicious Spinach', emoji: '🥬', desc: '+12% damage', max: 5, apply: (s, l) => (s.damage += 0.12 * l) },
  sock: { name: 'Lucky Sock', emoji: '🧦', desc: '+5% crit chance, more luck', max: 5, apply: (s, l) => { s.crit += 0.05 * l; s.luck += 0.15 * l; } },
  foil: { name: 'Tin Foil Armor', emoji: '🛡️', desc: '-7% damage taken', max: 5, apply: (s, l) => (s.armor += 0.07 * l) },
  megaphone: { name: 'Megaphone of Excess', emoji: '📢', desc: '+1 projectile on every weapon', max: 2, apply: (s, l) => (s.amount += l) },
  book: { name: 'Self-Help Book', emoji: '📕', desc: '+10% XP from carrots', max: 5, apply: (s, l) => (s.xpGain += 0.1 * l) },
};
export const MAX_PASSIVES = 6;

// ---------- The Shed: permanent upgrades bought with golden carrots ----------
export const SHOP = {
  hp: { name: 'Thick Overalls', emoji: '👖', desc: '+10 max HP', max: 5, cost: 30 },
  dmg: { name: 'Gym Membership', emoji: '💪', desc: '+5% damage', max: 5, cost: 40 },
  spd: { name: 'Running Shoes', emoji: '👟', desc: '+4% move speed', max: 5, cost: 30 },
  mag: { name: 'Pocket Magnet', emoji: '🧲', desc: '+10% pickup range', max: 5, cost: 25 },
  xp: { name: 'Rabbit Studies Degree', emoji: '🎓', desc: '+6% XP', max: 5, cost: 35 },
  luck: { name: 'Four-Leaf Clover', emoji: '🍀', desc: 'More crits, gold and golden bunnies', max: 5, cost: 40 },
  reroll: { name: 'Loaded Dice', emoji: '🎲', desc: '+1 level-up reroll per run', max: 3, cost: 60 },
  ult: { name: 'Carrot Satellite Uplink', emoji: '🛰️', desc: 'Carrot Strike charges 15% faster', max: 3, cost: 50 },
  revive: { name: 'Spare Life', emoji: '🪦', desc: 'Get back up once per run', max: 1, cost: 250 },
};
export const shopCost = (id) => SHOP[id].cost * (upgradeLevel(id) + 1);

export function computeStats() {
  const c = CHARS[G.player.char];
  const u = upgradeLevel;
  const s = {
    damage: 1 + (c.mods.damage || 0) + 0.05 * u('dmg'),
    area: 1 + (c.mods.area || 0),
    cooldown: 1 - (c.mods.cooldown || 0),
    amount: 0,
    speed: c.speed * (1 + 0.04 * u('spd')),
    magnet: 1 + (c.mods.magnet || 0) + 0.1 * u('mag'),
    regen: c.mods.regen || 0,
    armor: 0,
    crit: 0.05 + 0.02 * u('luck'),
    luck: 1 + 0.1 * u('luck'),
    xpGain: 1 + 0.06 * u('xp'),
    maxHp: c.hp + 10 * u('hp'),
    ultCost: Math.round(ULT_COST * (1 - 0.15 * u('ult'))),
  };
  for (const p of G.passives) PASSIVES[p.id].apply(s, p.level);
  s.cooldown = Math.max(0.35, s.cooldown);
  s.armor = Math.min(0.6, s.armor);
  G.stats = s;
  const pl = G.player;
  if (s.maxHp > pl.maxHp) pl.hp += s.maxHp - pl.maxHp;
  pl.maxHp = s.maxHp;
  pl.hp = Math.min(pl.hp, pl.maxHp);
}

// ---------- level-up cards ----------
function consumed() {
  const set = new Set();
  for (const w of G.weapons) {
    if (!w.fused) continue;
    const f = FUSIONS.find((x) => x.id === w.id);
    set.add(f.a);
    set.add(f.b);
  }
  return set;
}

export function rollOptions() {
  const opts = [];
  for (const f of fusionOptions()) opts.push({ kind: 'fusion', f, w: 0 });
  const pool = [];
  const gone = consumed();
  for (const w of G.weapons) if (!w.fused && w.level < MAX_LEVEL) pool.push({ kind: 'wup', id: w.id, w: 3 });
  if (G.weapons.length < MAX_WEAPONS) {
    for (const id in WEAPONS) if (!G.weapons.some((w) => w.id === id) && !gone.has(id)) pool.push({ kind: 'wnew', id, w: 2.2 });
  }
  for (const p of G.passives) if (p.level < PASSIVES[p.id].max) pool.push({ kind: 'pup', id: p.id, w: 2 });
  if (G.passives.length < MAX_PASSIVES) {
    for (const id in PASSIVES) if (!G.passives.some((p) => p.id === id)) pool.push({ kind: 'pnew', id, w: 1.4 });
  }
  const want = G.stats.luck >= 1.6 ? 4 : 3;
  while (opts.length < want && pool.length) {
    let total = 0;
    for (const o of pool) total += o.w;
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) if ((r -= pool[idx].w) <= 0) break;
    opts.push(pool.splice(idx, 1)[0]);
  }
  // everything maxed (or nearly): pad with snacks so there's always a real choice
  if (opts.length < 2) opts.push({ kind: 'heal' });
  if (opts.length < 2) opts.push({ kind: 'gold' });
  G.lastOptions = opts.slice(0, Math.max(want, opts.filter((o) => o.kind === 'fusion').length));
  return G.lastOptions;
}

export function describe(o) {
  if (o.kind === 'fusion') {
    const a = weaponInfo(o.f.a), b = weaponInfo(o.f.b);
    return { emoji: o.f.emoji, name: o.f.name, lv: 'FUSION', kind: `${a.emoji} ${a.name} + ${b.emoji} ${b.name}`, desc: o.f.desc, fusion: true };
  }
  if (o.kind === 'wnew') {
    const d = WEAPONS[o.id];
    return { emoji: d.emoji, name: d.name, lv: 'NEW', kind: 'weapon', desc: d.desc, isNew: true };
  }
  if (o.kind === 'wup') {
    const d = WEAPONS[o.id], w = G.weapons.find((x) => x.id === o.id);
    const fuseHint = w.level + 1 === MAX_LEVEL ? fusionHint(o.id) : '';
    return { emoji: d.emoji, name: d.name, lv: `LV ${w.level} → ${w.level + 1}`, kind: 'weapon', desc: d.ups[w.level - 1] + fuseHint };
  }
  if (o.kind === 'pnew' || o.kind === 'pup') {
    const d = PASSIVES[o.id], p = G.passives.find((x) => x.id === o.id);
    return { emoji: d.emoji, name: d.name, lv: p ? `LV ${p.level} → ${p.level + 1}` : 'NEW', kind: 'trinket', desc: d.desc, isNew: !p };
  }
  if (o.kind === 'heal') return { emoji: '🥗', name: 'Carrot Salad', lv: 'SNACK', kind: 'food', desc: 'Heal 40 HP' };
  return { emoji: '🥕', name: 'Golden Carrots', lv: 'BONUS', kind: 'loot', desc: '+3 golden carrots' };
}

function fusionHint(id) {
  const f = FUSIONS.find((x) => x.a === id || x.b === id);
  if (!f) return '';
  const other = weaponInfo(f.a === id ? f.b : f.a);
  return ` · Max it with ${other.name} to fuse.`;
}

export function applyOption(o) {
  if (o.kind === 'fusion') fuse(o.f);
  else if (o.kind === 'wnew') addWeapon(o.id);
  else if (o.kind === 'wup') G.weapons.find((x) => x.id === o.id).level++;
  else if (o.kind === 'pnew') G.passives.push({ id: o.id, level: 1 });
  else if (o.kind === 'pup') G.passives.find((x) => x.id === o.id).level++;
  else if (o.kind === 'heal') G.player.hp = Math.min(G.player.maxHp, G.player.hp + 40);
  else if (o.kind === 'gold') G.goldThisRun += 3;
  computeStats();
}

// Boss chest: fuse if you can, otherwise a pile of free upgrades.
export function openChest() {
  const f = fusionOptions()[0];
  const p = G.player;
  burst(p.x, 1.5, p.z, 30, [0xffc83d, 0xffffff, 0xff6fa8], 8, 0.4, 1, 10);
  sparkle(p.x, 1, p.z, 12);
  if (f) {
    fuse(f);
    computeStats();
    renderLoadout();
    return;
  }
  const got = [];
  for (let i = 0; i < 3; i++) got.push(freeLevel(2));
  G.goldThisRun += 5;
  computeStats();
  renderLoadout();
  banner('TREASURE CHEST!', got.join('  ·  ') + '  ·  🥕 +5');
  sfx('fanfare');
}

// One free level: a weapon if any can still grow, else a trinket, else golden carrots.
function freeLevel(gold) {
  const ups = G.weapons.filter((w) => !w.fused && w.level < MAX_LEVEL);
  if (ups.length) {
    const w = pick(ups);
    w.level++;
    return `${weaponInfo(w.id).emoji} Lv${w.level}`;
  }
  const ps = G.passives.filter((p) => p.level < PASSIVES[p.id].max);
  if (ps.length) {
    const p = pick(ps);
    p.level++;
    return `${PASSIVES[p.id].emoji} Lv${p.level}`;
  }
  G.goldThisRun += gold;
  return `🥕 +${gold}`;
}

// Elite present: a single free level-up and a golden carrot.
export function openGift() {
  const p = G.player;
  const got = freeLevel(2);
  G.goldThisRun += 1;
  computeStats();
  renderLoadout();
  burst(p.x, 1.5, p.z, 18, [0xc77dff, 0xffe14d, 0xffffff], 6, 0.35, 0.8, 8);
  floater(`🎁 ${got}`, p.x, 3, p.z, 'gold');
  sfx('levelup');
}
G.openGift = openGift;
