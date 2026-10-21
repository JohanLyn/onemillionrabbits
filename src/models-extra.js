import * as THREE from 'three';
import { P, S, B, C, K, Cap, T, merge } from './toon.js';
import { rabbitGeo } from './models.js';

// New rabbits, bosses and weapons. Same conventions as models.js: one merged geometry with
// vertex colors, facing +Z, feet at y=0. New rabbits start from a stock rabbit so they match.

const INK = 0x2b1d3a;
const dome = (r, w, h) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);
const _c = new THREE.Color(), _t = new THREE.Color();

// Repaint baked vertex colors: { fromHex: toHex }.
function recolor(geo, map) {
  const col = geo.attributes.color;
  const pairs = Object.entries(map).map(([a, b]) => [new THREE.Color(Number(a)), new THREE.Color(b)]);
  for (let i = 0; i < col.count; i++) {
    _c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    for (const [from, to] of pairs) {
      if (Math.abs(_c.r - from.r) + Math.abs(_c.g - from.g) + Math.abs(_c.b - from.b) < 0.01) {
        col.setXYZ(i, to.r, to.g, to.b);
        break;
      }
    }
  }
  return geo;
}
const BUNNY_FUR = 0xf4efe9, CHONK_FUR = 0xa3a3b8, CHONK_BELLY = 0xdcdcea, BOSS_FUR = 0xe9e3f0;

// ---------- new rabbits ----------
export function archerGeo() {
  const g = [recolor(rabbitGeo('bunny'), { [BUNNY_FUR]: 0xd9b77e })];
  const hood = 0x3f9e48, dark = 0x2f7a37;
  // Robin Hood cap with a feather
  g.push(P(K(0.34, 0.5, 10), hood, [0, 1.36, 0.22], [-0.5, 0, 0], [1, 1, 1.25]));
  g.push(P(C(0.37, 0.37, 0.06, 12), dark, [0, 1.22, 0.3], [-0.25, 0, 0]));
  g.push(P(Cap(0.03, 0.42, 4), 0xe3342f, [0.22, 1.5, 0.05], [-0.9, 0, -0.5]));
  // quiver full of carrots on the back
  g.push(P(C(0.13, 0.11, 0.6, 8), 0x8a5a33, [0.12, 0.85, -0.42], [0.35, 0, -0.25]));
  for (const [dx, dz] of [[0, 0], [0.07, 0.05], [-0.06, 0.04]]) {
    g.push(P(K(0.06, 0.22, 6), 0xff8a1f, [0.2 + dx, 1.22, -0.55 + dz], [0.35 + Math.PI, 0, -0.25]));
    g.push(P(K(0.04, 0.1, 4), 0x4caf50, [0.24 + dx, 1.35, -0.6 + dz], [0.35, 0, -0.25]));
  }
  // bow in the front paws
  g.push(P(T(0.42, 0.03, 4, 14, Math.PI), 0x8a5a33, [0.32, 0.72, 0.45], [0, Math.PI / 2, Math.PI / 2]));
  g.push(P(C(0.008, 0.008, 0.84, 3), 0xffffff, [0.32, 0.72, 0.45]));
  return merge(g);
}

export function burrowerGeo() {
  const g = [recolor(rabbitGeo('bunny'), { [BUNNY_FUR]: 0x8c6f56 })];
  // hard hat with a head lamp
  g.push(P(dome(0.36, 12, 6), 0xffc83d, [0, 1.18, 0.3], [-0.15, 0, 0]));
  g.push(P(C(0.42, 0.42, 0.04, 14), 0xf2b62e, [0, 1.18, 0.33], [-0.15, 0, 0]));
  g.push(P(C(0.08, 0.08, 0.08, 8), 0xfffbe0, [0, 1.36, 0.62], [Math.PI / 2 - 0.15, 0, 0]));
  // big digging claws
  for (const sx of [1, -1]) {
    g.push(P(S(0.16, 8, 6), 0xd9c2a5, [sx * 0.32, 0.48, 0.42], 0, [1, 0.6, 1.2]));
    for (let k = -1; k <= 1; k++) g.push(P(K(0.035, 0.14, 4), 0xf3ead8, [sx * 0.32 + k * 0.07, 0.48, 0.6], [Math.PI / 2, 0, 0]));
  }
  // dirt smudges
  g.push(P(S(0.1, 6, 4), 0x5c4130, [0.18, 0.62, 0.42], 0, [1, 0.6, 0.4]));
  g.push(P(S(0.08, 6, 4), 0x5c4130, [-0.2, 0.35, 0.38], 0, [1, 0.6, 0.4]));
  return merge(g);
}

export function moundGeo() {
  const dirt = 0x9c6a3c, dark = 0x7a4f2b;
  const g = [P(dome(0.8, 12, 6), dirt, [0, 0, 0], 0, [1, 0.55, 1])];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.push(P(S(0.2, 6, 4), i % 2 ? dark : dirt, [Math.cos(a) * 0.75, 0.08, Math.sin(a) * 0.75], 0, [1, 0.6, 1]));
  }
  g.push(P(K(0.05, 0.25, 4), 0x5fcf55, [0.2, 0.45, 0.1], [0, 0, 0.3]));
  g.push(P(K(0.05, 0.2, 4), 0x46a83f, [-0.15, 0.42, -0.1], [0.3, 0, -0.2]));
  return merge(g);
}

export function eggGeo() {
  return merge([
    P(S(0.5, 14, 10), 0xfff1f8, [0, 0.62, 0], 0, [1, 1.3, 1]),
    P(C(0.502, 0.502, 0.16, 16), 0xff6fa8, [0, 0.62, 0], 0, [1, 1, 1]),
    P(C(0.44, 0.44, 0.08, 16), 0x7ad7ff, [0, 0.95, 0]),
    P(C(0.44, 0.44, 0.08, 16), 0x7ad7ff, [0, 0.29, 0]),
    P(S(0.07, 6, 4), 0xffe14d, [0.3, 0.8, 0.36]),
    P(S(0.07, 6, 4), 0xffe14d, [-0.36, 0.5, 0.3]),
    P(S(0.07, 6, 4), 0xffe14d, [0.05, 1.1, 0.42]),
  ]);
}

// Little stars circling a confused rabbit's head (baked at bunny head height).
export function dizzyGeo() {
  const g = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.push(P(new THREE.OctahedronGeometry(0.11, 0), 0xffe14d, [Math.cos(a) * 0.38, 1.75, 0.25 + Math.sin(a) * 0.38]));
  }
  return merge(g);
}

// Flat glow ring drawn under elite rabbits.
export function auraGeo() {
  return new THREE.RingGeometry(0.62, 0.9, 28).rotateX(-Math.PI / 2);
}

// Enemy carrot dart: points along +Z.
export function dartGeo() {
  return merge([
    P(K(0.13, 0.55, 8), 0xff6a12, [0, 0, 0.05], [Math.PI / 2, 0, 0]),
    P(K(0.06, 0.2, 5), 0x3fae49, [0.04, 0, -0.3], [-Math.PI / 2 - 0.4, 0, 0]),
    P(K(0.06, 0.2, 5), 0x3fae49, [-0.04, 0, -0.3], [-Math.PI / 2 + 0.4, 0, 0]),
  ]);
}

// ---------- bosses ----------
export function spinnerBossGeo() {
  const g = [recolor(rabbitGeo('chonk'), { [CHONK_FUR]: 0x9a8d6a, [CHONK_BELLY]: 0xd8cfae })];
  const army = 0x55703a;
  // army helmet
  g.push(P(dome(0.42, 12, 6), army, [0, 1.12, 0.28], [-0.12, 0, 0]));
  g.push(P(C(0.5, 0.5, 0.05, 14), 0x46602f, [0, 1.12, 0.3], [-0.12, 0, 0]));
  // carrot bandolier
  g.push(P(T(0.62, 0.05, 6, 18), 0x6b4a2a, [0, 0.62, 0.05], [0.25, 0, 0.75], [1, 1, 0.85]));
  for (let i = 0; i < 6; i++) {
    const a = -0.8 + i * 0.32;
    g.push(P(K(0.06, 0.2, 6), 0xff8a1f, [Math.sin(a) * 0.55, 0.62 + Math.cos(a) * 0.45, 0.6], [0, 0, a]));
  }
  // carrot gatling on its back
  g.push(P(C(0.2, 0.2, 0.7, 10), 0x5b5566, [0, 1.0, -0.55], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.push(P(C(0.05, 0.05, 0.9, 6), 0x3a3540, [Math.cos(a) * 0.13, 1.0 + Math.sin(a) * 0.13, -0.5], [Math.PI / 2, 0, 0]));
  }
  g.push(P(K(0.2, 0.3, 10), 0xff8a1f, [0, 1.0, -0.12], [Math.PI / 2, 0, 0]));
  // shades
  g.push(P(B(0.5, 0.1, 0.05), 0x111111, [0, 1.1, 0.64]));
  return merge(g);
}

export function broodBossGeo() {
  const g = [recolor(rabbitGeo('chonk'), { [CHONK_FUR]: 0xffd6e6, [CHONK_BELLY]: 0xfff4f8 })];
  // flowery bonnet
  g.push(P(dome(0.44, 12, 6), 0xfff3a0, [0, 1.12, 0.26], [-0.3, 0, 0]));
  g.push(P(C(0.62, 0.62, 0.04, 16), 0xffe066, [0, 1.12, 0.32], [-0.3, 0, 0]));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.push(P(S(0.08, 6, 4), [0xff6fa8, 0x7ad7ff, 0xffffff, 0xc77dff, 0xff8a1f][i], [Math.cos(a) * 0.3, 1.38, 0.2 + Math.sin(a) * 0.2]));
  }
  // pearl necklace and an apron
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + i * 0.3;
    g.push(P(S(0.05, 6, 4), 0xffffff, [Math.sin(a) * 0.4, 0.78 - Math.cos(a) * 0.08, 0.32 + Math.cos(a) * 0.12]));
  }
  g.push(P(B(0.6, 0.5, 0.06), 0x7ad7ff, [0, 0.45, 0.58], [-0.15, 0, 0]));
  g.push(P(S(0.1, 6, 4), 0xff4f8e, [0, 0.55, 0.62], 0, [1, 0.8, 0.4]));
  return merge(g);
}

export function queenGeo() {
  const g = [recolor(rabbitGeo('boss'), { [BOSS_FUR]: 0xfaf6ff })];
  const gold = 0xffc83d, purple = 0x7b2fbe;
  // a taller crown with gems
  g.push(P(C(0.34, 0.3, 0.26, 12), gold, [0, 1.52, 0.28]));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.push(P(K(0.075, 0.3, 6), gold, [Math.sin(a) * 0.3, 1.78, 0.28 + Math.cos(a) * 0.3]));
    g.push(P(S(0.045, 6, 4), [0xff3d6a, 0x47e5ff, 0x6bff5c][i % 3], [Math.sin(a) * 0.33, 1.52, 0.28 + Math.cos(a) * 0.33]));
  }
  g.push(P(S(0.07, 8, 6), 0xff3d6a, [0, 1.98, 0.28]));
  // royal cape
  const cape = new THREE.CylinderGeometry(0.5, 0.72, 0.95, 14, 1, true, Math.PI * 0.6, Math.PI * 0.8);
  g.push(P(cape, purple, [0, 0.52, -0.08]));
  g.push(P(T(0.5, 0.06, 6, 16, Math.PI), 0xffffff, [0, 1.0, -0.08], [Math.PI / 2, 0, Math.PI]));
  // scepter with a golden carrot
  g.push(P(C(0.035, 0.035, 1.2, 6), gold, [0.55, 0.75, 0.35], [0.2, 0, -0.2]));
  g.push(P(K(0.12, 0.35, 8), 0xffa31a, [0.66, 1.45, 0.47], [0.2, 0, -0.2]));
  g.push(P(S(0.08, 6, 4), 0x6bff5c, [0.6, 1.25, 0.42]));
  return merge(g);
}

// ---------- new weapons ----------
export function gnomeGeo(choir = false) {
  const hat = choir ? 0xffc83d : 0xe3342f;
  const g = [
    P(S(0.12, 8, 6), 0x5a3a28, [0.1, 0.06, 0.04], 0, [1, 0.6, 1.4]),
    P(S(0.12, 8, 6), 0x5a3a28, [-0.1, 0.06, 0.04], 0, [1, 0.6, 1.4]),
    P(C(0.2, 0.26, 0.42, 10), 0x3f72c9, [0, 0.3, 0]),
    P(C(0.27, 0.27, 0.06, 10), 0x5a3a28, [0, 0.42, 0]),
    P(S(0.18, 10, 8), 0xffcf9f, [0, 0.66, 0]),
    P(K(0.2, 0.42, 10), 0xffffff, [0, 0.45, 0.12], [Math.PI + 0.25, 0, 0], [1, 1, 0.7]),
    P(S(0.06, 6, 4), 0xff9a7a, [0, 0.66, 0.18]),
    P(S(0.03, 6, 4), 0x150d1f, [0.07, 0.72, 0.15]),
    P(S(0.03, 6, 4), 0x150d1f, [-0.07, 0.72, 0.15]),
    P(K(0.2, 0.55, 10), hat, [0, 1.0, -0.03], [-0.15, 0, 0]),
    P(S(0.08, 6, 4), 0xffcf9f, [0.22, 0.38, 0.08]),
    P(S(0.08, 6, 4), 0xffcf9f, [-0.22, 0.38, 0.08]),
  ];
  if (choir) {
    g.push(P(C(0.03, 0.05, 0.3, 6), 0xffe14d, [0, 0.6, 0.3], [Math.PI / 2, 0, 0]));
    g.push(P(K(0.07, 0.1, 6), 0xffe14d, [0, 0.6, 0.47], [Math.PI / 2, 0, 0]));
  } else {
    // slingshot
    g.push(P(C(0.02, 0.02, 0.3, 4), 0x8a5a33, [0.25, 0.5, 0.14]));
    g.push(P(T(0.07, 0.015, 4, 8, Math.PI), 0x8a5a33, [0.25, 0.66, 0.14]));
  }
  return merge(g);
}

export function acornGeo() {
  return merge([
    P(S(0.12, 8, 6), 0xb07a3c, [0, 0, 0], 0, [1, 1.2, 1]),
    P(dome(0.13, 8, 4), 0x6b4a2a, [0, 0.04, 0]),
    P(C(0.015, 0.015, 0.06, 4), 0x6b4a2a, [0, 0.17, 0]),
  ]);
}

export function kazooGeo() {
  return merge([
    P(C(0.08, 0.12, 0.7, 10), 0xffc83d, [0, 0, 0], [Math.PI / 2, 0, 0]),
    P(K(0.13, 0.12, 10), 0xffc83d, [0, 0, 0.4], [Math.PI / 2, 0, 0]),
    P(C(0.07, 0.07, 0.08, 8), 0xe3342f, [0, 0.11, 0.05]),
  ]);
}

// Unit-length noodle along +Y (scaled to the rope length at draw time).
export function noodleGeo() {
  return merge([P(C(0.07, 0.07, 1, 6), 0xffd95a, [0, 0.5, 0])]);
}
export function meatballGeo() {
  return merge([
    P(S(0.32, 10, 8), 0x8a3f22),
    P(S(0.1, 6, 4), 0xe3342f, [0.15, 0.2, 0.12]),
    P(S(0.08, 6, 4), 0x3fae49, [-0.12, 0.24, 0.05]),
  ]);
}

export function cartGeo(express = false) {
  const wire = express ? 0xffc83d : 0xc9ced8, red = 0xe3342f;
  const g = [
    P(B(1.0, 0.5, 1.3), wire, [0, 0.75, 0]),
    P(B(0.86, 0.06, 1.16), 0x5b6170, [0, 1.0, 0]),
    P(B(1.04, 0.06, 1.34), red, [0, 1.0, 0]),
    P(B(1.04, 0.06, 1.34), red, [0, 0.52, 0]),
    P(C(0.035, 0.035, 0.36, 5), 0x5b6170, [0.42, 0.36, 0.52]),
    P(C(0.035, 0.035, 0.36, 5), 0x5b6170, [-0.42, 0.36, 0.52]),
    P(C(0.035, 0.035, 0.36, 5), 0x5b6170, [0.42, 0.36, -0.52]),
    P(C(0.035, 0.035, 0.36, 5), 0x5b6170, [-0.42, 0.36, -0.52]),
    P(B(0.9, 0.05, 0.05), red, [0, 1.15, -0.8]),
  ];
  for (const [x, z] of [[0.42, 0.52], [-0.42, 0.52], [0.42, -0.52], [-0.42, -0.52]]) g.push(P(C(0.11, 0.11, 0.07, 10), 0x2b2b33, [x, 0.12, z], [0, 0, Math.PI / 2]));
  for (let i = -2; i <= 2; i++) g.push(P(B(0.03, 0.46, 1.32), 0x8b919e, [i * 0.2, 0.76, 0]));
  // leaf blower strapped to the back, blasting backwards
  g.push(P(C(0.18, 0.18, 0.4, 10), 0x5fcf55, [0, 0.85, -0.85], [Math.PI / 2, 0, 0]));
  g.push(P(C(0.08, 0.12, 0.45, 8), 0x3f9e48, [0, 0.7, -1.15], [Math.PI / 2 + 0.3, 0, 0]));
  if (express) g.push(P(K(0.18, 0.4, 8), INK, [0, 1.45, 0.4]));
  return merge(g);
}

// Present box dropped by elite rabbits.
export function giftGeo() {
  return merge([
    P(B(0.7, 0.55, 0.7), 0xc77dff, [0, 0.28, 0]),
    P(B(0.78, 0.14, 0.78), 0x9b4fe0, [0, 0.6, 0]),
    P(B(0.14, 0.58, 0.72), 0xffe14d, [0, 0.3, 0]),
    P(B(0.72, 0.58, 0.14), 0xffe14d, [0, 0.3, 0]),
    P(T(0.12, 0.04, 6, 10), 0xffe14d, [0.1, 0.75, 0], [0, 0, 0.5]),
    P(T(0.12, 0.04, 6, 10), 0xffe14d, [-0.1, 0.75, 0], [0, 0, -0.5]),
  ]);
}
