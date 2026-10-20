import * as THREE from 'three';
import { G, dummy, rand } from './core.js';
import { Inst, toon, vtoon } from './toon.js';
import { heartGeo } from './models.js';
import { sfx } from './audio.js';

// ---------- particles (fluff, sparks, crumbs) ----------
const PCAP = 900;
let parts, partInst;
let hearts, heartInst;
let beams, beamInst;
let flats = [];
let floaters = [];
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _v = new THREE.Vector3();

export function initFx() {
  parts = Array.from({ length: PCAP }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, grav: 0, drag: 0, c: new THREE.Color(), rot: 0 }));
  partInst = new Inst(new THREE.IcosahedronGeometry(0.5, 0), PCAP, { mat: toon(0xffffff), outline: 0, colors: true });
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

export function poof(x, z, scale = 1, fur = 0xffffff) {
  burst(x, 0.6 * scale, z, 7, [0xffffff, fur, 0xfff0f6], 5 * scale, 0.32 * scale, 0.5, 4);
}

export function explosion(x, z, r, color = 0xff8a1f, shake = 0.4) {
  burst(x, 0.5, z, 16, [0xffe14d, color, 0xff4d2e, 0xffffff], r * 3.2, 0.5, 0.55, 7);
  ring(x, z, r * 0.3, r, 0.35, 0xffd23f, 0.9);
  G.shake = Math.max(G.shake, shake);
  sfx('boom');
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
export function lightning(a, b, color = 0xfff27a, w = 0.1) {
  const segs = 5;
  let prev = a.clone();
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = _v.lerpVectors(a, b, t).clone();
    if (i < segs) {
      p.x += rand(-0.5, 0.5);
      p.y += rand(-0.3, 0.5);
      p.z += rand(-0.5, 0.5);
    }
    beam(prev, p, color, w, 0.16);
    beam(prev, p, 0xffffff, w * 0.4, 0.16);
    prev = p;
  }
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
  for (const p of parts) p.life = 0;
  for (const h of hearts) h.life = 0;
  for (const b of beams) b.life = 0;
  for (const f of flats) {
    f.life = 0;
    f.mesh.visible = false;
  }
  for (const f of floaters) {
    f.life = 0;
    f.el.style.display = 'none';
  }
}

export function updateFx(dt, realDt) {
  partInst.begin();
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.vy += p.grav * dt;
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vz *= k;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.4; }
    const t = Math.max(0, p.life / p.max);
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rot, p.rot * 1.3, 0);
    dummy.scale.setScalar(p.s * (0.3 + 0.7 * t));
    partInst.push(p.c);
  }
  partInst.end();

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
