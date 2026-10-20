import * as THREE from 'three';
import { G, dummy, rand } from './core.js';
import { Inst, toon, vtoon } from './toon.js';
import { heartGeo, starGeo } from './models.js';
import { sfx } from './audio.js';

// ---------- particles (fluff, sparks, crumbs) ----------
const PCAP = 900;
const SCAP = 160; // cartoon stars
const GCAP = 200; // additive glows: flashes, sparkles, level-up motes
const MCAP = 140; // smoke and dust puffs
let parts, partInst;
let stars, starInst;
let glows, glowInst;
let smokes, smokeInst;
let hearts, heartInst;
let beams, beamInst;
let pillar, pillarT = 0, pillarX = 0, pillarZ = 0;
let flats = [];
let floaters = [];
const _up = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();
const PILLAR_LIFE = 1.1;
const GOLD = 0xffcc33;

const mkPool = (n, extra) => Array.from({ length: n }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, grav: 0, drag: 0, rot: 0, c: new THREE.Color(), ...extra() }));

export function initFx() {
  parts = mkPool(PCAP, () => ({}));
  partInst = new Inst(new THREE.IcosahedronGeometry(0.5, 0), PCAP, { mat: toon(0xffffff), outline: 0, colors: true });
  stars = mkPool(SCAP, () => ({ spin: 0 }));
  starInst = new Inst(starGeo(), SCAP, { mat: new THREE.MeshBasicMaterial({ color: 0xffffff }), outline: 0.06, colors: true });
  glows = mkPool(GCAP, () => ({ s1: 1 }));
  glowInst = new Inst(new THREE.IcosahedronGeometry(1, 1), GCAP, {
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
    outline: 0,
    colors: true,
  });
  glowInst.mesh.renderOrder = 3;
  smokes = mkPool(MCAP, () => ({ s1: 1, c1: new THREE.Color() }));
  smokeInst = new Inst(new THREE.IcosahedronGeometry(0.5, 1), MCAP, { mat: toon(0xffffff), outline: 0.05, colors: true });
  hearts = Array.from({ length: 60 }, () => ({ life: 0, x: 0, y: 0, z: 0 }));
  heartInst = new Inst(heartGeo(), 60, { mat: vtoon(), outline: 0.05 });
  beams = Array.from({ length: 160 }, () => ({ life: 0, max: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), w: 0.1, c: new THREE.Color() }));
  const bg = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  bg.translate(0, 0.5, 0);
  beamInst = new Inst(bg, 160, {
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    outline: 0,
    colors: true,
  });

  // level-up light pillar: an open tube fading to black (= transparent when added) toward the top
  const pg = new THREE.CylinderGeometry(1, 1, 1, 24, 4, true);
  pg.translate(0, 0.5, 0);
  const pc = new Float32Array(pg.attributes.position.count * 3);
  for (let i = 0; i < pg.attributes.position.count; i++) {
    const k = Math.pow(1 - pg.attributes.position.getY(i), 1.6);
    pc[i * 3] = pc[i * 3 + 1] = pc[i * 3 + 2] = k;
  }
  pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  pillar = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0x8fe8ff, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  pillar.visible = false;
  pillar.renderOrder = 3;
  pillar.frustumCulled = false;
  G.scene.add(pillar);

  const ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  for (let i = 0; i < 50; i++) {
    const disc = i >= 30;
    const m = new THREE.Mesh(disc ? discGeo : ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    m.visible = false;
    m.renderOrder = 2;
    G.scene.add(m);
    flats.push({ mesh: m, disc, life: 0 });
  }
  const layer = document.getElementById('floaters');
  for (let i = 0; i < 45; i++) {
    const el = document.createElement('div');
    el.className = 'dmg';
    el.style.display = 'none';
    layer.appendChild(el);
    floaters.push({ el, life: 0, x: 0, y: 0, z: 0 });
  }
}

let pi = 0;
export function particle(x, y, z, vx, vy, vz, color, size = 0.3, life = 0.6, grav = -18, drag = 2) {
  const p = parts[pi];
  pi = (pi + 1) % PCAP;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.c.set(color);
  p.s = size;
  p.life = p.max = life;
  p.grav = grav;
  p.drag = drag;
  p.rot = rand(0, 6);
}

export function burst(x, y, z, n, colors, speed = 6, size = 0.3, life = 0.6, up = 4) {
  const lim = G.lowPower ? Math.ceil(n * 0.6) : n;
  for (let i = 0; i < lim; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
    particle(x, y, z, Math.cos(a) * s, rand(0.3, 1) * up + 1, Math.sin(a) * s, colors[i % colors.length], size * rand(0.6, 1.3), life * rand(0.7, 1.2));
  }
}

// A spinning cartoon star that pops out, arcs and shrinks away.
let si = 0;
export function star(x, y, z, vx, vy, vz, color = 0xffe14d, size = 0.35, life = 0.5) {
  const p = stars[si];
  si = (si + 1) % SCAP;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.c.set(color);
  p.s = size;
  p.life = p.max = life;
  p.rot = rand(0, 6);
  p.spin = rand(-12, 12);
  p.grav = -16;
  p.drag = 1.5;
}

// Additive glow ball growing from size s to s1 while fading out.
let gi = 0;
export function glow(x, y, z, color, s = 0.3, s1 = s, life = 0.4, vx = 0, vy = 0, vz = 0, grav = 0, drag = 0) {
  const p = glows[gi];
  gi = (gi + 1) % GCAP;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.c.set(color);
  p.s = s;
  p.s1 = s1;
  p.life = p.max = life;
  p.grav = grav;
  p.drag = drag;
}

// Toon smoke puff: swells from s to s1, drifts up and fades from color to color1.
let mi = 0;
export function smoke(x, y, z, s = 0.6, s1 = 1.6, life = 0.9, color = 0x6b6370, color1 = 0xd8d2dc, vx = 0, vy = 1.5, vz = 0) {
  const p = smokes[mi];
  mi = (mi + 1) % MCAP;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.c.set(color);
  p.c1.set(color1);
  p.s = s;
  p.s1 = s1;
  p.life = p.max = life;
  p.rot = rand(0, 6);
  p.drag = 2.5;
}

// Golden twinkles: little stars and glints. For golden bunnies, chests and anything shiny.
export function sparkle(x, y, z, n = 6, color = GOLD, spread = 1) {
  const lim = G.lowPower ? Math.ceil(n * 0.5) : n;
  for (let i = 0; i < lim; i++) {
    const a = rand(0, Math.PI * 2), s = rand(1, 3.5) * spread;
    star(x, y, z, Math.cos(a) * s, rand(3, 7), Math.sin(a) * s, i % 3 ? color : 0xffffff, rand(0.18, 0.32), rand(0.5, 0.8));
    glow(x + rand(-0.6, 0.6) * spread, y + rand(-0.3, 0.8), z + rand(-0.6, 0.6) * spread, color, 0.05, rand(0.25, 0.45), rand(0.25, 0.45));
  }
}

// Ground dust kicked up by feet or landings.
export function dust(x, z, scale = 1, n = 4) {
  const lim = G.lowPower ? Math.ceil(n / 2) : n;
  for (let i = 0; i < lim; i++) {
    const a = rand(0, Math.PI * 2), s = rand(1.2, 2.4) * scale;
    smoke(x, 0.15, z, 0.25 * scale, rand(0.5, 0.8) * scale, rand(0.35, 0.55), 0xe9dcc0, 0xf8f2e6, Math.cos(a) * s, rand(0.3, 1), Math.sin(a) * s);
  }
}

export function poof(x, z, scale = 1, fur = 0xffffff) {
  burst(x, 0.6 * scale, z, 7, [0xffffff, fur, 0xfff0f6], 5 * scale, 0.32 * scale, 0.5, 4);
  // a couple of "KO" stars, plus a soft flash on beefier deaths
  const nStars = G.lowPower ? 1 : 2;
  for (let i = 0; i < nStars; i++) {
    const a = rand(0, Math.PI * 2);
    star(x, 0.9 * scale, z, Math.cos(a) * 3, rand(4, 6), Math.sin(a) * 3, i ? 0xffffff : 0xffe14d, 0.26 * Math.sqrt(scale), 0.45);
  }
  if (scale > 1.2) glow(x, 0.7 * scale, z, 0x9a8a70, 0.3 * scale, 1.2 * scale, 0.16);
  if (fur === GOLD) sparkle(x, 1, z, 8);
}

export function explosion(x, z, r, color = 0xff8a1f, shake = 0.4) {
  burst(x, 0.5, z, 16, [0xffe14d, color, 0xff4d2e, 0xffffff], r * 3.2, 0.5, 0.55, 7);
  ring(x, z, r * 0.3, r, 0.35, 0xffd23f, 0.9);
  // fireball flash, then a mushroom of cartoon smoke
  glow(x, 0.8, z, 0xffd27a, r * 0.25, r * 0.85, 0.22);
  glow(x, 0.8, z, color, r * 0.15, r * 0.55, 0.3);
  const n = G.lowPower ? 3 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), d = r * rand(0.15, 0.45);
    smoke(x + Math.cos(a) * d, 0.8, z + Math.sin(a) * d, r * 0.12, r * rand(0.24, 0.34), rand(0.5, 0.7), 0x6e6472, 0xfaf6fb, Math.cos(a) * r * 0.9, rand(4, 6), Math.sin(a) * r * 0.9);
  }
  G.shake = Math.max(G.shake, shake);
  sfx('boom');
}

// Level-up: a pillar of light, a double shockwave and motes spiralling up. Hook it to the card pick.
export function levelUpFx(x, z) {
  pillarT = PILLAR_LIFE;
  pillarX = x;
  pillarZ = z;
  pillar.visible = true;
  ring(x, z, 0.5, 6, 0.6, 0x7fe8ff, 0.9);
  ring(x, z, 0.3, 3.5, 0.45, 0xffe14d, 0.9);
  const n = G.lowPower ? 10 : 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, s = rand(1.5, 3);
    glow(x + Math.cos(a) * 0.8, rand(0.2, 1.2), z + Math.sin(a) * 0.8, i % 3 ? 0x7fe8ff : 0xffe14d, 0.12, 0.02, rand(0.8, 1.2), -Math.sin(a) * s, rand(4, 8), Math.cos(a) * s, 0, 1.5);
  }
  for (let i = 0; i < 5; i++) {
    const a = rand(0, Math.PI * 2);
    star(x, 1.4, z, Math.cos(a) * 3, rand(6, 9), Math.sin(a) * 3, i % 2 ? 0x7fe8ff : 0xffe14d, 0.3, 0.8);
  }
  glow(x, 1, z, 0xbff4ff, 0.6, 2.6, 0.3);
}

export function heart(x, y, z) {
  for (const h of hearts) {
    if (h.life <= 0) {
      h.life = 1.2;
      h.x = x; h.y = y; h.z = z;
      return;
    }
  }
}

export function beam(a, b, color, w = 0.12, life = 0.12) {
  for (const bm of beams) {
    if (bm.life <= 0) {
      bm.a.copy(a);
      bm.b.copy(b);
      bm.c.set(color);
      bm.w = w;
      bm.life = bm.max = life;
      return;
    }
  }
}

// Zig-zag lightning bolt between two points, built from beam segments.
const _prev = new THREE.Vector3(), _p = new THREE.Vector3();
export function lightning(a, b, color = 0xfff27a, w = 0.1) {
  const segs = 5;
  _prev.copy(a);
  for (let i = 1; i <= segs; i++) {
    _p.lerpVectors(a, b, i / segs);
    if (i < segs) {
      _p.x += rand(-0.5, 0.5);
      _p.y += rand(-0.3, 0.5);
      _p.z += rand(-0.5, 0.5);
    }
    beam(_prev, _p, color, w, 0.16);
    beam(_prev, _p, 0xffffff, w * 0.4, 0.16);
    _prev.copy(_p);
  }
  glow(b.x, b.y, b.z, color, 0.2, 0.7, 0.14);
}

// Flat ground effect: expanding shockwave ring, or a filling danger disc.
export function ring(x, z, r0, r1, life, color, opacity = 0.8, disc = false) {
  for (const f of flats) {
    if (f.life <= 0 && f.disc === disc) {
      f.life = f.max = life;
      f.x = x; f.z = z;
      f.r0 = r0; f.r1 = r1;
      f.op = opacity;
      f.mesh.material.color.set(color);
      f.mesh.visible = true;
      return f;
    }
  }
  return null;
}
export const telegraph = (x, z, r, life, color = 0xff3355) => ring(x, z, r * 0.2, r, life, color, 0.35, true);

export function floater(text, x, y, z, cls = '') {
  // the "damage numbers" setting hides plain and crit numbers, never heal/gold/love text
  if (G.settings?.numbers === false && (cls === '' || cls === 'crit') && /^[-+]?\d/.test(text)) return;
  for (const f of floaters) {
    if (f.life <= 0) {
      f.life = 0.8;
      f.x = x + rand(-0.3, 0.3);
      f.y = y;
      f.z = z + rand(-0.3, 0.3);
      f.el.textContent = text;
      f.el.className = 'dmg ' + cls;
      f.el.style.display = 'block';
      return;
    }
  }
}

let bannerTimer = 0;
export function banner(text, sub = '') {
  const el = document.getElementById('banner');
  el.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 2700);
}

export function clearFx() {
  for (const pool of [parts, stars, glows, smokes, hearts, beams]) for (const p of pool) p.life = 0;
  pillarT = 0;
  pillar.visible = false;
  for (const f of flats) {
    f.life = 0;
    f.mesh.visible = false;
  }
  for (const f of floaters) {
    f.life = 0;
    f.el.style.display = 'none';
  }
}

// Shared motion for the pooled particles: gravity, drag, a bouncy floor.
function move(p, dt) {
  p.life -= dt;
  p.vy += p.grav * dt;
  const k = Math.exp(-p.drag * dt);
  p.vx *= k; p.vz *= k;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.4; }
  return Math.max(0, p.life / p.max);
}

export function updateFx(dt, realDt) {
  partInst.begin();
  for (const p of parts) {
    if (p.life <= 0) continue;
    const t = move(p, dt);
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rot, p.rot * 1.3, 0);
    dummy.scale.setScalar(p.s * (0.3 + 0.7 * t));
    partInst.push(p.c);
  }
  partInst.end();

  // stars face the camera and spin in its plane
  const camQ = G.camera.quaternion;
  starInst.begin();
  for (const p of stars) {
    if (p.life <= 0) continue;
    const t = move(p, dt);
    p.rot += p.spin * dt;
    dummy.position.set(p.x, p.y, p.z);
    dummy.quaternion.copy(camQ).multiply(_q.setFromAxisAngle(_zAxis, p.rot));
    // pop in fast, then shrink away
    dummy.scale.setScalar(p.s * Math.min(1, (1 - t) * 8) * (t < 0.4 ? t / 0.4 : 1));
    starInst.push(p.c);
  }
  starInst.end();
  dummy.rotation.set(0, 0, 0);

  glowInst.begin();
  for (const p of glows) {
    if (p.life <= 0) continue;
    const t = move(p, dt);
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.setScalar(p.s1 + (p.s - p.s1) * t);
    glowInst.push(_c.copy(p.c).multiplyScalar(t * t));
  }
  glowInst.end();

  smokeInst.begin();
  for (const p of smokes) {
    if (p.life <= 0) continue;
    p.life -= dt;
    const t = Math.max(0, p.life / p.max), age = 1 - t;
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vz *= k; p.vy *= k;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rot, p.rot * 0.7 + age, 0);
    // swell quickly, hold, then shrink to nothing
    dummy.scale.setScalar((p.s + (p.s1 - p.s) * Math.min(1, age * 3)) * Math.min(1, t * 2.2));
    smokeInst.push(_c.copy(p.c).lerp(p.c1, Math.min(1, age * 1.6)));
  }
  smokeInst.end();

  if (pillarT > 0) {
    pillarT -= dt;
    const age = 1 - Math.max(0, pillarT) / PILLAR_LIFE;
    if (pillarT <= 0) pillar.visible = false;
    pillar.position.set(pillarX, 0, pillarZ);
    const w = 1.3 * (1 - age * 0.7) * Math.min(1, age * 10);
    pillar.scale.set(w, 14 * Math.min(1, age * 5), w);
    pillar.rotation.y += dt * 3;
    pillar.material.color.setRGB(0.3, 0.6, 0.75).multiplyScalar(Math.pow(1 - age, 1.5));
  }

  heartInst.begin();
  for (const h of hearts) {
    if (h.life <= 0) continue;
    h.life -= dt;
    h.y += dt * 1.6;
    const t = h.life / 1.2;
    dummy.position.set(h.x, h.y, h.z);
    dummy.rotation.set(0, Math.sin(h.life * 6) * 0.5, 0);
    dummy.scale.setScalar(0.55 * Math.min(1, (1.2 - h.life) * 6) * (0.5 + 0.5 * t));
    heartInst.push();
  }
  heartInst.end();

  beamInst.begin();
  for (const b of beams) {
    if (b.life <= 0) continue;
    b.life -= realDt;
    _dir.subVectors(b.b, b.a);
    const len = _dir.length();
    if (len < 0.001) continue;
    _dir.divideScalar(len);
    dummy.position.copy(b.a);
    dummy.quaternion.setFromUnitVectors(_up, _dir);
    const w = b.w * Math.max(0.15, b.life / b.max);
    dummy.scale.set(w, len, w);
    beamInst.push(b.c);
    dummy.rotation.set(0, 0, 0);
  }
  beamInst.end();

  for (const f of flats) {
    if (f.life <= 0) continue;
    f.life -= dt;
    if (f.life <= 0) {
      f.mesh.visible = false;
      continue;
    }
    const t = 1 - f.life / f.max;
    const r = f.r0 + (f.r1 - f.r0) * (f.disc ? t : 1 - Math.pow(1 - t, 2));
    f.mesh.position.set(f.x, 0.06 + (f.disc ? 0 : 0.02), f.z);
    f.mesh.scale.setScalar(Math.max(0.01, r));
    f.mesh.material.opacity = f.disc ? f.op * (0.5 + 0.5 * t) : f.op * (1 - t);
  }

  const cam = G.camera;
  const w = innerWidth, h = innerHeight;
  for (const f of floaters) {
    if (f.life <= 0) continue;
    f.life -= realDt;
    if (f.life <= 0) {
      f.el.style.display = 'none';
      continue;
    }
    f.y += realDt * 2.2;
    _v.set(f.x, f.y, f.z).project(cam);
    const sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h;
    const pop = f.life > 0.65 ? 1 + (f.life - 0.65) * 4 : 1;
    f.el.style.transform = `translate(${sx | 0}px, ${sy | 0}px) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
    f.el.style.opacity = Math.min(1, f.life * 3).toFixed(2);
  }
}
