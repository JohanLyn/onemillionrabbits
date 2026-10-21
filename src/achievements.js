import { G } from './core.js';
import { save, writeSave } from './save.js';
import { CHARS } from './player.js';
import { FUSIONS, MAX_WEAPONS } from './weapons.js';
import { MODS } from './chaos.js';
import { E } from './enemies.js';

// Per-run facts the achievements need that the game doesn't keep on its own.
export const run = { bosses: 0, goldens: 0, ults: 0, hurt: false, lowAt: null, unlocked: [], achGold: 0 };

const wins = () => Object.keys(CHARS).filter((id) => save.winsBy[id] > 0).length;

// test() runs against live state; progress() turns an achievement into a "3 / 5" bar on the trophy shelf.
export const ACHIEVEMENTS = [
  { id: 'first', emoji: '🐰', name: 'First Hop', desc: 'Defeat your first rabbit.', gold: 5, test: () => G.kills >= 1 },
  { id: 'k1000', emoji: '💥', name: 'Thousand Tails', desc: 'Defeat 1,000 rabbits in one run.', gold: 15, test: () => G.kills >= 1000 },
  { id: 'k10000', emoji: '🌋', name: 'Ten Thousand Tails', desc: 'Defeat 10,000 rabbits in one run.', gold: 60, test: () => G.kills >= 10000 },
  { id: 'wave5', emoji: '🌤️', name: 'Getting Warmer', desc: 'Reach wave 5.', gold: 10, test: () => G.wave >= 5 },
  { id: 'wave10', emoji: '🔟', name: 'Double Digits', desc: 'Survive wave 10.', gold: 30, test: () => G.wave >= 11 },
  { id: 'wave20', emoji: '🎖️', name: 'Meadow Veteran', desc: 'Survive wave 20.', gold: 60, test: () => G.wave >= 21 },
  { id: 'boss', emoji: '👑', name: 'Royal Pain', desc: 'Beat a boss.', gold: 25, test: () => run.bosses >= 1 },
  { id: 'boss3', emoji: '🗡️', name: 'Regicide Enthusiast', desc: 'Beat 3 bosses in one run.', gold: 50, test: () => run.bosses >= 3 },
  { id: 'fusion', emoji: '🧪', name: 'Mad Scientist', desc: 'Fuse two weapons.', gold: 25, test: () => G.weapons.some((w) => w.fused) },
  { id: 'cookbook', emoji: '📖', name: 'Cookbook Complete', desc: 'Cook every fusion at least once.', gold: 100, progress: () => [save.life.fusions.length, FUSIONS.length] },
  { id: 'loaded', emoji: '🎒', name: 'Fully Loaded', desc: 'Fill every weapon slot.', gold: 20, test: () => G.weapons.length >= MAX_WEAPONS },
  { id: 'born500', emoji: '🍼', name: 'Population Problem', desc: 'Let 500 babies be born in one run.', gold: 30, test: () => G.born >= 500 },
  { id: 'golden', emoji: '✨', name: 'Midas Touch', desc: 'Catch a golden bunny.', gold: 20, test: () => run.goldens >= 1 },
  { id: 'strike', emoji: '🛰️', name: 'Orbital Delivery', desc: 'Call in an Orbital Carrot Strike.', gold: 10, test: () => run.ults >= 1 },
  { id: 'untouch', emoji: '🫥', name: 'Untouchable', desc: 'Last 2 minutes without getting hit.', gold: 30, test: () => !run.hurt && G.runTime >= 120 },
  { id: 'whisker', emoji: '😰', name: 'By a Whisker', desc: 'Drop below 10% HP, then survive 30 more seconds.', gold: 15, test: () => run.lowAt !== null && G.runTime - run.lowAt >= 30 },
  { id: 'chaos', emoji: '🎡', name: 'Agent of Chaos', desc: 'Land on every Wheel of Chaos rule.', gold: 40, progress: () => [save.life.mods.length, MODS.length] },
  { id: 'shopper', emoji: '🛠️', name: 'Home Improvement', desc: 'Buy an upgrade in The Shed.', gold: 10, test: () => Object.keys(save.upgrades).length > 0 },
  { id: 'roster', emoji: '👥', name: 'Full Roster', desc: 'Unlock every survivor.', gold: 50, progress: () => [save.unlocked.length, Object.keys(CHARS).length] },
  { id: 'win', emoji: '🏆', name: 'One Million and Done', desc: 'Win a run.', gold: 200, test: () => save.victories >= 1 },
  { id: 'winall', emoji: '🌟', name: 'Every Survivor, Every Time', desc: 'Win with every survivor.', gold: 500, progress: () => [wins(), Object.keys(CHARS).length] },
];
for (const a of ACHIEVEMENTS) if (a.progress) a.test = () => { const [n, of] = a.progress(); return n >= of; };

let onUnlock = () => {};
export const setUnlockHandler = (fn) => (onUnlock = fn);

export function checkAchievements() {
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (save.ach[a.id] || !a.test()) continue;
    save.ach[a.id] = Date.now();
    save.gold += a.gold;
    run.unlocked.push(a);
    run.achGold += a.gold;
    changed = true;
    onUnlock(a);
  }
  if (changed) writeSave();
}

// ---------- watching the game for events (other systems don't announce them) ----------
let bossRef = null, lastHp = 0, lastBorn = 0, ultWasReady = false, lastFused = 0, lastCaught = 0;
const goldens = new Set();

export function resetRunTracking() {
  run.bosses = run.goldens = run.ults = run.achGold = 0;
  run.hurt = false;
  run.lowAt = null;
  run.unlocked = [];
  bossRef = null;
  lastCaught = 0;
  goldens.clear();
  lastHp = G.player.hp;
  lastBorn = 0;
  ultWasReady = false;
  lastFused = 0;
}

// Call once per playing tick. Returns the events seen this tick, e.g. ['hurt', 'boss'].
export function observe() {
  const ev = [];
  const p = G.player;
  if (p.hp < lastHp - 0.01) {
    run.hurt = true;
    ev.push(lastHp - p.hp >= 20 ? 'bighurt' : 'hurt');
  }
  lastHp = p.hp;
  if (p.hp > 0 && p.hp < p.maxHp * 0.1 && run.lowAt === null) run.lowAt = G.runTime;
  if (G.born > lastBorn) ev.push('born');
  lastBorn = G.born;

  const b = G.boss;
  // a queued boss can arrive in the same tick the last one died, so count the dead one first
  if (bossRef && !bossRef.alive) {
    bossRef = null;
    run.bosses++;
    save.life.bosses++;
    ev.push('bossdown');
  }
  if (b && b.alive && b !== bossRef) {
    bossRef = b;
    ev.push('boss');
  }

  // golden bunnies: remember them while alive, and tell a catch (killed) from an escape (timer ran out)
  if (G.frame % 4 === 0) {
    for (const e of E) {
      if (e.type === 'golden' && e.alive && !goldens.has(e)) {
        goldens.add(e);
        ev.push('golden');
      }
    }
  }
  for (const e of goldens) if (!e.alive || e.type !== 'golden') goldens.delete(e);
  const caught = G.goldenCaught || 0;
  if (caught < lastCaught) lastCaught = 0; // a new run started
  while (lastCaught < caught) {
    lastCaught++;
    run.goldens++;
    save.life.goldens++;
    ev.push('caught');
  }

  const ready = G.ultCharge >= G.stats.ultCost;
  if (ready && !ultWasReady) ev.push('ultready');
  ultWasReady = ready;

  const fused = G.weapons.filter((w) => w.fused);
  if (fused.length !== lastFused) {
    lastFused = fused.length;
    for (const w of fused) if (!save.life.fusions.includes(w.id)) save.life.fusions.push(w.id);
  }
  return ev;
}

// The wheel picked a rule: count it toward Agent of Chaos.
export function sawMod(id) {
  if (!save.life.mods.includes(id)) save.life.mods.push(id);
}
export function firedUlt() {
  run.ults++;
}
