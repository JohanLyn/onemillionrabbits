import { G, VERSION, fmt, fmtTime } from './core.js';
import { save, upgradeLevel } from './save.js';
import { CHARS } from './player.js';
import { WEAPONS, FUSIONS, weaponInfo } from './weapons.js';
import { PASSIVES, SHOP, shopCost, describe } from './upgrades.js';
import { ACHIEVEMENTS } from './achievements.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'shop', 'howto', 'trophies', 'settings', 'credits', 'levelup', 'wheel', 'pause', 'gameover', 'victory', 'loading'];
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled])';

export function show(...ids) {
  setScreens(ids);
  if (ids[0] && keyboardMode()) focusFirst($(ids[0]));
}
function setScreens(ids) {
  for (const s of SCREENS) $(s).hidden = !ids.includes(s);
  // HUD tips step aside while a menu covers the run
  document.body.classList.toggle('overlay', ids.length > 0);
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
    const wins = save.winsBy[id] || 0;
    const b = document.createElement('button');
    b.className = 'char' + (save.char === id ? ' sel' : '') + (owned ? '' : ' locked') + (!owned && save.gold >= c.price ? ' afford' : '');
    b.setAttribute('aria-pressed', String(save.char === id));
    b.innerHTML = `<span class="em">${c.emoji}</span><span class="nm">${c.name}</span>
      <span class="wp">${WEAPONS[c.weapon].emoji} ${WEAPONS[c.weapon].name}</span>
      <span class="ds">${c.perk}</span>
      ${owned ? '' : `<span class="price">🥕 ${c.price}</span>`}
      ${wins ? `<span class="won" title="Victories">🏆${wins > 1 ? wins : ''}</span>` : ''}`;
    b.onclick = () => onSelect(id);
    wrap.appendChild(b);
  }
  // on phones the survivors scroll sideways: keep the picked one in view
  const sel = wrap.querySelector('.sel');
  if (sel && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = sel.offsetLeft - (wrap.clientWidth - sel.offsetWidth) / 2;
  const best = save.best;
  const wins = save.victories ? ` · ${save.victories} ${save.victories === 1 ? 'win' : 'wins'}` : '';
  $('bestLine').textContent = best.kills ? `Best run: ${fmt(best.kills)} rabbits · wave ${best.wave} · ${fmtTime(best.time)}${wins}` : '';
  $('muteBtn').textContent = save.muted ? '🔇' : '🔊';
  $('verBadge').textContent = 'v' + VERSION.replace(/-beta$/, '');
  $('verLine').textContent = 'v' + VERSION;
  const got = ACHIEVEMENTS.filter((a) => save.ach[a.id]).length;
  $('trophyPill').textContent = `${got}/${ACHIEVEMENTS.length}`;
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
    b.setAttribute('aria-label', maxed ? `${s.name}: maxed` : `Buy ${s.name} for ${cost} golden carrots`);
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

export function renderTrophies() {
  const got = ACHIEVEMENTS.filter((a) => save.ach[a.id]).length;
  $('trophyCount').textContent = `${got} / ${ACHIEVEMENTS.length}`;
  $('trophyList').innerHTML = ACHIEVEMENTS.map((a) => {
    const on = !!save.ach[a.id];
    let bar = '';
    if (!on && a.progress) {
      const [n, of] = a.progress();
      bar = `<span class="prog"><i style="width:${Math.min(100, (n / of) * 100).toFixed(0)}%"></i><em>${Math.min(n, of)} / ${of}</em></span>`;
    }
    return `<div class="trophy${on ? ' on' : ''}"><span class="em">${on ? a.emoji : '🔒'}</span>
      <span class="tx"><b>${a.name}</b><span>${a.desc}</span>${bar}</span><span class="rw">${on ? '✓' : '🥕 ' + a.gold}</span></div>`;
  }).join('');
  const l = save.life;
  $('lifeStats').innerHTML = [
    ['Runs', fmt(save.runs || 0)],
    ['Victories', fmt(save.victories || 0)],
    ['Rabbits defeated', fmt(l.kills)],
    ['Bosses beaten', fmt(l.bosses)],
    ['Golden bunnies caught', fmt(l.goldens)],
    ['Longest run', fmtTime(save.best.time)],
  ].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
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

// 3-2-1 after unpausing. '' hides it.
export function setCountdown(txt) {
  const el = $('countdown');
  if (el.textContent === txt) return;
  el.textContent = txt;
  el.classList.remove('tick');
  if (!txt) return;
  void el.offsetWidth;
  el.classList.add('tick');
}

// Trophy toasts, one at a time: under the HUD's top bar in a run, at the top of the screen on menus.
const toastQueue = [];
let toastGen = 0;
export function trophyToast(a) {
  toastQueue.push(a);
  if (toastQueue.length === 1) nextToast();
}
// the end-of-run screens list the run's trophies themselves, so leftovers are dropped
export function clearToasts() {
  toastGen++;
  toastQueue.length = 0;
  document.querySelectorAll('.toast').forEach((el) => el.remove());
}
function nextToast() {
  const a = toastQueue[0];
  if (!a) return;
  const gen = toastGen;
  const box = $('hud').hidden ? $('menuToasts') : $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="em">${a.emoji}</span><span class="tx"><small>Trophy unlocked</small><b>${a.name}</b></span><span class="gp">+${a.gold} 🥕</span>`;
  box.appendChild(el);
  sfx('gold');
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => {
    el.remove();
    if (gen !== toastGen) return;
    toastQueue.shift();
    nextToast();
  }, 3000);
}

// ---------- level up ----------
export function showLevelUp(opts, onPick, onReroll, title = 'LEVEL UP!') {
  $('luTitle').textContent = title;
  const wrap = $('cards');
  wrap.innerHTML = '';
  // ignore taps for a moment so a thumb that was steering doesn't pick a card by accident
  const openedAt = performance.now();
  opts.forEach((o, i) => {
    const d = describe(o);
    const c = document.createElement('button');
    c.className = 'card' + (d.fusion ? ' fusion' : '');
    c.innerHTML = `<span class="em">${d.emoji}</span><span class="txt"><span class="kind">${d.kind}</span><span class="nm">${d.name}</span>
      <span class="lv${d.isNew ? ' new' : ''}">${d.lv}</span><span class="ds">${d.desc}</span></span>
      ${G.touch ? '' : `<kbd>${i + 1}</kbd>`}`;
    c.onclick = () => performance.now() - openedAt > 350 && onPick(o);
    c.dataset.key = String(i + 1);
    wrap.appendChild(c);
  });
  $('rerolls').textContent = G.rerolls;
  $('rerollBtn').disabled = G.rerolls <= 0;
  $('rerollBtn').onclick = onReroll;
  setScreens(['levelup']);
}

// ---------- pause / game over / victory ----------
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

// prev: the best run before this one, so we can shout about records
function statTiles(prev) {
  const rows = [
    ['Rabbits defeated', fmt(G.kills), prev && G.kills > prev.kills],
    ['Survived', fmtTime(G.runTime), prev && G.runTime > prev.time],
    ['Wave reached', G.wave, prev && G.wave > prev.wave],
    ['Babies born', fmt(G.born), prev && G.born > prev.born],
  ];
  return rows.map(([k, v, rec]) => `<div class="${rec ? 'rec' : ''}"><b>${v}</b><span>${k}</span>${rec ? '<em>NEW BEST!</em>' : ''}</div>`).join('');
}

function extras(r) {
  const out = r.unlocked.slice(0, 4).map((a) => `<span class="xchip trophy-chip">${a.emoji} ${a.name}</span>`);
  if (r.unlocked.length > 4) out.push(`<span class="xchip trophy-chip">🏆 +${r.unlocked.length - 4} more</span>`);
  const c = r.afford;
  if (c.length === 1) out.push(`<span class="xchip unlock-chip">🔓 You can now afford ${c[0].emoji} ${c[0].name}!</span>`);
  else if (c.length > 1) out.push(`<span class="xchip unlock-chip">🔓 ${c.length} new survivors in reach: ${c.map((x) => x.emoji).join(' ')}</span>`);
  return out.join('');
}

function breakdown(b) {
  return [
    b.pickups && `${b.pickups} picked up`,
    b.kills && `${b.kills} for rabbits`,
    b.waves && `${b.waves} for waves`,
    b.victory && `${b.victory} victory bonus`,
    b.trophies && `${b.trophies} from trophies`,
  ].filter(Boolean).join(' · ');
}

function damageTable() {
  const entries = Object.entries(G.damageBy).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = entries[0]?.[1] || 1;
  return entries.map(([id, v]) => {
    const info = id === 'ult' ? { emoji: '🥕', name: 'Carrot Strike' } : id === 'bomb' ? { emoji: '💣', name: 'Bomb chain reactions' } : weaponInfo(id) || { emoji: '❓', name: id };
    return `<div class="dmgrow" title="${info.name}"><span>${info.emoji}</span><span class="bar" style="width:${Math.max(4, (v / max) * 100)}%"></span><span class="n">${fmt(v)}</span></div>`;
  }).join('');
}

export function showGameOver(r) {
  $('goTitle').textContent = r.quit ? 'YOU GAVE UP' : 'YOU GOT BUNNIED';
  $('goSub').textContent = r.quit ? 'The rabbits accept your surrender. They will not be gracious.' : r.quip;
  $('goStats').innerHTML = statTiles(r.prev);
  $('goExtra').innerHTML = extras(r);
  $('goWeapons').innerHTML = damageTable();
  $('goGold').textContent = fmt(r.gold);
  $('goBreak').textContent = breakdown(r.breakdown);
  show('gameover');
}

export function showVictory(r) {
  const c = CHARS[G.player.char];
  $('vSub').textContent = `${c.emoji} ${c.name} saved the meadow. Victory #${save.victories}.`;
  $('vStats').innerHTML = statTiles(r.prev);
  $('vExtra').innerHTML = extras(r);
  $('vGold').textContent = fmt(r.gold);
  $('vBreak').textContent = breakdown(r.breakdown);
  confetti();
  show('victory');
}

function confetti() {
  const box = $('confetti');
  const bits = ['🥕', '🐇', '🎉', '⭐', '🏆', '💛'];
  const cols = ['#ff8a1f', '#ffc83d', '#ff6fa8', '#59d9ff', '#5cc44a', '#fffdf7'];
  let html = '';
  for (let i = 0; i < 46; i++) {
    const left = (Math.random() * 100).toFixed(1), delay = (Math.random() * 2.5).toFixed(2), dur = (2.6 + Math.random() * 2.4).toFixed(2);
    const style = `left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s`;
    html += i % 3 === 0
      ? `<span class="bit em" style="${style}">${bits[i % bits.length]}</span>`
      : `<span class="bit" style="${style};background:${cols[i % cols.length]}"></span>`;
  }
  box.innerHTML = html;
}

// ---------- in-page confirm (window.confirm is blocked in some hosts) ----------
let cfDone = null;
export function confirmBox({ title, text, yes = 'YES', no = 'NO', emoji = '🐇' }) {
  if (cfDone) cfDone(false);
  $('cfTitle').textContent = title;
  $('cfText').textContent = text;
  $('cfYes').textContent = yes;
  $('cfNo').textContent = no;
  $('cfEm').textContent = emoji;
  const back = document.activeElement;
  $('confirm').hidden = false;
  // the safe answer gets focus, so a stray Enter never wipes anything
  if (keyboardMode()) $('cfNo').focus();
  return new Promise((res) => {
    cfDone = (v) => {
      cfDone = null;
      $('confirm').hidden = true;
      if (back && keyboardMode()) back.focus?.();
      res(v);
    };
  });
}
export const confirmOpen = () => !!cfDone;

// ---------- keyboard navigation of menus ----------
const keyboardMode = () => document.body.classList.contains('kbd');
const visible = (el) => el.getClientRects().length > 0;

function topLayer() {
  if (!$('confirm').hidden) return $('confirm');
  for (const id of SCREENS) if (id !== 'loading' && !$(id).hidden) return $(id);
  return null;
}
function focusFirst(layer) {
  const el = layer.querySelector('[data-autofocus]') || [...layer.querySelectorAll(FOCUSABLE)].find(visible);
  el?.focus({ preventScroll: false });
}
// Spatial navigation: jump to the nearest control in the arrow's direction.
function moveFocus(layer, dx, dy) {
  const els = [...layer.querySelectorAll(FOCUSABLE)].filter(visible);
  const cur = document.activeElement;
  if (!els.includes(cur)) return focusFirst(layer);
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const q = el.getBoundingClientRect();
    const ox = q.left + q.width / 2 - cx, oy = q.top + q.height / 2 - cy;
    const along = ox * dx + oy * dy;
    if (along <= 4) continue;
    const score = along + Math.abs(ox * dy - oy * dx) * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  // nothing that way (say, buttons that wrapped onto the next row): step through them in order instead
  best = best || els[els.indexOf(cur) + (dx + dy > 0 ? 1 : -1)];
  if (best) {
    best.focus();
    best.scrollIntoView({ block: 'nearest' });
  }
}

const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
function initNav() {
  addEventListener('keydown', (e) => {
    if (DIRS[e.key] || e.key === 'Tab' || e.key === 'Enter') document.body.classList.add('kbd');
    const layer = topLayer();
    if (!layer) return;
    if (e.key === 'Escape') {
      const esc = layer.querySelector('[data-esc]');
      if (esc) {
        e.preventDefault();
        esc.click();
      }
      return;
    }
    const d = DIRS[e.key];
    if (!d) return;
    const cur = document.activeElement;
    // sliders keep left/right for themselves
    if (cur?.type === 'range' && d[1] === 0) return;
    e.preventDefault();
    moveFocus(layer, d[0], d[1]);
  });
  addEventListener('pointerdown', () => document.body.classList.remove('kbd'));
}

export function bindButtons(h) {
  $('playBtn').onclick = h.play;
  $('shopBtn').onclick = () => h.screen('shop');
  $('howBtn').onclick = () => h.screen('howto');
  $('trophyBtn').onclick = () => h.screen('trophies');
  $('creditsBtn').onclick = () => h.screen('credits');
  $('settingsBtn').onclick = () => h.settings('menu');
  $('pauseSettings').onclick = () => h.settings('pause');
  $('muteBtn').onclick = h.mute;
  $('pauseMute').onclick = h.mute;
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.dataset.esc = '';
    b.onclick = () => h.screen('menu');
  });
  $('pauseBtn').onclick = h.pause;
  $('resumeBtn').onclick = h.resume;
  $('resumeBtn').dataset.esc = '';
  $('quitBtn').onclick = h.quit;
  $('retryBtn').onclick = h.play;
  $('menuBtn').onclick = () => h.screen('menu');
  $('vRetry').onclick = h.play;
  $('vMenu').onclick = () => h.screen('menu');
  $('cfYes').onclick = () => cfDone?.(true);
  $('cfNo').onclick = () => cfDone?.(false);
  $('cfNo').dataset.esc = '';
  $('ultBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    h.ult();
  });
  $('wheel').addEventListener('pointerdown', h.skipWheel);
  // let the wave banner know where the tips end, so it can sit below them
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      const t = $('toasts');
      $('hud').style.setProperty('--tb', t.offsetHeight ? `${t.getBoundingClientRect().bottom}px` : '0px');
    }).observe($('toasts'));
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('button, a.btn')) sfx('tick');
  });
  initNav();
}
