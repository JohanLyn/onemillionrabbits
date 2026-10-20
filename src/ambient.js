import * as THREE from 'three';
import { G, dummy, rand } from './core.js';
import { Inst, toon, vtoon, P, S, merge } from './toon.js';

// Ambient life around the player: butterflies and drifting petals by day, fireflies at night.
// Everything lives in a box around the player and wraps around it, so nothing is ever spawned.
let flies, bugs, petals;
const BF = [], FF = [], PT = [];
const _c = new THREE.Color();
const BF_COLS = [0xffd23f, 0xff8fc8, 0x9bd8ff, 0xffffff, 0xff9a3c].map((c) => new THREE.Color(c));
const PT_COLS = [0xffffff, 0xffd6ea, 0xfff4b8, 0xffc2dc].map((c) => new THREE.Color(c));
const FF_COL = new THREE.Color(0xd8ff7a);
let initLow = false;
let hx = 20, zb = 26, zf = 12; // box half-width, distance behind (screen top) and in front

function butterflyGeo() {
  return merge([
    P(S(0.16, 8, 6), 0xffffff, [0.16, 0.02, 0.04], 0, [1, 0.12, 0.8]),
    P(S(0.16, 8, 6), 0xffffff, [-0.16, 0.02, 0.04], 0, [1, 0.12, 0.8]),
    P(S(0.11, 8, 6), 0xeeeeee, [0.12, 0, -0.12], 0, [1, 0.12, 0.7]),
    P(S(0.11, 8, 6), 0xeeeeee, [-0.12, 0, -0.12], 0, [1, 0.12, 0.7]),
    P(S(0.04, 6, 4), 0x2b1d3a, [0, 0.01, 0], 0, [1, 1, 4]),
  ]);
}
function fireflyGeo() {
  // bright core inside a dim halo; drawn additively so it reads as a glow
  return merge([P(S(0.07, 6, 4), 0xffffff), P(S(0.2, 8, 6), 0x1c2608)]);
}

// Wrap a coordinate into [c - lo, c + hi).
const wrap = (v, c, lo, hi) => {
  const span = lo + hi;
  let d = v - c + lo;
  d -= Math.floor(d / span) * span;
  return c - lo + d;
};

export function initAmbient() {
  const low = (initLow = G.lowPower);
  const nB = low ? 8 : 18, nF = low ? 18 : 42, nP = low ? 18 : 46;
  flies = new Inst(butterflyGeo(), nB, { mat: vtoon({ side: THREE.DoubleSide }), outline: 0, colors: true });
  bugs = new Inst(fireflyGeo(), nF, {
    mat: new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
    outline: 0,
    colors: true,
  });
  bugs.mesh.renderOrder = 3;
  petals = new Inst(new THREE.CircleGeometry(0.09, 6), nP, { mat: toon(0xffffff, { side: THREE.DoubleSide }), outline: 0, colors: true });
  for (let i = 0; i < nB; i++) BF.push({ x: rand(-hx, hx), z: rand(-zb, zf), y: rand(0.8, 2), a: rand(0, 6.3), t: rand(0, 9), c: BF_COLS[i % BF_COLS.length] });
  for (let i = 0; i < nF; i++) FF.push({ x: rand(-hx, hx), z: rand(-zb, zf), y: rand(0.3, 2.6), t: rand(0, 20), s: rand(0.7, 1.3) });
  for (let i = 0; i < nP; i++) PT.push({ x: rand(-hx, hx), z: rand(-zb, zf), y: rand(0, 5), t: rand(0, 20), c: PT_COLS[i % PT_COLS.length] });
}

export function updateAmbient(dt, night) {
  const p = G.player;
  const ax = p ? p.x : 0, az = p ? p.z : 0;
  const vr = G.viewR || 30;
  hx = vr * 0.75;
  zb = vr * 0.95;
  zf = vr * 0.5;
  const day = 1 - night;
  // a Quality switch to low power mid-session halves the swarm
  const share = G.lowPower && !initLow ? 0.5 : 1;

  flies.begin();
  if (day > 0.05) {
    for (let i = 0, n = Math.ceil(BF.length * share); i < n; i++) {
      const b = BF[i];
      b.t += dt;
      // wander: a slowly turning heading with a little flutter
      b.a += Math.sin(b.t * 0.7) * dt * 1.4 + Math.sin(b.t * 2.3) * dt;
      b.x = wrap(b.x + Math.sin(b.a) * dt * 2.2, ax, hx, hx);
      b.z = wrap(b.z + Math.cos(b.a) * dt * 2.2, az, zb, zf);
      const flap = Math.abs(Math.sin(b.t * 15));
      dummy.position.set(b.x, b.y + Math.sin(b.t * 2) * 0.35 + flap * 0.08, b.z);
      dummy.rotation.set(0, b.a, 0);
      dummy.scale.set(day * (0.15 + flap), day, day);
      flies.push(b.c);
    }
  }
  flies.end();

  bugs.begin();
  if (night > 0.05) {
    for (let i = 0, n = Math.ceil(FF.length * share); i < n; i++) {
      const f = FF[i];
      f.t += dt;
      f.x = wrap(f.x + Math.sin(f.t * 0.5 + f.s * 7) * dt * 0.9, ax, hx, hx);
      f.z = wrap(f.z + Math.cos(f.t * 0.37 + f.s * 3) * dt * 0.9, az, zb, zf);
      const blink = Math.max(0, Math.sin(f.t * 1.6 * f.s + f.s * 10));
      dummy.position.set(f.x, f.y + Math.sin(f.t * 0.9) * 0.4, f.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(f.s * (0.6 + 0.4 * blink) * night);
      bugs.push(_c.copy(FF_COL).multiplyScalar(0.25 + blink * 0.9 * night));
    }
  }
  bugs.end();

  petals.begin();
  const nP = day > 0.05 ? Math.ceil(PT.length * share) : 0;
  for (let i = 0; i < nP; i++) {
    const q = PT[i];
    q.t += dt;
    // carried on the breeze, sinking slowly, then blown back in from upwind
    q.x = wrap(q.x + dt * (1.6 + Math.sin(q.t * 0.8) * 0.8), ax, hx, hx);
    q.z = wrap(q.z + dt * (0.6 + Math.cos(q.t * 0.6)), az, zb, zf);
    q.y -= dt * 0.35;
    if (q.y < 0.1) q.y = 5;
    dummy.position.set(q.x, q.y, q.z);
    dummy.rotation.set(q.t * 2.1, q.t * 1.3, q.t * 0.7);
    dummy.scale.setScalar(day);
    petals.push(q.c);
  }
  petals.end();
}
