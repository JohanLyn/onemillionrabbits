import { G } from './core.js';
import { save, writeSave } from './save.js';
import { input } from './input.js';

// First-run coaching: each tip shows once, the first time its moment comes up.
// HUD tips pop up as a card under the top bar; level-up and wheel tips sit inside those screens.
const TIPS = {
  move: { em: '🕹️', keys: 'Move with <b>WASD</b> or the <b>arrow keys</b>.', touch: '<b>Drag anywhere</b> to move.', until: 'moved' },
  auto: { em: '🐔', text: 'Your weapons fire <b>on their own</b>. Your job: don\'t get smothered.' },
  carrots: { em: '🥕', text: 'Rabbits drop <b>carrots</b>. Grab them to level up.' },
  breed: { em: '💕', text: 'Uh oh. Rabbits left alone <b>make babies</b> and the counter goes <b>UP</b>. Kill fast.' },
  ult: { em: '🛰️', keys: '<b>Carrot Strike</b> is ready! Press <b>SPACE</b> to call it in.', touch: '<b>Carrot Strike</b> is ready! Tap the <b>🥕 button</b> to call it in.' },
  golden: { em: '✨', text: 'A <b>golden bunny</b>! Catch it before it escapes. It drops golden carrots.' },
  boss: { em: '👑', text: 'A <b>boss</b>! Keep moving and stay out of the <b>red circles</b>. It drops a treasure chest.' },
  levelup: { keys: 'Pick one card: click it or press <b>1–4</b>. <b>R</b> rerolls.', touch: 'Tap a card to pick it. Weapons, trinkets and snacks.' },
  fusion: { text: '<b>Golden card!</b> Two maxed weapons can fuse into something dumber. Take it.' },
  wheel: { keys: 'Every wave, the <b>Wheel of Chaos</b> bends one rule. Space skips the spin.', touch: 'Every wave, the <b>Wheel of Chaos</b> bends one rule. Tap to skip the spin.' },
};
const SHOW_FOR = 6.5;

const $ = (id) => document.getElementById(id);
const queue = [];
let cur = null, curT = 0, movedT = 0;

const copy = (t) => t.text || (G.touch ? t.touch : t.keys);
const allowed = (id) => !save.tipsOff && !save.tips[id];
function seen(id) {
  save.tips[id] = true;
  writeSave();
}

// Queue a HUD tip. Returns true if it will be shown.
export function tip(id) {
  if (!allowed(id) || queue.includes(id) || cur === id) return false;
  queue.push(id);
  seen(id);
  return true;
}

// Fill an in-screen tip slot (level-up, wheel). Returns false (and hides it) if the tip was already seen.
export function inlineTip(id, el) {
  el.hidden = !allowed(id);
  if (el.hidden) return false;
  el.innerHTML = '💡 ' + copy(TIPS[id]);
  seen(id);
  return true;
}

function showNext() {
  cur = queue.shift() || null;
  const box = $('coach');
  if (!cur) {
    box.hidden = true;
    return;
  }
  const t = TIPS[cur];
  $('coachEm').textContent = t.em;
  $('coachText').innerHTML = copy(t);
  box.hidden = false;
  box.classList.remove('in');
  void box.offsetWidth;
  box.classList.add('in');
  curT = 0;
  movedT = 0;
}

export function dismissTip() {
  showNext();
}

export function skipTips() {
  save.tipsOff = true;
  writeSave();
  queue.length = 0;
  showNext();
}

// Ticks with real time while playing, so tips never time out behind a menu.
export function updateTips(realDt) {
  if (!cur) {
    if (queue.length) showNext();
    return;
  }
  curT += realDt;
  const t = TIPS[cur];
  if (t.until === 'moved') {
    if (Math.hypot(input.x, input.z) > 0.3) movedT += realDt;
    if (movedT > 1.2 || curT > 20) showNext();
  } else if (curT > SHOW_FOR) showNext();
}

export function clearTips() {
  queue.length = 0;
  cur = null;
  const box = $('coach');
  if (box) box.hidden = true;
}

export function resetTips() {
  save.tips = {};
  save.tipsOff = false;
  writeSave();
}
