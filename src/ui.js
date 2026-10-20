import { G, fmt, fmtTime } from './core.js';
import { save, writeSave, upgradeLevel } from './save.js';
import { CHARS } from './player.js';
import { WEAPONS, FUSIONS, weaponInfo } from './weapons.js';
import { PASSIVES, SHOP, shopCost, describe } from './upgrades.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'shop', 'howto', 'levelup', 'wheel', 'pause', 'gameover', 'loading'];

export function show(...ids) {
  for (const s of SCREENS) $(s).hidden = !ids.includes(s);
}
export const hud = (on) => ($('hud').hidden = !on);

// ---------- title ----------
export function renderMenu(onSelect) {
  $('goldMenu').textContent = fmt(save.gold);
  const wrap = $('chars');
  wrap.innerHTML = '';
  for (const id in CHARS) {
    const c = CHARS[id];
    const owned = save.unlocked.includes(id);
    const b = document.createElement('button');
    b.className = 'char' + (save.char === id ? ' sel' : '') + (owned ? '' : ' locked');
    b.innerHTML = `<span class="em">${c.emoji}</span><span class="nm">${c.name}</span>
      <span class="wp">${WEAPONS[c.weapon].emoji} ${WEAPONS[c.weapon].name}</span>
      <span class="ds">${c.perk}</span>
      ${owned ? '' : `<span class="price">🥕 ${c.price}</span>`}`;
    b.onclick = () => onSelect(id);
    wrap.appendChild(b);
  }
  const best = save.best;
  $('bestLine').textContent = best.kills ? `Best run: ${fmt(best.kills)} rabbits · wave ${best.wave} · ${fmtTime(best.time)}` : '';
  $('muteBtn').textContent = save.muted ? '🔇' : '🔊';
}

export function renderShop(onBuy) {
  $('goldShop').textContent = fmt(save.gold);
  const list = $('shopList');
  list.innerHTML = '';
  for (const id in SHOP) {
    const s = SHOP[id];
    const lv = upgradeLevel(id);
    const maxed = lv >= s.max;
    const cost = shopCost(id);
    const el = document.createElement('div');
    el.className = 'shopitem';
    el.innerHTML = `<span class="em">${s.emoji}</span>
      <div class="info"><div class="nm">${s.name}</div><div class="ds">${s.desc}</div>
      <div class="pips">${Array.from({ length: s.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>`;
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = maxed ? 'MAXED' : `🥕 ${cost}`;
    b.disabled = maxed || save.gold < cost;
    b.onclick = () => onBuy(id);
    el.appendChild(b);
    list.appendChild(el);
  }
}

export function renderHow() {
  $('recipes').innerHTML = FUSIONS.map((f) => {
    const a = WEAPONS[f.a], b = WEAPONS[f.b];
    return `<div class="recipe"><span>${a.emoji} ${a.name}</span><span>+</span><span>${b.emoji} ${b.name}</span><span>=</span><span class="res">${f.emoji} ${f.name}</span></div>`;
  }).join('');
}

// ---------- HUD ----------
const last = {};
function set(id, v, prop = 'textContent') {
  if (last[id] === v) return;
  last[id] = v;
  $(id)[prop] = v;
}
export function resetHudCache() {
  for (const k in last) delete last[k];
}

export function updateHud() {
  const p = G.player;
  const xpPct = `${Math.min(100, (p.xp / p.xpNext) * 100).toFixed(1)}%`;
  if (last.xpPct !== xpPct) {
    last.xpPct = xpPct;
    $('xpFill').style.width = xpPct;
  }
  set('lvl', `LV ${p.level}`);
  const hpPct = `${((p.hp / p.maxHp) * 100).toFixed(1)}%`;
  if (last.hpPct !== hpPct) {
    last.hpPct = hpPct;
    $('hpFill').style.width = hpPct;
  }
  set('hpText', `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`);
  set('kills', fmt(G.kills));
  set('born', fmt(G.born));
  set('remaining', fmt(G.remaining));
  const up = G.bornFlash > 0;
  if (last.up !== up) {
    last.up = up;
    $('remaining').classList.toggle('up', up);
  }
  set('wave', `WAVE ${G.wave}`);
  set('timer', fmtTime(G.runTime));
  const modTxt = G.mod ? `${G.mod.emoji} ${G.mod.name}` : '';
  if (last.mod !== modTxt) {
    last.mod = modTxt;
    $('modChip').hidden = !modTxt;
    $('modChip').textContent = modTxt;
  }
  const b = G.boss;
  const bossOn = !!(b && b.alive);
  if (last.bossOn !== bossOn) {
    last.bossOn = bossOn;
    $('bossbar').hidden = !bossOn;
    if (bossOn) $('bossName').textContent = b.name;
  }
  if (bossOn) $('bossFill').style.width = `${Math.max(0, (b.hp / b.maxHp) * 100).toFixed(1)}%`;
  const k = Math.min(1, G.ultCharge / G.stats.ultCost);
  const off = (276.5 * (1 - k)).toFixed(1);
  if (last.ult !== off) {
    last.ult = off;
    $('ultRing').style.strokeDashoffset = off;
    $('ultBtn').classList.toggle('ready', k >= 1);
  }
  const hurtOp = Math.max(0, G.hurtFlash || 0) * 2.5;
  const hp = p.hp / p.maxHp;
  const op = Math.min(1, hurtOp + (hp < 0.3 ? 0.35 + Math.sin(G.time * 6) * 0.15 : 0)).toFixed(2);
  if (last.hurt !== op) {
    last.hurt = op;
    $('hurt').style.opacity = op;
  }
}

export function renderLoadout() {
  const w = G.weapons.map((x) => {
    const info = weaponInfo(x.id);
    return `<span class="slot${x.fused ? ' fused' : ''}" title="${info.name}">${info.emoji}<i>${x.fused ? '★' : x.level}</i></span>`;
  }).join('');
  const p = G.passives.map((x) => `<span class="slot passive" title="${PASSIVES[x.id].name}">${PASSIVES[x.id].emoji}</span>`).join('');
  $('loadout').innerHTML = `<div class="lrow">${w}</div><div class="lrow">${p}</div>`;
}

// ---------- level up ----------
export function showLevelUp(opts, onPick, onReroll, title = 'LEVEL UP!') {
  $('luTitle').textContent = title;
  const wrap = $('cards');
  wrap.innerHTML = '';
  opts.forEach((o, i) => {
    const d = describe(o);
    const c = document.createElement('button');
    c.className = 'card' + (d.fusion ? ' fusion' : '');
    c.innerHTML = `<span class="em">${d.emoji}</span><span class="txt"><span class="kind">${d.kind}</span><span class="nm">${d.name}</span>
      <span class="lv${d.isNew ? ' new' : ''}">${d.lv}</span><span class="ds">${d.desc}</span></span>`;
    c.onclick = () => onPick(o);
    c.dataset.key = String(i + 1);
    wrap.appendChild(c);
  });
  $('rerolls').textContent = G.rerolls;
  $('rerollBtn').disabled = G.rerolls <= 0;
  $('rerollBtn').onclick = onReroll;
  show('levelup');
}

// ---------- pause / game over ----------
export function showPause() {
  $('pauseBuild').innerHTML = [
    ...G.weapons.map((w) => {
      const i = weaponInfo(w.id);
      return `<span>${i.emoji} ${i.name} ${w.fused ? '★' : 'Lv' + w.level}</span>`;
    }),
    ...G.passives.map((p) => `<span>${PASSIVES[p.id].emoji} ${PASSIVES[p.id].name} Lv${p.level}</span>`),
  ].join('');
  $('pauseMute').textContent = save.muted ? 'SOUND: OFF' : 'SOUND: ON';
  show('pause');
}

export function showGameOver(r) {
  $('goTitle').textContent = r.won ? 'YOU DID IT?!' : 'YOU GOT BUNNIED';
  $('goSub').textContent = r.won ? 'All one million rabbits. You absolute legend.' : r.quip;
  $('goStats').innerHTML = [
    ['Rabbits defeated', fmt(G.kills)],
    ['Survived', fmtTime(G.runTime)],
    ['Wave reached', G.wave],
    ['Babies born', fmt(G.born)],
  ].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  const entries = Object.entries(G.damageBy).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = entries[0]?.[1] || 1;
  $('goWeapons').innerHTML = entries.map(([id, v]) => {
    const info = id === 'ult' ? { emoji: '🥕', name: 'Carrot Strike' } : id === 'bomb' ? { emoji: '💣', name: 'Bomb chain reactions' } : weaponInfo(id) || { emoji: '❓', name: id };
    return `<div class="dmgrow"><span>${info.emoji}</span><span class="bar" style="width:${Math.max(4, (v / max) * 100)}%"></span><span class="n">${fmt(v)}</span></div>`;
  }).join('');
  $('goGold').textContent = fmt(r.gold);
  show('gameover');
}

export function bindButtons(h) {
  $('playBtn').onclick = h.play;
  $('shopBtn').onclick = () => h.screen('shop');
  $('howBtn').onclick = () => h.screen('howto');
  $('muteBtn').onclick = h.mute;
  $('pauseMute').onclick = h.mute;
  document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => h.screen('menu')));
  $('pauseBtn').onclick = h.pause;
  $('resumeBtn').onclick = h.resume;
  $('quitBtn').onclick = h.quit;
  $('retryBtn').onclick = h.play;
  $('menuBtn').onclick = () => h.screen('menu');
  $('ultBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    h.ult();
  });
  $('wheel').addEventListener('pointerdown', h.skipWheel);
  document.addEventListener('click', (e) => {
    if (e.target.closest('button')) sfx('tick');
  });
}

export function onSaveChange() {
  writeSave();
}
