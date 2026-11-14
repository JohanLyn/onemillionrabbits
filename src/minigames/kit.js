// 2D drawing kit for the minigames, in the same sticker style as the menus: flat fills, thick ink
// outlines, a 3-tone look. Everything draws in CSS pixels on a context the framework already scaled.

export const INK = '#2b1d3a';
export const C = {
  ink: INK,
  paper: '#fffdf7',
  carrot: '#ff8a1f',
  carrotDark: '#d9630a',
  leaf: '#4caf50',
  grass: '#7fd35a',
  grassDark: '#6cc24a',
  dirt: '#b98552',
  dirtDark: '#8e6036',
  sky: '#8fd3ff',
  pink: '#ff6fa8',
  innerEar: '#ff9ec4',
  gold: '#ffc83d',
  red: '#e8452c',
  blue: '#47a8ff',
  purple: '#8f4bff',
  white: '#ffffff',
  fur: '#f4efe9',
  hare: '#c98c55',
  grey: '#a3a3b8',
};
export const FONT = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';

const TAU = Math.PI * 2;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function finish(g, fill, lw) {
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (lw) {
    g.lineWidth = lw;
    g.strokeStyle = INK;
    g.stroke();
  }
}

export function ellipse(g, x, y, rx, ry, rot = 0, fill = C.white, lw = 3) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  finish(g, fill, lw);
}
export const circle = (g, x, y, r, fill, lw = 3) => ellipse(g, x, y, r, r, 0, fill, lw);

// Rounded rectangle path (ctx.roundRect is missing on older Safari).
export function rrect(g, x, y, w, h, r, fill = C.paper, lw = 3) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  finish(g, fill, lw);
}

// Outlined cartoon text, like the HUD's.
export function text(g, str, x, y, size, fill = C.white, align = 'center', lw = null) {
  g.font = `${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = lw ?? Math.max(3, size * 0.16);
  g.strokeStyle = INK;
  g.strokeText(str, x, y);
  g.fillStyle = fill;
  g.fillText(str, x, y);
}

// A mown-lawn background, so every minigame sits in the same meadow.
export function lawn(g, W, H, stripe = 46) {
  g.fillStyle = C.grass;
  g.fillRect(0, 0, W, H);
  g.fillStyle = C.grassDark;
  for (let y = 0; y < H; y += stripe * 2) g.fillRect(0, y, W, stripe);
}

/**
 * A rabbit's head and ears, the star of every minigame. (x, y) is the head centre, s its radius.
 * opts: fur, rot, angry (eyebrows), golden, blink (0..1), squash, bomb (fuse and a little bomb on top),
 * hat (top hat), mouth ('teeth' | 'o')
 */
export function rabbit(g, x, y, s, o = {}) {
  const fur = o.golden ? C.gold : o.fur || C.fur;
  const lw = Math.max(2, s * 0.11);
  const sq = o.squash || 0;
  g.save();
  g.translate(x, y);
  g.rotate(o.rot || 0);
  g.scale(1 + sq * 0.5, 1 - sq);
  for (const sx of [-1, 1]) {
    const ex = sx * s * 0.42, ey = -s * 1.15;
    ellipse(g, ex, ey, s * 0.26, s * 0.72, sx * 0.18, fur, lw);
    ellipse(g, ex, ey + s * 0.05, s * 0.12, s * 0.5, sx * 0.18, C.innerEar, 0);
  }
  ellipse(g, 0, 0, s, s * 0.9, 0, fur, lw);
  // cheeks
  ellipse(g, -s * 0.48, s * 0.3, s * 0.2, s * 0.14, 0, 'rgba(255,111,168,0.35)', 0);
  ellipse(g, s * 0.48, s * 0.3, s * 0.2, s * 0.14, 0, 'rgba(255,111,168,0.35)', 0);
  const blink = o.blink || 0;
  for (const sx of [-1, 1]) {
    ellipse(g, sx * s * 0.34, -s * 0.08, s * 0.13, s * 0.17 * (1 - blink * 0.9), 0, INK, 0);
    if (blink < 0.5) circle(g, sx * s * 0.34 - s * 0.04, -s * 0.15, s * 0.045, C.white, 0);
  }
  if (o.angry !== false) {
    g.lineWidth = lw * 1.1;
    g.strokeStyle = INK;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-s * 0.55, -s * 0.42);
    g.lineTo(-s * 0.18, -s * 0.28);
    g.moveTo(s * 0.55, -s * 0.42);
    g.lineTo(s * 0.18, -s * 0.28);
    g.stroke();
  }
  ellipse(g, 0, s * 0.18, s * 0.1, s * 0.08, 0, C.pink, lw * 0.6);
  if (o.mouth === 'o') ellipse(g, 0, s * 0.45, s * 0.12, s * 0.16, 0, INK, 0);
  else rrect(g, -s * 0.12, s * 0.3, s * 0.24, s * 0.2, 2, C.white, lw * 0.6);
  if (o.hat) {
    rrect(g, -s * 0.55, -s * 0.98, s * 1.1, s * 0.16, 3, INK, 0);
    rrect(g, -s * 0.34, -s * 1.6, s * 0.68, s * 0.68, 4, INK, 0);
    rrect(g, -s * 0.34, -s * 1.08, s * 0.68, s * 0.14, 0, C.red, 0);
  }
  if (o.bomb) {
    circle(g, s * 0.7, -s * 0.7, s * 0.42, '#1d1a24', lw);
    g.lineWidth = lw;
    g.strokeStyle = '#c7a26b';
    g.beginPath();
    g.moveTo(s * 0.95, -s * 1.0);
    g.quadraticCurveTo(s * 1.2, -s * 1.3, s * 1.05, -s * 1.45);
    g.stroke();
    circle(g, s * 1.05, -s * 1.5, s * 0.12 * (0.8 + 0.4 * Math.random()), C.gold, 0);
  }
  g.restore();
}

// A carrot pointing down, (x, y) at its top. s is its length.
export function carrot(g, x, y, s, rot = 0, golden = false) {
  const lw = Math.max(2, s * 0.08);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  for (const [a, l] of [[-0.5, 0.42], [0, 0.5], [0.5, 0.42]]) {
    g.save();
    g.rotate(a);
    ellipse(g, 0, -s * l * 0.5, s * 0.09, s * l * 0.5, 0, golden ? '#fff3a0' : C.leaf, lw * 0.8);
    g.restore();
  }
  g.beginPath();
  g.moveTo(-s * 0.2, 0);
  g.quadraticCurveTo(-s * 0.18, s * 0.6, 0, s);
  g.quadraticCurveTo(s * 0.18, s * 0.6, s * 0.2, 0);
  g.closePath();
  finish(g, golden ? C.gold : C.carrot, lw);
  g.lineWidth = lw * 0.7;
  g.strokeStyle = golden ? '#c79a1f' : C.carrotDark;
  g.beginPath();
  g.moveTo(-s * 0.1, s * 0.3);
  g.lineTo(s * 0.04, s * 0.3);
  g.moveTo(-s * 0.04, s * 0.55);
  g.lineTo(s * 0.08, s * 0.55);
  g.stroke();
  g.restore();
}

export function star(g, x, y, r, fill = C.gold, lw = 3, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  finish(g, fill, lw);
}

// Tiny particle + floating-text system the framework runs for every minigame.
export class Pops {
  constructor() {
    this.parts = [];
    this.texts = [];
  }
  burst(x, y, colors = [C.gold, C.white, C.pink], n = 12, speed = 260) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(0.3, 1) * speed;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: rand(0.4, 0.8), max: 0.8, r: rand(3, 7), c: pick(colors), star: Math.random() < 0.3 });
    }
  }
  float(str, x, y, color = C.white, size = 26) {
    this.texts.push({ str, x, y, color, size, life: 0.9 });
  }
  update(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += 700 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 60 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }
  draw(g) {
    for (const p of this.parts) {
      g.globalAlpha = Math.min(1, p.life * 3);
      if (p.star) star(g, p.x, p.y, p.r * 1.4, p.c, 1.5);
      else circle(g, p.x, p.y, p.r, p.c, 1.5);
    }
    for (const t of this.texts) {
      g.globalAlpha = Math.min(1, t.life * 3);
      text(g, t.str, t.x, t.y, t.size * (t.life > 0.75 ? 1 + (t.life - 0.75) * 2 : 1), t.color);
    }
    g.globalAlpha = 1;
  }
}
