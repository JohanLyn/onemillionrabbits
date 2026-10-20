import { G, pick } from './core.js';
import { setDisco } from './world.js';
import { sfx } from './audio.js';

// The Wheel of Chaos: every wave from wave 2 on, one rule of the meadow changes.
export const MODS = [
  { id: 'hats', emoji: '🎩', name: 'Fancy Hats', desc: 'Rabbits wear top hats. Classy rabbits drop double XP.', color: '#2b1d3a' },
  { id: 'moon', emoji: '🌙', name: 'Moon Gravity', desc: 'Huge hops, huge knockback. Everything goes flying.', color: '#5b6bd6' },
  { id: 'giant', emoji: '🦣', name: 'Giant Rabbits', desc: 'New rabbits are enormous: double HP, double XP.', color: '#a3a3b8' },
  { id: 'turbo', emoji: '⚡', name: 'Turbo Tuesday', desc: 'The whole game runs 30% faster.', color: '#ffc83d' },
  { id: 'rain', emoji: '🥕', name: 'Carrot Rain', desc: 'It is raining XP. Hallelujah.', color: '#ff8a1f' },
  { id: 'disco', emoji: '🪩', name: 'Disco Inferno', desc: 'The meadow becomes a dance floor. Rabbits take +30% damage.', color: '#c77dff' },
  { id: 'fever', emoji: '💕', name: 'Spring Fever', desc: 'Rabbits breed 4x faster. Uh oh.', color: '#ff6fa8' },
  { id: 'glass', emoji: '💥', name: 'Glass Cannon', desc: 'You deal double damage. You also take double damage.', color: '#ff4d5e' },
  { id: 'slowmo', emoji: '🐢', name: 'Slow-Mo Horde', desc: 'Rabbits are sluggish, but twice as many show up.', color: '#5cc44a' },
  { id: 'jelly', emoji: '🍮', name: 'Jelly World', desc: 'Everything is wobbly and bouncy. No gameplay reason. Just vibes.', color: '#ffb35c' },
  { id: 'magnet', emoji: '🧲', name: 'Super Magnet', desc: 'Triple pickup range.', color: '#47c6ff' },
];

export function applyMod(m) {
  clearMod();
  G.mod = m;
  if (m.id === 'disco') setDisco(true);
  if (m.id === 'turbo') G.timeScale = 1.3;
}
export function clearMod() {
  if (G.mod?.id === 'disco') setDisco(false);
  G.timeScale = 1;
  G.mod = null;
}

// ---------- the wheel overlay ----------
let canvas, ctx2d, angle = 0, target = null, done = null, settled = 0, lastSeg = -1;

function draw() {
  const W = canvas.width, R = W / 2 - 8, n = MODS.length, seg = (Math.PI * 2) / n;
  ctx2d.clearRect(0, 0, W, W);
  ctx2d.save();
  ctx2d.translate(W / 2, W / 2);
  ctx2d.rotate(angle);
  for (let i = 0; i < n; i++) {
    ctx2d.beginPath();
    ctx2d.moveTo(0, 0);
    ctx2d.arc(0, 0, R, i * seg, (i + 1) * seg);
    ctx2d.closePath();
    ctx2d.fillStyle = i % 2 ? '#fffdf7' : MODS[i].color;
    ctx2d.fill();
    ctx2d.lineWidth = 4;
    ctx2d.strokeStyle = '#2b1d3a';
    ctx2d.stroke();
    ctx2d.save();
    ctx2d.rotate(i * seg + seg / 2);
    ctx2d.font = '34px serif';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(MODS[i].emoji, R * 0.7, 0);
    ctx2d.restore();
  }
  ctx2d.beginPath();
  ctx2d.arc(0, 0, R, 0, Math.PI * 2);
  ctx2d.lineWidth = 8;
  ctx2d.stroke();
  ctx2d.beginPath();
  ctx2d.arc(0, 0, 26, 0, Math.PI * 2);
  ctx2d.fillStyle = '#ffc83d';
  ctx2d.fill();
  ctx2d.lineWidth = 5;
  ctx2d.stroke();
  ctx2d.restore();
}

// Segment under the pointer (top of the wheel, at -90 degrees).
function segAtPointer() {
  const n = MODS.length, seg = (Math.PI * 2) / n;
  let a = (-Math.PI / 2 - angle) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return Math.floor(a / seg) % n;
}

export function spinWheel(onDone) {
  canvas = canvas || document.getElementById('wheelCanvas');
  ctx2d = ctx2d || canvas.getContext('2d');
  const choices = MODS.filter((m) => m.id !== G.lastMod);
  target = pick(choices);
  const n = MODS.length, seg = (Math.PI * 2) / n;
  const idx = MODS.indexOf(target);
  // land the target segment under the pointer, after a few full turns
  const want = -Math.PI / 2 - (idx + 0.2 + Math.random() * 0.6) * seg;
  const turns = 4 + Math.floor(Math.random() * 2);
  const start = angle % (Math.PI * 2);
  let end = want - Math.PI * 2 * turns;
  while (end > start - Math.PI * 2 * turns) end -= Math.PI * 2;
  spin.from = start;
  spin.to = end;
  spin.t = 0;
  spin.T = 2.4;
  angle = start;
  settled = 0;
  done = onDone;
  const res = document.getElementById('wheelResult');
  res.innerHTML = '';
  draw();
}
const spin = { from: 0, to: 0, t: 0, T: 1 };

export function updateWheel(realDt) {
  if (!done) return;
  if (spin.t < spin.T) {
    spin.t = Math.min(spin.T, spin.t + realDt);
    const k = spin.t / spin.T;
    const e = 1 - Math.pow(1 - k, 3);
    angle = spin.from + (spin.to - spin.from) * e;
    const s = segAtPointer();
    if (s !== lastSeg) {
      lastSeg = s;
      sfx('tick');
    }
    draw();
    if (spin.t >= spin.T) {
      document.getElementById('wheelResult').innerHTML = `${target.emoji} ${target.name}<small>${target.desc}</small>`;
      sfx('fanfare');
    }
  } else {
    settled += realDt;
    if (settled > 1.6) finish();
  }
}

export function skipWheel() {
  if (!done) return;
  if (spin.t < spin.T) {
    spin.t = spin.T - 0.001;
  } else finish();
}

function finish() {
  const cb = done;
  done = null;
  G.lastMod = target.id;
  cb(target);
}
