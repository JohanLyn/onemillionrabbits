import * as THREE from 'three';
import { P, S, B, C, K, Cap, T, merge } from './toon.js';

// Every model is one merged BufferGeometry with vertex colors, facing +Z, feet at y=0.

const INK = 0x2b1d3a;
const WHITEC = 0xffffff;
const PINK = 0xff9ec4;
const dome = (r, w, h) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);

// ---------- rabbits ----------
const RABBIT = {
  bunny: { fur: 0xf4efe9, belly: 0xffffff, ear: 0.42, body: [1, 0.9, 1.05] },
  hare: { fur: 0xc98c55, belly: 0xf3d9b8, ear: 0.62, body: [0.85, 0.95, 1.15] },
  chonk: { fur: 0xa3a3b8, belly: 0xdcdcea, ear: 0.36, body: [1.35, 1.05, 1.3] },
  jackalope: { fur: 0x8a5a3a, belly: 0xd9b48f, ear: 0.4, body: [1, 0.95, 1.1] },
  bomb: { fur: 0x5b5566, belly: 0x8e889a, ear: 0.4, body: [1, 0.9, 1.05] },
  golden: { fur: 0xffcc33, belly: 0xfff0a6, ear: 0.48, body: [1, 0.9, 1.05] },
  boss: { fur: 0xe9e3f0, belly: 0xffffff, ear: 0.5, body: [1.25, 1.05, 1.2] },
};

export function rabbitGeo(kind) {
  const d = RABBIT[kind];
  const fur = d.fur, belly = d.belly;
  const eye = kind === 'golden' ? 0x3a2a00 : 0x150d1f;
  const g = [
    P(S(0.5), fur, [0, 0.5, 0], 0, d.body),
    P(S(0.34, 10, 8), belly, [0, 0.44, 0.24], 0, [1, 1.05, 0.8]),
    P(S(0.36), fur, [0, 1.0, 0.3]),
    P(S(0.14, 8, 6), belly, [0.16, 0.9, 0.53]),
    P(S(0.14, 8, 6), belly, [-0.16, 0.9, 0.53]),
    P(Cap(0.1, d.ear), fur, [0.14, 1.32 + d.ear * 0.5, 0.2], [-0.25, 0, -0.2]),
    P(Cap(0.1, d.ear), fur, [-0.14, 1.32 + d.ear * 0.5, 0.2], [-0.25, 0, 0.2]),
    P(Cap(0.055, d.ear * 0.8, 6), PINK, [0.145, 1.32 + d.ear * 0.5, 0.265], [-0.25, 0, -0.2], [1, 1, 0.45]),
    P(Cap(0.055, d.ear * 0.8, 6), PINK, [-0.145, 1.32 + d.ear * 0.5, 0.265], [-0.25, 0, 0.2], [1, 1, 0.45]),
    P(S(0.075, 8, 6), eye, [0.15, 1.08, 0.6]),
    P(S(0.075, 8, 6), eye, [-0.15, 1.08, 0.6]),
    P(S(0.028, 6, 4), WHITEC, [0.13, 1.12, 0.67]),
    P(S(0.028, 6, 4), WHITEC, [-0.17, 1.12, 0.67]),
    // angry eyebrows: these rabbits mean business
    P(B(0.17, 0.04, 0.04), INK, [0.15, 1.2, 0.61], [0, 0, 0.45]),
    P(B(0.17, 0.04, 0.04), INK, [-0.15, 1.2, 0.61], [0, 0, -0.45]),
    P(S(0.055, 8, 6), PINK, [0, 0.98, 0.66]),
    P(B(0.11, 0.09, 0.03), WHITEC, [0, 0.87, 0.63]),
    P(S(0.17, 8, 6), WHITEC, [0, 0.55, -0.52]),
    P(S(0.15, 8, 6), fur, [0.22, 0.07, 0.3], 0, [1, 0.55, 1.5]),
    P(S(0.15, 8, 6), fur, [-0.22, 0.07, 0.3], 0, [1, 0.55, 1.5]),
  ];
  if (kind === 'jackalope') {
    const horn = 0xf1e2c0;
    for (const sx of [1, -1]) {
      g.push(P(C(0.035, 0.05, 0.45, 6), horn, [sx * 0.22, 1.42, 0.28], [0, 0, -sx * 0.5]));
      g.push(P(C(0.025, 0.035, 0.22, 6), horn, [sx * 0.38, 1.55, 0.3], [0, 0, -sx * 1.3]));
      g.push(P(C(0.025, 0.035, 0.22, 6), horn, [sx * 0.3, 1.7, 0.28], [0, 0, -sx * 0.1]));
    }
  }
  if (kind === 'bomb') {
    g.push(P(S(0.32), 0x1d1a24, [0, 0.95, -0.38]));
    g.push(P(C(0.03, 0.03, 0.25, 6), 0xc7a26b, [0, 1.32, -0.42], [-0.4, 0, 0]));
    g.push(P(S(0.08, 6, 4), 0xffd23f, [0, 1.45, -0.48]));
    g.push(P(T(0.35, 0.05, 6, 14), 0xe3342f, [0, 1.12, 0.3], [Math.PI / 2 - 0.2, 0, 0], [1, 1, 1]));
  }
  if (kind === 'golden') {
    g.push(P(T(0.07, 0.015, 6, 12), 0x222222, [0.15, 1.08, 0.66]));
    g.push(P(C(0.006, 0.006, 0.3, 4), 0x222222, [0.22, 0.93, 0.66]));
  }
  if (kind === 'boss') {
    // crown + cape
    g.push(P(C(0.28, 0.25, 0.18, 10), 0xffc83d, [0, 1.38, 0.28]));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.push(P(K(0.07, 0.18, 6), 0xffc83d, [Math.sin(a) * 0.24, 1.55, 0.28 + Math.cos(a) * 0.24]));
    }
    g.push(P(S(0.06, 6, 4), 0xff3d6a, [0, 1.4, 0.55]));
    // royal ermine collar
    g.push(P(T(0.36, 0.09, 6, 16), 0xffffff, [0, 0.86, 0.12], [Math.PI / 2 + 0.25, 0, 0]));
    g.push(P(S(0.05, 6, 4), 0x2b1d3a, [0.2, 0.9, 0.4]));
    g.push(P(S(0.05, 6, 4), 0x2b1d3a, [-0.22, 0.86, 0.36]));
  }
  return merge(g);
}

export function hatGeo() {
  // Fancy top hat, baked at bunny head height so it can reuse each rabbit's matrix.
  return merge([
    P(C(0.27, 0.27, 0.03, 14), 0x1d1a24, [0, 1.33, 0.3], [-0.12, 0, 0.1]),
    P(C(0.16, 0.17, 0.32, 12), 0x1d1a24, [0.015, 1.5, 0.28], [-0.12, 0, 0.1]),
    P(C(0.175, 0.175, 0.06, 12), 0xd6264f, [0.01, 1.39, 0.29], [-0.12, 0, 0.1]),
  ]);
}

// ---------- the survivors ----------
function baseBody({ shirt, pants, skin = 0xffcf9f, shoes = 0x5a3a28 }) {
  return [
    P(S(0.16, 8, 6), shoes, [0.17, 0.09, 0.06], 0, [1, 0.6, 1.4]),
    P(S(0.16, 8, 6), shoes, [-0.17, 0.09, 0.06], 0, [1, 0.6, 1.4]),
    P(Cap(0.36, 0.42), pants, [0, 0.62, 0]),
    P(S(0.34, 12, 8), shirt, [0, 0.95, 0], 0, [1.08, 0.75, 1.0]),
    P(S(0.12, 8, 6), skin, [0.44, 0.75, 0.08]),
    P(S(0.12, 8, 6), skin, [-0.44, 0.75, 0.08]),
    P(Cap(0.1, 0.3, 6), shirt, [0.38, 0.92, 0.02], [0, 0, 0.5]),
    P(Cap(0.1, 0.3, 6), shirt, [-0.38, 0.92, 0.02], [0, 0, -0.5]),
    P(S(0.36), skin, [0, 1.48, 0]),
    P(S(0.06, 8, 6), 0x150d1f, [0.12, 1.52, 0.31]),
    P(S(0.06, 8, 6), 0x150d1f, [-0.12, 1.52, 0.31]),
    P(S(0.022, 6, 4), WHITEC, [0.105, 1.545, 0.365]),
    P(S(0.022, 6, 4), WHITEC, [-0.135, 1.545, 0.365]),
    P(S(0.08, 8, 6), 0xf5a07a, [0, 1.43, 0.35]),
    P(S(0.06, 6, 4), 0xff9a9a, [0.22, 1.4, 0.27]),
    P(S(0.06, 6, 4), 0xff9a9a, [-0.22, 1.4, 0.27]),
  ];
}

export function characterGeo(id) {
  let g;
  if (id === 'gardener') {
    g = baseBody({ shirt: 0xe6453a, pants: 0x3f72c9 });
    g.push(P(B(0.36, 0.3, 0.06), 0x3f72c9, [0, 0.9, 0.32]));
    g.push(P(C(0.62, 0.62, 0.05, 16), 0xf2cc5b, [0, 1.74, 0], [-0.08, 0, 0]));
    g.push(P(C(0.27, 0.32, 0.28, 14), 0xf2cc5b, [0, 1.9, -0.01], [-0.08, 0, 0]));
    g.push(P(C(0.325, 0.325, 0.07, 14), 0xe6453a, [0, 1.79, 0], [-0.08, 0, 0]));
    g.push(P(Cap(0.05, 0.18, 6), 0x7a4a2a, [0.08, 1.36, 0.33], [0, 0, 1.3]));
    g.push(P(Cap(0.05, 0.18, 6), 0x7a4a2a, [-0.08, 1.36, 0.33], [0, 0, -1.3]));
  } else if (id === 'chef') {
    g = baseBody({ shirt: 0xffffff, pants: 0x2f2f3a });
    g.push(P(C(0.27, 0.25, 0.4, 14), 0xffffff, [0, 1.95, 0]));
    g.push(P(S(0.3), 0xffffff, [0.12, 2.18, 0]));
    g.push(P(S(0.28), 0xffffff, [-0.14, 2.2, 0.02]));
    g.push(P(S(0.25), 0xffffff, [0, 2.26, -0.1]));
    g.push(P(T(0.24, 0.06, 6, 14), 0xe3342f, [0, 1.17, 0.02], [Math.PI / 2, 0, 0]));
    g.push(P(S(0.07, 8, 6), 0x2b1d3a, [0.1, 1.36, 0.33], 0, [1.6, 0.7, 1]));
    g.push(P(S(0.07, 8, 6), 0x2b1d3a, [-0.1, 1.36, 0.33], 0, [1.6, 0.7, 1]));
    g.push(P(S(0.04, 6, 4), 0xd9d9e0, [0, 0.98, 0.33]));
    g.push(P(S(0.04, 6, 4), 0xd9d9e0, [0, 0.84, 0.34]));
  } else if (id === 'dj') {
    g = baseBody({ shirt: 0x8f4bff, pants: 0x2a2a44, skin: 0xc68a5c, shoes: 0xffffff });
    g.push(P(T(0.4, 0.05, 6, 16, Math.PI), 0x1d1a24, [0, 1.52, 0], [0, Math.PI / 2, 0]));
    g.push(P(C(0.14, 0.14, 0.12, 12), 0x1d1a24, [0.38, 1.5, 0], [0, 0, Math.PI / 2]));
    g.push(P(C(0.14, 0.14, 0.12, 12), 0x1d1a24, [-0.38, 1.5, 0], [0, 0, Math.PI / 2]));
    g.push(P(C(0.1, 0.1, 0.13, 10), 0x3bf2ff, [0.39, 1.5, 0], [0, 0, Math.PI / 2]));
    g.push(P(C(0.1, 0.1, 0.13, 10), 0x3bf2ff, [-0.39, 1.5, 0], [0, 0, Math.PI / 2]));
    g.push(P(B(0.2, 0.1, 0.04), 0x111111, [0.12, 1.53, 0.33]));
    g.push(P(B(0.2, 0.1, 0.04), 0x111111, [-0.12, 1.53, 0.33]));
    g.push(P(B(0.08, 0.03, 0.03), 0x111111, [0, 1.55, 0.34]));
    g.push(P(T(0.22, 0.03, 6, 16), 0xffc83d, [0, 1.06, 0.12], [Math.PI / 2.4, 0, 0]));
    g.push(P(S(0.32, 10, 8), 0x7d3be0, [0, 1.62, -0.06], 0, [1.05, 0.7, 1.05]));
  } else if (id === 'monk') {
    g = baseBody({ shirt: 0x8b5a33, pants: 0xe8d6b0, skin: 0xffd9b0, shoes: 0x3a2618 });
    g.push(P(K(0.5, 0.8, 14), 0x8b5a33, [0, 0.42, 0]));
    g.push(P(S(0.42, 12, 8), 0x6e4426, [0, 1.52, -0.08], 0, [1, 1, 0.95]));
    g.push(P(B(0.72, 0.08, 0.72), 0x3a2618, [0, 0.82, 0]));
    g.push(P(Cap(0.04, 0.3, 6), 0xdddddd, [0, 1.25, 0.33], 0, [1.4, 1, 1]));
  } else {
    // grandma
    g = baseBody({ shirt: 0xff8fbf, pants: 0x8a6fb8, skin: 0xffd5b0, shoes: 0x7a4a6a });
    g.push(P(S(0.38), 0xd9d9e6, [0, 1.6, -0.06], 0, [1.05, 0.8, 1.05]));
    g.push(P(S(0.18, 10, 8), 0xd9d9e6, [0, 1.9, -0.18]));
    g.push(P(T(0.085, 0.018, 6, 14), 0x2b1d3a, [0.12, 1.52, 0.34]));
    g.push(P(T(0.085, 0.018, 6, 14), 0x2b1d3a, [-0.12, 1.52, 0.34]));
    g.push(P(T(0.22, 0.035, 6, 16), 0xffffff, [0, 1.12, 0.08], [Math.PI / 2.3, 0, 0]));
    g.push(P(S(0.05, 6, 4), 0xffffff, [0.08, 0.95, 0.32]));
    g.push(P(S(0.05, 6, 4), 0xffffff, [0.08, 0.78, 0.33]));
  }
  return merge(g);
}

// ---------- ridiculous weapons ----------
export function toastGeo() {
  return merge([
    P(B(0.6, 0.6, 0.14), 0xb86b2a),
    P(B(0.5, 0.5, 0.16), 0xf2cf8a),
    P(S(0.16, 8, 6), 0xffe066, [0, 0.12, 0.08], 0, [1, 1, 0.25]),
    P(S(0.12, 8, 6), 0xb86b2a, [0, 0.3, 0], 0, [2.4, 1, 0.58]),
  ]);
}
export function chickenGeo() {
  return merge([
    P(S(0.24), 0xffe14d, [0, 0, 0], 0, [0.9, 0.85, 1.6]),
    P(S(0.15, 10, 8), 0xffe14d, [0, 0.2, 0.36]),
    P(K(0.06, 0.14, 6), 0xff8a1f, [0, 0.2, 0.55], [Math.PI / 2, 0, 0]),
    P(B(0.04, 0.1, 0.18), 0xe3342f, [0, 0.36, 0.34]),
    P(S(0.035, 6, 4), 0xe3342f, [0, 0.11, 0.48]),
    P(S(0.03, 6, 4), 0x150d1f, [0.09, 0.25, 0.47]),
    P(S(0.03, 6, 4), 0x150d1f, [-0.09, 0.25, 0.47]),
    P(C(0.025, 0.025, 0.3, 5), 0xff8a1f, [0.08, -0.2, -0.25], [0.9, 0, 0]),
    P(C(0.025, 0.025, 0.3, 5), 0xff8a1f, [-0.08, -0.2, -0.25], [0.9, 0, 0]),
    P(S(0.1, 6, 4), 0xffe14d, [0.2, 0.05, 0], 0, [0.5, 1, 1.6]),
    P(S(0.1, 6, 4), 0xffe14d, [-0.2, 0.05, 0], 0, [0.5, 1, 1.6]),
  ]);
}
export function beeGeo() {
  return merge([
    P(S(0.14, 8, 6), 0xffd23f, [0, 0, 0], 0, [1, 1, 1.35]),
    P(C(0.142, 0.142, 0.05, 10), 0x1d1a24, [0, 0, 0.03], [Math.PI / 2, 0, 0]),
    P(C(0.12, 0.12, 0.05, 10), 0x1d1a24, [0, 0, -0.1], [Math.PI / 2, 0, 0]),
    P(S(0.09, 6, 4), 0xeaf6ff, [0.1, 0.12, -0.02], 0, [0.4, 1, 1.4]),
    P(S(0.09, 6, 4), 0xeaf6ff, [-0.1, 0.12, -0.02], 0, [0.4, 1, 1.4]),
    P(K(0.03, 0.08, 5), 0x1d1a24, [0, 0, -0.22], [-Math.PI / 2, 0, 0]),
  ]);
}
export function slipperGeo() {
  return merge([
    P(S(0.5, 12, 8), 0xff7fb6, [0, 0, 0], 0, [1, 0.32, 2]),
    P(S(0.42, 12, 8), 0xffc2dc, [0, 0.12, -0.3], 0, [0.9, 0.18, 1.3]),
    P(S(0.46, 12, 8), 0xff7fb6, [0, 0.16, 0.5], 0, [1, 0.55, 0.9]),
    P(S(0.28, 8, 6), 0xffffff, [0, 0.42, 0.62]),
  ]);
}
export function bananaGeo() {
  const y = 0xffe14d;
  return merge([
    P(S(0.16, 8, 6), 0xf7d23a, [0, 0.07, 0], 0, [1, 0.6, 1]),
    P(Cap(0.08, 0.38, 6), y, [0.22, 0.04, 0.06], [Math.PI / 2, 0, -1.2], [1, 1, 0.5]),
    P(Cap(0.08, 0.38, 6), y, [-0.2, 0.04, 0.1], [Math.PI / 2, 0, 1.3], [1, 1, 0.5]),
    P(Cap(0.08, 0.38, 6), y, [0.02, 0.04, -0.26], [Math.PI / 2 + 0.2, 0, 0.1], [1, 1, 0.5]),
    P(C(0.035, 0.05, 0.14, 6), 0x6b4a1f, [0, 0.2, 0]),
  ]);
}
export function sabreHiltGeo() {
  return merge([
    P(C(0.07, 0.07, 0.42, 10), 0xb8bcc9),
    P(C(0.075, 0.075, 0.18, 10), 0x2b2b33, [0, -0.05, 0]),
    P(C(0.1, 0.1, 0.05, 10), 0x7c7f8c, [0, 0.21, 0]),
    P(B(0.05, 0.08, 0.05), 0xe3342f, [0.08, 0.06, 0]),
  ]);
}
export function plungerGeo() {
  return merge([
    P(C(0.04, 0.04, 0.9, 6), 0xb07a3c, [0, 0.45, 0]),
    P(dome(0.22, 10, 6), 0xe3342f, [0, 0, 0], [Math.PI, 0, 0], [1, 0.8, 1]),
  ]);
}
export function bagpipeGeo() {
  return merge([
    P(S(0.3, 10, 8), 0xc0253f, [0, 0, 0], 0, [1, 0.8, 1.2]),
    P(B(0.62, 0.05, 0.3), 0x2e7d32, [0, 0.05, 0], [0, 0.6, 0]),
    P(C(0.03, 0.035, 0.7, 6), 0x2b1d3a, [0.15, 0.35, -0.1], [0.2, 0, -0.2]),
    P(C(0.03, 0.035, 0.6, 6), 0x2b1d3a, [0, 0.38, -0.15], [0.3, 0, 0]),
    P(C(0.03, 0.035, 0.5, 6), 0x2b1d3a, [-0.15, 0.3, -0.1], [0.2, 0, 0.3]),
  ]);
}

// ---------- pickups ----------
export function carrotGeo(body = 0xff8a1f, leaf = 0x4caf50) {
  return merge([
    P(K(0.13, 0.5, 8), body, [0, 0, 0], [Math.PI, 0, 0]),
    P(K(0.05, 0.22, 5), leaf, [0.03, 0.33, 0], [0, 0, -0.3]),
    P(K(0.05, 0.24, 5), leaf, [-0.03, 0.34, 0], [0, 0, 0.3]),
    P(K(0.05, 0.2, 5), leaf, [0, 0.32, 0.03], [0.3, 0, 0]),
  ]);
}
export function cakeGeo() {
  const w = Math.PI / 3;
  const slice = (r, h, col, y) => {
    const g = new THREE.CylinderGeometry(r, r, h, 8, 1, false, -w / 2, w);
    return P(g, col, [0, y, 0]);
  };
  return merge([
    slice(0.45, 0.14, 0xf6d28b, 0.07),
    slice(0.45, 0.05, 0xff7fb6, 0.165),
    slice(0.45, 0.14, 0xf6d28b, 0.26),
    slice(0.46, 0.06, 0xffffff, 0.36),
    P(S(0.07, 8, 6), 0xe3342f, [0, 0.45, 0.3]),
  ]);
}
export function magnetGeo() {
  return merge([
    P(T(0.3, 0.11, 6, 12, Math.PI), 0xe3342f, [0, 0.3, 0]),
    P(C(0.11, 0.11, 0.18, 8), 0xd0d4de, [0.3, 0.21, 0]),
    P(C(0.11, 0.11, 0.18, 8), 0xd0d4de, [-0.3, 0.21, 0]),
  ]);
}
export function chestGeo() {
  return merge([
    P(B(1, 0.6, 0.7), 0xa0612d, [0, 0.3, 0]),
    P(new THREE.CylinderGeometry(0.35, 0.35, 1, 10, 1, false, 0, Math.PI), 0xb8743a, [0, 0.6, 0], [0, 0, Math.PI / 2]),
    P(B(1.04, 0.1, 0.74), 0xffc83d, [0, 0.6, 0]),
    P(B(0.1, 0.62, 0.74), 0xffc83d, [0.38, 0.32, 0]),
    P(B(0.1, 0.62, 0.74), 0xffc83d, [-0.38, 0.32, 0]),
    P(B(0.18, 0.22, 0.1), 0xffc83d, [0, 0.55, 0.38]),
  ]);
}
export function heartGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.3, -0.6, -0.1, -0.5, 0.25);
  s.bezierCurveTo(-0.4, 0.55, -0.05, 0.5, 0, 0.25);
  s.bezierCurveTo(0.05, 0.5, 0.4, 0.55, 0.5, 0.25);
  s.bezierCurveTo(0.6, -0.1, 0.15, -0.3, 0, -0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -0.075);
  return merge([P(g, 0xff4f8e)]);
}

// ---------- scenery ----------
export function treeGeo() {
  return merge([
    P(C(0.25, 0.38, 1.6, 8), 0x8a5a33, [0, 0.8, 0]),
    P(S(1.35, 12, 9), 0x4fb848, [0, 2.5, 0]),
    P(S(0.95, 10, 8), 0x5fcf55, [0.75, 2.15, 0.35]),
    P(S(0.85, 10, 8), 0x46a83f, [-0.6, 2.95, -0.25]),
    P(S(0.7, 10, 8), 0x5fcf55, [-0.55, 2.0, 0.6]),
  ]);
}
export function pineGeo() {
  return merge([
    P(C(0.2, 0.3, 1.2, 8), 0x7a4a2a, [0, 0.6, 0]),
    P(K(1.4, 1.8, 10), 0x2f9e5a, [0, 1.8, 0]),
    P(K(1.1, 1.5, 10), 0x37b064, [0, 2.7, 0]),
    P(K(0.75, 1.2, 10), 0x3fc06e, [0, 3.5, 0]),
  ]);
}
export function bushGeo() {
  return merge([
    P(S(0.6, 10, 8), 0x4fb848, [0, 0.4, 0]),
    P(S(0.45, 10, 8), 0x5fcf55, [0.5, 0.32, 0.1]),
    P(S(0.42, 10, 8), 0x46a83f, [-0.45, 0.3, -0.1]),
    P(S(0.08, 6, 4), 0xe3342f, [0.3, 0.75, 0.35]),
    P(S(0.08, 6, 4), 0xe3342f, [-0.2, 0.62, 0.45]),
    P(S(0.08, 6, 4), 0xe3342f, [0.6, 0.5, 0.45]),
  ]);
}
export function flowerGeo(color) {
  const g = [P(S(0.08, 6, 4), 0xffd23f, [0, 0.12, 0])];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.push(P(S(0.09, 6, 4), color, [Math.cos(a) * 0.12, 0.1, Math.sin(a) * 0.12], 0, [1, 0.4, 1]));
  }
  return merge(g);
}
export function mushroomGeo() {
  return merge([
    P(C(0.1, 0.13, 0.3, 8), 0xfff3dc, [0, 0.15, 0]),
    P(dome(0.28, 10, 6), 0xe3342f, [0, 0.28, 0]),
    P(S(0.05, 6, 4), 0xffffff, [0.12, 0.45, 0.08]),
    P(S(0.04, 6, 4), 0xffffff, [-0.1, 0.46, -0.05]),
    P(S(0.045, 6, 4), 0xffffff, [0, 0.52, -0.13]),
  ]);
}
export function grassGeo() {
  return merge([
    P(K(0.05, 0.35, 4), 0x46a83f, [0, 0.17, 0], [0, 0, 0.2]),
    P(K(0.05, 0.28, 4), 0x5fcf55, [0.07, 0.14, 0.03], [0, 0, -0.35]),
    P(K(0.05, 0.3, 4), 0x3d9a37, [-0.06, 0.15, -0.03], [0.3, 0, 0.1]),
  ]);
}
export function postGeo() {
  return merge([P(B(0.25, 1.3, 0.25), 0xc9935a, [0, 0.65, 0]), P(K(0.2, 0.2, 4), 0xc9935a, [0, 1.4, 0], [0, Math.PI / 4, 0])]);
}
export function barnGeo() {
  const roof = new THREE.CylinderGeometry(3.6, 3.6, 8.4, 3, 1);
  return merge([
    P(B(7, 4.5, 8), 0xd43b3b, [0, 2.25, 0]),
    P(roof, 0x6b4a3a, [0, 5.2, 0], [Math.PI / 2, 0, Math.PI / 2], [1.15, 1, 0.55]),
    P(B(3, 3.2, 0.12), 0xffffff, [0, 1.6, 4.02]),
    P(B(2.6, 2.8, 0.14), 0xb32d2d, [0, 1.6, 4.03]),
    P(B(0.18, 3.7, 0.16), 0xffffff, [0, 1.6, 4.06], [0, 0, 0.75]),
    P(B(0.18, 3.7, 0.16), 0xffffff, [0, 1.6, 4.06], [0, 0, -0.75]),
    P(B(1.1, 1.1, 0.12), 0xffffff, [0, 4.6, 3.6]),
    P(B(0.85, 0.85, 0.14), 0x3a2618, [0, 4.6, 3.62]),
  ]);
}
export function scarecrowGeo() {
  return merge([
    P(C(0.08, 0.08, 2.6, 6), 0x8a5a33, [0, 1.3, 0]),
    P(C(0.06, 0.06, 2.0, 6), 0x8a5a33, [0, 1.9, 0], [0, 0, Math.PI / 2]),
    P(B(0.9, 0.9, 0.4), 0x3f72c9, [0, 1.65, 0]),
    P(S(0.32), 0xe8c27a, [0, 2.45, 0]),
    P(C(0.55, 0.55, 0.04, 14), 0xf2cc5b, [0, 2.7, 0]),
    P(K(0.28, 0.4, 12), 0xf2cc5b, [0, 2.9, 0]),
    P(S(0.05, 6, 4), 0x150d1f, [0.1, 2.5, 0.29]),
    P(S(0.05, 6, 4), 0x150d1f, [-0.1, 2.5, 0.29]),
    P(K(0.05, 0.25, 6), 0xff8a1f, [0, 2.42, 0.38], [Math.PI / 2, 0, 0]),
  ]);
}
