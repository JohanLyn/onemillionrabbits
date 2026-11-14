// The minigame framework. A minigame is a small 2D canvas game in its own module (see whack.js for
// the reference one); this file runs the shared flow around it:
//   intro card -> 3-2-1 -> play (timer, score) -> results (stars, best, prizes) -> back to the caller.
//
// A minigame module default-exports:
//   {
//     id, name, emoji, blurb,           // shown on cards; blurb is one short funny line
//     how: { touch, keys },             // one sentence each: how to play with a finger / a keyboard
//     duration,                         // seconds of play, or null if the game ends itself (set finished)
//     stars: [one, two, three],         // score thresholds for 1, 2 and 3 stars
//     unit,                             // what the score counts, e.g. 'bonks'
//     create(api) -> {
//       score, finished,                // read by the framework every frame
//       update(dt), draw(g),            // g is a 2D context in CSS pixels, api.W x api.H
//       down(x, y), move(x, y), up(x, y), key(k)   // all optional; k is e.key lower-cased
//     }
//   }
// api: { W, H, level, touch, keys (Set of held keys), timeLeft, kit, pops, sfx, shake(amount) }.
// level is 1 in the Arcade and grows toward 2 in late waves of a run, so minigames can speed up.
import { G } from '../core.js';
import { save, writeSave } from '../save.js';
import { sfx } from '../audio.js';
import * as kit from './kit.js';
import whack from './whack.js';
import catchGame from './catch.js';
import hats from './hats.js';
import count from './count.js';
import toss from './toss.js';

export const MINIGAMES = [whack, catchGame, hats, count, toss];
export const minigameById = (id) => MINIGAMES.find((m) => m.id === id);
// golden carrots paid once per minigame, the first time you reach each star count
export const STAR_GOLD = [10, 20, 40];

const $ = (id) => document.getElementById(id);
const COUNT_LEN = 2.4;
let canvas, g, W = 1, H = 1, dpr = 1;
let cur = null;
const keys = new Set();
const lastPlayed = [];

export function arcadeRecord(id) {
  save.arcade = save.arcade || {};
  return (save.arcade[id] = save.arcade[id] || { best: 0, stars: 0, plays: 0 });
}

export function initMinigames() {
  canvas = $('mgCanvas');
  g = canvas.getContext('2d');
  const toLocal = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!cur) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    if (cur.phase === 'intro') return begin();
    if (cur.phase === 'play') cur.game.down?.(...toLocal(e));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (cur?.phase === 'play') cur.game.move?.(...toLocal(e));
  });
  const up = (e) => {
    if (cur?.phase === 'play') cur.game.up?.(...toLocal(e));
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (G.state !== 'minigame' || !cur) return;
    const k = e.key.toLowerCase();
    if (e.repeat && cur.phase !== 'play') return;
    if (k.startsWith('arrow') || k === ' ') e.preventDefault();
    keys.add(k);
    if (cur.phase === 'intro' && (k === ' ' || k === 'enter')) begin();
    else if (cur.phase === 'play' && !e.repeat) cur.game.key?.(k);
    else if (cur.phase === 'done' && (k === ' ' || k === 'enter')) close();
    else if (k === 'escape' && cur.from === 'arcade' && cur.phase !== 'done') close(true);
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  $('mgStart').onclick = () => begin();
  $('mgContinue').onclick = () => close();
  $('mgQuit').onclick = () => close(true);
}

function fit() {
  const r = canvas.parentElement.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  const d = Math.min(devicePixelRatio || 1, 2);
  if (w === W && h === H && d === dpr) return;
  W = w;
  H = h;
  dpr = d;
  canvas.width = Math.round(W * d);
  canvas.height = Math.round(H * d);
  cur?.game.resize?.(W, H);
}

// Pick the minigame that was played least recently, so a run sees variety.
function pickNext() {
  const fresh = MINIGAMES.filter((m) => !lastPlayed.includes(m.id));
  return kit.pick(fresh.length ? fresh : MINIGAMES);
}

/**
 * Open a minigame. from: 'run' (an arcade booth mid-run) or 'arcade' (the title-screen Arcade).
 * onResult({ def, score, stars, newBest }) returns lines describing the prizes (and applies them);
 * onClose(quit) runs when the player leaves the results card (quit = left the Arcade before the end).
 */
export function openMinigame(id, { from = 'arcade', onResult = () => [], onClose = () => {} } = {}) {
  const def = (id && minigameById(id)) || pickNext();
  lastPlayed.unshift(def.id);
  lastPlayed.length = Math.min(lastPlayed.length, 3);
  keys.clear();
  G.state = 'minigame';
  G.mgFrom = from;
  $('minigame').hidden = false;
  $('mgCard').hidden = false;
  $('mgCard').className = 'mg-card intro';
  $('mgQuit').hidden = from !== 'arcade';
  $('mgName').textContent = `${def.emoji} ${def.name}`;
  $('mgTime').textContent = def.duration ? `${def.duration}s` : '';
  $('mgScore').textContent = '0';
  const rec = arcadeRecord(def.id);
  $('mgIntro').innerHTML = `<span class="mg-em">${def.emoji}</span><h2>${def.name}</h2><p class="mg-blurb">${def.blurb}</p>
    <p class="mg-how">${G.touch ? def.how.touch : def.how.keys}</p>
    <p class="mg-goal">${starLine(def)}${rec.best ? ` · best ${rec.best}` : ''}</p>`;
  $('mgResult').hidden = true;
  $('mgStart').hidden = false;
  $('mgContinue').hidden = true;
  cur = { def, from, onResult, onClose, phase: 'intro', t: 0, timeLeft: def.duration || 0, shake: 0, pops: new kit.Pops(), shownScore: -1 };
  fit();
  cur.game = def.create(makeApi());
  sfx('tick');
  requestAnimationFrame(() => $('mgStart').focus?.());
}

function starLine(def) {
  return def.stars.map((s, i) => `${'⭐'.repeat(i + 1)} ${s}`).join('&nbsp;&nbsp;') + ` ${def.unit}`;
}

function makeApi() {
  return {
    get W() {
      return W;
    },
    get H() {
      return H;
    },
    get timeLeft() {
      return cur ? cur.timeLeft : 0;
    },
    level: cur.from === 'run' ? 1 + Math.min(1, Math.max(0, G.wave - 3) / 20) : 1,
    touch: G.touch,
    keys,
    kit,
    pops: cur.pops,
    sfx,
    shake: (a = 6) => (cur.shake = Math.max(cur.shake, a)),
  };
}

function begin() {
  if (!cur || cur.phase !== 'intro') return;
  cur.phase = 'count';
  cur.t = 0;
  $('mgCard').hidden = true;
  sfx('tick');
}

function end() {
  cur.phase = 'done';
  const def = cur.def;
  const score = Math.round(cur.game.score || 0);
  const stars = def.stars.filter((s) => score >= s).length;
  const rec = arcadeRecord(def.id);
  const newBest = score > rec.best;
  rec.best = Math.max(rec.best, score);
  rec.plays++;
  // star milestones pay out once per minigame, wherever you reach them
  let bonus = 0;
  for (let i = rec.stars; i < stars; i++) bonus += STAR_GOLD[i];
  rec.stars = Math.max(rec.stars, stars);
  save.gold += bonus;
  const lines = cur.onResult({ def, score, stars, newBest }) || [];
  if (bonus) lines.push(`🥕 +${bonus} golden carrots for a new star record`);
  writeSave();
  $('mgCard').hidden = false;
  $('mgCard').className = 'mg-card done' + (stars ? '' : ' flop');
  $('mgStart').hidden = true;
  $('mgContinue').hidden = false;
  $('mgResult').hidden = false;
  $('mgIntro').innerHTML = '';
  $('mgResult').innerHTML = `<div class="mg-stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('')}</div>
    <h2>${['OOF', 'NICE', 'GREAT', 'PERFECT!'][stars]}</h2>
    <p class="mg-final"><b>${score}</b> ${def.unit}${newBest && rec.plays > 1 ? ' <span class="mg-best">NEW BEST!</span>' : ''}</p>
    ${lines.length ? `<ul class="mg-prizes">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}`;
  sfx(stars >= 2 ? 'fanfare' : stars ? 'levelup' : 'slip');
  if (stars) cur.pops.burst(W / 2, H * 0.35, [kit.C.gold, kit.C.pink, kit.C.white, kit.C.blue], 40, 420);
  requestAnimationFrame(() => $('mgContinue').focus?.());
}

function close(quit = false) {
  if (!cur) return;
  const done = cur;
  cur = null;
  $('minigame').hidden = true;
  keys.clear();
  done.onClose(quit);
}

export const minigameOpen = () => !!cur;

// Called every frame by the main loop while G.state is 'minigame'.
export function updateMinigame(dt) {
  if (!cur) return;
  fit();
  const c = cur;
  c.t += dt;
  if (c.phase === 'count') {
    const left = Math.ceil(COUNT_LEN - c.t);
    if (left !== c.lastTick && left > 0) {
      c.lastTick = left;
      sfx('tick');
    }
    if (c.t >= COUNT_LEN) {
      c.phase = 'play';
      c.t = 0;
      sfx('levelup');
    }
  } else if (c.phase === 'play') {
    if (c.def.duration) c.timeLeft = Math.max(0, c.timeLeft - dt);
    c.game.update?.(dt);
    if ((c.def.duration && c.timeLeft <= 0) || c.game.finished) end();
  }
  c.pops.update(dt);
  c.shake = Math.max(0, c.shake - dt * 30);
  const sc = Math.round(c.game.score || 0);
  if (sc !== c.shownScore) {
    c.shownScore = sc;
    $('mgScore').textContent = sc;
  }
  if (c.def.duration) $('mgTime').textContent = `${Math.ceil(c.phase === 'intro' || c.phase === 'count' ? c.def.duration : c.timeLeft)}s`;
  $('mgTime').classList.toggle('hurry', c.phase === 'play' && c.def.duration && c.timeLeft < 5);
  draw();
}

function draw() {
  const c = cur;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (c.shake > 0) g.translate(kit.rand(-c.shake, c.shake), kit.rand(-c.shake, c.shake));
  g.save();
  c.game.draw(g);
  g.restore();
  c.pops.draw(g);
  if (c.phase === 'count') {
    const n = Math.ceil(COUNT_LEN - c.t);
    const k = 1 - (COUNT_LEN - c.t - (n - 1));
    g.fillStyle = 'rgba(43,29,58,0.35)';
    g.fillRect(-20, -20, W + 40, H + 40);
    kit.text(g, n > 0 ? String(n) : 'GO!', W / 2, H / 2, Math.min(W, H) * 0.3 * (1 + (1 - k) * 0.4), kit.C.gold);
  } else if (c.phase === 'play' && c.t < 0.6) {
    g.globalAlpha = 1 - c.t / 0.6;
    kit.text(g, 'GO!', W / 2, H / 2, Math.min(W, H) * 0.3, kit.C.gold);
    g.globalAlpha = 1;
  }
}
