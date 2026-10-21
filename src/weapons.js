import * as THREE from 'three';
import { G, WORLD, dummy, rand, clamp, damp } from './core.js';
import { Inst, vtoon, toon, outlined } from './toon.js';
import { toastGeo, chickenGeo, beeGeo, slipperGeo, bananaGeo, sabreHiltGeo, plungerGeo, carrotGeo } from './models.js';
import { gnomeGeo, acornGeo, kazooGeo, noodleGeo, cartGeo } from './models-extra.js';
import { queryCircle, nearest, randomNear, nearestGrabbable, damage } from './enemies.js';
import { blocked } from './world.js';
import { burst, particle, poof, explosion, ring, telegraph, beam, lightning, floater, banner } from './fx.js';
import { sfx } from './audio.js';

// ======================================================================
// Shared render batches. All weapons push into these every frame.
// ======================================================================
let I = {};
let sabreMeshes = [], discoMeshes = [];
const SABRE_COLORS = [0x47e5ff, 0x6bff5c, 0xff3b5c, 0xc77dff, 0xffe14d, 0xff8a1f, 0x47e5ff, 0xff3b5c];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);

export function initWeapons() {
  I.toast = new Inst(toastGeo(), 80, { outline: 0.03 });
  I.chicken = new Inst(chickenGeo(), 80, { outline: 0.03 });
  I.bee = new Inst(beeGeo(), 120, { outline: 0.025 });
  I.slipper = new Inst(slipperGeo(), 12, { outline: 0.03 });
  I.banana = new Inst(bananaGeo(), 80, { outline: 0.025 });
  I.plunger = new Inst(plungerGeo(), 12, { outline: 0.03 });
  I.bigCarrot = new Inst(carrotGeo(0xff7a12, 0x3fae49), 40, { outline: 0.02 });
  I.gnome = new Inst(gnomeGeo(), 16, { outline: 0.03 });
  I.choir = new Inst(gnomeGeo(true), 12, { outline: 0.03 });
  I.acorn = new Inst(acornGeo(), 80, { outline: 0.025 });
  I.kazoo = new Inst(kazooGeo(), 4, { outline: 0.03 });
  I.noodle = new Inst(noodleGeo(), 60, { outline: 0.02 });
  I.cart = new Inst(cartGeo(), 12, { outline: 0.035 });
  I.express = new Inst(cartGeo(true), 8, { outline: 0.035 });
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const hilt = outlined(sabreHiltGeo(), vtoon(), 0.025);
    hilt.rotation.z = -Math.PI / 2;
    g.add(hilt);
    const core = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 1, 3, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    core.rotation.z = -Math.PI / 2;
    const glow = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.15, 1, 3, 8),
      new THREE.MeshBasicMaterial({ color: SABRE_COLORS[i], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.rotation.z = -Math.PI / 2;
    g.add(core, glow);
    g.userData = { core, glow };
    g.visible = false;
    G.scene.add(g);
    sabreMeshes.push(g);
  }
  for (let i = 0; i < 3; i++) {
    const facets = new THREE.IcosahedronGeometry(0.45, 1);
    facets.computeVertexNormals(); // non-indexed, so this gives one flat normal per mirror tile
    const ball = outlined(facets, toon(0xdfe6f5, { emissive: 0x333344 }), 0.04);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 4), new THREE.MeshBasicMaterial({ color: 0x2b1d3a }));
    str.position.y = 0.8;
    ball.add(str);
    ball.visible = false;
    G.scene.add(ball);
    discoMeshes.push(ball);
  }
}

function beginDraw() {
  for (const k in I) I[k].begin();
  for (const m of sabreMeshes) m.visible = false;
  for (const m of discoMeshes) m.visible = false;
}
function endDraw() {
  for (const k in I) I[k].end();
}

const P = () => G.player;
// Lobbed weapons mostly aim at the rabbits that are about to bite you, sometimes further out.
const closeTarget = (p) => (Math.random() < 0.7 && randomNear(p.x, p.z, 6.5)) || randomNear(p.x, p.z, 13);
const area = () => G.stats.area;
const cdm = () => G.stats.cooldown;
const amt = () => G.stats.amount;
function segDist2(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  const dx = ax + vx * t - px, dz = az + vz * t - pz;
  return dx * dx + dz * dz;
}

// ======================================================================
// Weapons
// ======================================================================
class Weapon {
  constructor(id) {
    this.id = id;
    this.level = 1;
    this.cd = 0.4;
    this.items = [];
  }
  L(arr) {
    return arr[Math.min(this.level, arr.length) - 1];
  }
  tick(dt) {
    this.cd -= dt;
    if (this.cd <= 0) {
      const r = this.fire();
      this.cd = r === false ? 0.2 : this.cooldown() * cdm();
    }
  }
  update(dt) {
    this.tick(dt);
  }
  draw() {}
}

// ---------- Toaster: lobbed flaming toast ----------
class Toaster extends Weapon {
  dmg = [16, 16, 22, 22, 30];
  count = [1, 2, 2, 3, 3];
  rad = [2.2, 2.2, 2.5, 2.8, 3.2];
  cds = [1.7, 1.6, 1.5, 1.4, 1.1];
  cooldown() { return this.L(this.cds); }
  fire() {
    const p = P();
    const n = this.L(this.count) + amt();
    let any = false;
    for (let i = 0; i < n; i++) {
      const e = closeTarget(p);
      let tx, tz;
      if (e) {
        tx = e.x + e.kx * 0.2;
        tz = e.z + e.kz * 0.2;
        any = true;
      } else {
        const a = rand(0, 6.28);
        tx = p.x + Math.cos(a) * 6;
        tz = p.z + Math.sin(a) * 6;
      }
      this.items.push({ sx: p.x, sz: p.z, tx, tz, t: -i * 0.08, T: rand(0.65, 0.85), h: rand(3.5, 5), spin: rand(0, 6) });
    }
    if (any) sfx('toast');
    return any || undefined;
  }
  update(dt) {
    this.tick(dt);
    const R = this.L(this.rad) * area();
    const dmg = this.L(this.dmg);
    this.items = this.items.filter((it) => {
      it.t += dt;
      if (it.t < 0) return true;
      const k = it.t / it.T;
      if (k >= 1) {
        explosion(it.tx, it.tz, R * 0.9, 0xff8a1f, 0.12);
        burst(it.tx, 0.4, it.tz, 6, [0xf2cf8a, 0xb86b2a], 6, 0.25, 0.6, 6);
        queryCircle(it.tx, it.tz, R, (e) => {
          const dx = e.x - it.tx, dz = e.z - it.tz, d = Math.hypot(dx, dz) || 1;
          damage(e, dmg, this.id, (dx / d) * 7, (dz / d) * 7, { launch: 3 });
        });
        return false;
      }
      it.x = it.sx + (it.tx - it.sx) * k;
      it.z = it.sz + (it.tz - it.sz) * k;
      it.y = 1.2 + it.h * 4 * k * (1 - k);
      it.spin += dt * 14;
      if (Math.random() < dt * 25) particle(it.x, it.y, it.z, 0, 1, 0, Math.random() < 0.5 ? 0xff8a1f : 0xffd23f, 0.22, 0.35, 0, 1);
      return true;
    });
  }
  draw() {
    for (const it of this.items) {
      if (it.t < 0) continue;
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.spin, it.spin * 0.4, 0);
      dummy.scale.setScalar(1.2);
      I.toast.push();
    }
  }
}

// ---------- Lightsabre: humming blades orbiting you ----------
class Sabre extends Weapon {
  constructor(id, cyclone = false) {
    super(id);
    this.cyclone = cyclone;
    this.angle = 0;
  }
  dmg = [15, 17, 22, 25, 34];
  blades = [1, 2, 2, 3, 4];
  spd = [3.2, 3.4, 3.6, 3.9, 4.3];
  update(dt) {
    const p = P();
    const ar = area();
    const cyc = this.cyclone;
    const n = cyc ? 8 : Math.min(8, this.L(this.blades) + amt());
    const sp = cyc ? 5.5 : this.L(this.spd);
    this.angle += dt * sp;
    const dmg = cyc ? 50 : this.L(this.dmg);
    this.blade = [];
    for (let i = 0; i < n; i++) {
      const outer = cyc && i % 2 === 1;
      const r0 = (outer ? 3.4 : 0.9) * (cyc ? ar : 1);
      const len = (outer ? 3 : 2.3) * ar;
      const a = (outer ? -this.angle * 0.8 : this.angle) + (i / n) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const ax = p.x + ca * r0, az = p.z + sa * r0, bx = p.x + ca * (r0 + len), bz = p.z + sa * (r0 + len);
      this.blade.push({ a, r0, len, i });
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      queryCircle(mx, mz, len / 2 + 0.3, (e) => {
        const rr = 0.35 + e.r;
        if (segDist2(e.x, e.z, ax, az, bx, bz) > rr * rr) return;
        const key = 's' + i;
        if ((e.hits[key] || 0) > G.time) return;
        e.hits[key] = G.time + (cyc ? 0.25 : 0.4);
        // shove along the swing direction and a little outward
        const tx = -sa * (outer ? -1 : 1), tz = ca * (outer ? -1 : 1);
        const k = cyc ? 9 : 4;
        damage(e, dmg, this.id, (tx + ca * 0.6) * k, (tz + sa * 0.6) * k, cyc ? { launch: 4 } : undefined);
        sfx('hit');
      });
    }
    if (cyc && Math.random() < dt * 40) {
      const a = rand(0, 6.28), r = rand(1, 6) * ar;
      particle(p.x + Math.cos(a) * r, rand(0.2, 2), p.z + Math.sin(a) * r, -Math.sin(a) * 10, rand(1, 3), Math.cos(a) * 10, 0xe6fff6, 0.18, 0.4, 0, 1);
    }
    if (Math.random() < dt * 1.5) sfx('saber');
  }
  draw() {
    const p = P();
    for (const b of this.blade || []) {
      const m = sabreMeshes[b.i];
      m.visible = true;
      const { core, glow } = m.userData;
      const L = b.len;
      // group's local +x points out from the player
      m.position.set(p.x, 1.05, p.z);
      m.rotation.set(0, -b.a, 0);
      m.children[0].position.set(b.r0 - 0.2, 0, 0);
      core.position.set(b.r0 + L / 2, 0, 0);
      core.scale.set(1, L, 1);
      glow.position.copy(core.position);
      glow.scale.set(1 + Math.sin(G.time * 30 + b.i) * 0.1, L * 0.9, 1);
    }
  }
}

// ---------- Rubber Chicken: squeaky boomerang ----------
class Chicken extends Weapon {
  dmg = [14, 14, 18, 18, 24];
  count = [1, 1, 2, 2, 3];
  range = [8, 9, 9, 10, 11];
  cds = [1.2, 1.1, 1.05, 1.0, 0.9];
  cooldown() { return this.L(this.cds); }
  fire() {
    const p = P();
    const e = nearest(p.x, p.z, 14);
    let a = e ? Math.atan2(e.z - p.z, e.x - p.x) : Math.atan2(p.fz, p.fx);
    const n = this.L(this.count) + amt();
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 0.45;
      this.items.push({ x: p.x, z: p.z, dx: Math.cos(a + off), dz: Math.sin(a + off), dist: 0, out: true, hit: new Set(), spin: 0 });
    }
    sfx('squeak');
  }
  update(dt) {
    this.tick(dt);
    const p = P();
    const range = this.L(this.range) * (0.8 + 0.2 * area());
    const dmg = this.L(this.dmg);
    const sp = 15;
    this.items = this.items.filter((it) => {
      it.spin += dt * 16;
      if (it.out) {
        it.x += it.dx * sp * dt;
        it.z += it.dz * sp * dt;
        it.dist += sp * dt;
        if (it.dist >= range) {
          it.out = false;
          it.hit.clear();
        }
      } else {
        const dx = p.x - it.x, dz = p.z - it.z, d = Math.hypot(dx, dz);
        if (d < 0.8) return false;
        it.dx = dx / d;
        it.dz = dz / d;
        it.x += it.dx * sp * 1.15 * dt;
        it.z += it.dz * sp * 1.15 * dt;
      }
      queryCircle(it.x, it.z, 0.6 * area(), (e) => {
        if (it.hit.has(e.id)) return;
        it.hit.add(e.id);
        damage(e, dmg, this.id, it.dx * 6, it.dz * 6);
        sfx('squeak');
      });
      return true;
    });
  }
  draw() {
    for (const it of this.items) {
      dummy.position.set(it.x, 1.1, it.z);
      dummy.rotation.set(Math.sin(it.spin) * 0.6, it.spin, 0.3);
      dummy.scale.setScalar(1.3 * (0.8 + 0.2 * area()));
      I.chicken.push();
    }
  }
}

// ---------- Leaf Blower: hurricane cone ----------
class Blower extends Weapon {
  dmg = [12, 15, 18, 22, 28];
  range = [5.5, 6, 6.5, 7, 8];
  half = [0.5, 0.55, 0.6, 0.65, 0.75];
  cds = [2.0, 1.8, 1.7, 1.5, 1.3];
  lift = [5, 6, 6, 7, 8];
  cooldown() { return this.L(this.cds); }
  fire() {
    const p = P();
    const R = this.L(this.range) * area();
    const e = nearest(p.x, p.z, R + 3);
    const a = e ? Math.atan2(e.z - p.z, e.x - p.x) : Math.atan2(p.fz, p.fx);
    const half = this.L(this.half);
    const dmg = this.L(this.dmg), lift = this.L(this.lift);
    const blasts = 1 + amt();
    for (let b = 0; b < blasts; b++) {
      const ba = a + (b - (blasts - 1) / 2) * half * 1.6;
      const bx = Math.cos(ba), bz = Math.sin(ba);
      queryCircle(p.x, p.z, R, (o) => {
        const ox = o.x - p.x, oz = o.z - p.z, d = Math.hypot(ox, oz) || 1;
        if ((ox / d) * bx + (oz / d) * bz < Math.cos(half)) return;
        damage(o, dmg, this.id, bx * 16, bz * 16, { launch: lift });
      });
      for (let i = 0; i < 22; i++) {
        const pa = ba + rand(-half, half), s = rand(12, 22);
        particle(p.x + bx * 0.6, rand(0.4, 1.6), p.z + bz * 0.6, Math.cos(pa) * s, rand(-0.5, 1.5), Math.sin(pa) * s, i % 3 ? 0xeafff0 : 0x5fcf55, rand(0.12, 0.25), R / s, 0, 0.5);
      }
    }
    sfx('wind');
    return e ? undefined : false;
  }
}

// ---------- Angry Bee Jar / Chicken Swarm: homing pests ----------
class Bees extends Weapon {
  constructor(id, swarm = false) {
    super(id);
    this.swarm = swarm;
  }
  dmg = [7, 8, 10, 11, 14];
  count = [3, 4, 5, 6, 8];
  stings = [2, 2, 3, 3, 4];
  cds = [2.6, 2.4, 2.2, 2.0, 1.8];
  cooldown() { return this.swarm ? 1.4 : this.L(this.cds); }
  fire() {
    const p = P();
    if (!nearest(p.x, p.z, 14)) return false;
    const n = (this.swarm ? 7 : this.L(this.count)) + amt() * 2;
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28);
      this.items.push({ x: p.x, z: p.z, y: 1.2, vx: Math.cos(a) * 6, vz: Math.sin(a) * 6, target: null, tid: 0, stings: this.swarm ? 6 : this.L(this.stings), life: 6, hcd: 0, wob: rand(0, 6) });
    }
    sfx(this.swarm ? 'squeak' : 'buzz');
  }
  update(dt) {
    this.tick(dt);
    const sp = this.swarm ? 13 : 9.5;
    const dmg = this.swarm ? 26 : this.L(this.dmg);
    this.items = this.items.filter((b) => {
      b.life -= dt;
      b.hcd -= dt;
      b.wob += dt * 12;
      // enemies are pooled: a dead target can come back as a different rabbit, so check the id too
      if (!b.target || !b.target.alive || b.target.id !== b.tid) {
        b.target = randomNear(b.x, b.z, 6) || randomNear(b.x, b.z, 11);
        b.tid = b.target ? b.target.id : 0;
      }
      let tx = 0, tz = 0;
      if (b.target) {
        const dx = b.target.x - b.x, dz = b.target.z - b.z, d = Math.hypot(dx, dz) || 1;
        tx = (dx / d) * sp;
        tz = (dz / d) * sp;
        if (d < b.target.r + 0.45 && b.hcd <= 0) {
          damage(b.target, dmg, this.id, (dx / d) * (this.swarm ? 5 : 1), (dz / d) * (this.swarm ? 5 : 1));
          b.stings--;
          b.hcd = 0.3;
          if (this.swarm) {
            b.target = randomNear(b.x, b.z, 8);
            b.tid = b.target ? b.target.id : 0;
          }
          if (this.swarm) sfx('squeak');
        }
      }
      const k = Math.min(1, dt * (this.swarm ? 5 : 4));
      b.vx += (tx - b.vx) * k + Math.cos(b.wob) * dt * 8;
      b.vz += (tz - b.vz) * k + Math.sin(b.wob * 1.3) * dt * 8;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.y = 1.1 + Math.sin(b.wob * 0.7) * 0.3;
      if (b.stings <= 0 || b.life <= 0) {
        burst(b.x, b.y, b.z, 3, this.swarm ? [0xffe14d, 0xffffff] : [0xffd23f, 0x1d1a24], 2, 0.15, 0.3, 2);
        return false;
      }
      return true;
    });
  }
  draw() {
    for (const b of this.items) {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, Math.atan2(b.vx, b.vz), Math.sin(b.wob * 3) * 0.3);
      if (this.swarm) {
        dummy.scale.setScalar(1);
        I.chicken.push();
      } else {
        dummy.scale.setScalar(1.25);
        I.bee.push();
      }
    }
  }
}

// ---------- Disco Ball Drone / Funkadelic Storm ----------
class Disco extends Weapon {
  constructor(id, storm = false) {
    super(id);
    this.storm = storm;
    this.angle = 0;
    this.shots = [0, 0, 0];
  }
  balls = [1, 1, 2, 2, 3];
  rate = [0.45, 0.4, 0.4, 0.34, 0.28];
  dmg = [12, 14, 16, 19, 24];
  update(dt) {
    const p = P();
    this.angle += dt * 1.1;
    const n = this.storm ? 3 : Math.min(3, this.L(this.balls) + (amt() > 0 ? 1 : 0));
    this.pos = [];
    for (let i = 0; i < n; i++) {
      const a = this.angle + (i / n) * Math.PI * 2;
      const bx = p.x + Math.cos(a) * 2.3, bz = p.z + Math.sin(a) * 2.3, by = 2.7 + Math.sin(G.time * 2 + i) * 0.2;
      this.pos.push([bx, by, bz]);
      this.shots[i] -= dt;
      if (this.shots[i] > 0) continue;
      const range = 10 * (0.8 + 0.2 * area());
      const e = nearest(bx, bz, range);
      if (!e) continue;
      this.shots[i] = (this.storm ? 0.28 : this.L(this.rate)) * cdm();
      _c.setHSL(Math.random(), 1, 0.6);
      _a.set(bx, by, bz);
      if (this.storm) {
        const hit = new Set();
        let cur = e, from = _a.clone(), d = 36;
        for (let j = 0; j < 5 && cur; j++) {
          hit.add(cur.id);
          _b.set(cur.x, 0.9 * cur.scale, cur.z);
          _c.setHSL((G.time * 2 + j * 0.15) % 1, 1, 0.6);
          lightning(from, _b, _c.getHex(), 0.13);
          damage(cur, d, this.id);
          from = _b.clone();
          d *= 0.9;
          cur = nearest(cur.x, cur.z, 5, hit);
        }
        sfx('zap');
      } else {
        _b.set(e.x, 0.9 * e.scale, e.z);
        beam(_a, _b, _c.getHex(), 0.09, 0.12);
        burst(e.x, 0.9, e.z, 2, [_c.getHex()], 2, 0.15, 0.25, 1);
        damage(e, this.L(this.dmg), this.id);
        sfx('laser');
      }
    }
  }
  draw() {
    (this.pos || []).forEach(([x, y, z], i) => {
      const m = discoMeshes[i];
      m.visible = true;
      m.position.set(x, y, z);
      m.rotation.y = G.time * 3;
      m.scale.setScalar(this.storm ? 1.25 : 1);
      _c.setHSL((G.time * 0.5 + i * 0.3) % 1, 0.8, 0.25);
      m.material.emissive.copy(_c);
    });
  }
}

// ---------- Bagpipes of Doom / Banana Bagpipe Rave ----------
class Pipes extends Weapon {
  constructor(id, rave = false) {
    super(id);
    this.rave = rave;
  }
  dmg = [11, 11, 15, 15, 20];
  rad = [6, 6.5, 7, 7.5, 8.5];
  cds = [3.2, 3.0, 2.8, 2.5, 2.2];
  cooldown() { return this.rave ? 2.4 : this.L(this.cds); }
  fire() {
    const p = P();
    const R = (this.rave ? 11 : this.L(this.rad)) * area();
    const waves = 1 + (amt() > 0 ? 1 : 0);
    for (let w = 0; w < waves; w++) {
      this.items.push({ x: p.x, z: p.z, r: 0.5, R, t: -w * 0.25, hit: new Set(), started: false });
    }
    sfx('pipes');
    if (this.rave) {
      for (let i = 0; i < 4; i++) {
        const a = rand(0, 6.28), d = rand(2, R * 0.8);
        dropPeel(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 8, 1);
      }
    }
  }
  update(dt) {
    this.tick(dt);
    const dmg = this.rave ? 32 : this.L(this.dmg);
    this.items = this.items.filter((w) => {
      w.t += dt;
      if (w.t < 0) return true;
      if (!w.started) {
        w.started = true;
        if (this.rave) {
          for (let k = 0; k < 3; k++) ring(w.x, w.z, 0.5, w.R * (1 - k * 0.12), 0.6 + k * 0.05, [0xff3dcf, 0x3bf2ff, 0xffe14d][k], 0.9);
        } else {
          ring(w.x, w.z, 0.5, w.R, 0.6, 0xc0253f, 0.9);
          ring(w.x, w.z, 0.5, w.R * 0.92, 0.6, 0x2e7d32, 0.9);
        }
      }
      w.r = 0.5 + (w.R - 0.5) * Math.min(1, w.t / 0.6);
      queryCircle(w.x, w.z, w.r, (e) => {
        if (w.hit.has(e.id)) return;
        const dx = e.x - w.x, dz = e.z - w.z, d = Math.hypot(dx, dz) || 1;
        if (d < w.r - 1.6) return;
        w.hit.add(e.id);
        damage(e, dmg, this.id, (dx / d) * 9, (dz / d) * 9, this.rave ? { launch: 9 } : undefined);
      });
      if (Math.random() < dt * 30) {
        const a = rand(0, 6.28);
        particle(w.x + Math.cos(a) * w.r, 0.5, w.z + Math.sin(a) * w.r, 0, rand(2, 4), 0, this.rave ? 0xff6fa8 : Math.random() < 0.5 ? 0xc0253f : 0x2e7d32, 0.2, 0.4, -3, 0);
      }
      return w.t < 0.6;
    });
  }
}

// ---------- Grandma's Slipper / Breakfast Meteor: death from above ----------
class Slipper extends Weapon {
  constructor(id, meteor = false) {
    super(id);
    this.meteor = meteor;
  }
  dmg = [35, 38, 45, 48, 60];
  count = [1, 2, 2, 2, 3];
  rad = [2.4, 2.6, 2.8, 3, 3.4];
  cds = [2.1, 2.2, 2.1, 1.9, 1.8];
  cooldown() { return this.meteor ? 2.0 : this.L(this.cds); }
  fire() {
    const p = P();
    const n = (this.meteor ? 3 : this.L(this.count)) + amt();
    const R = (this.meteor ? 4.5 : this.L(this.rad)) * area();
    let any = false;
    for (let i = 0; i < n; i++) {
      const e = closeTarget(p);
      if (!e) break;
      any = true;
      const T = this.meteor ? 0.9 : 0.6;
      this.items.push({ x: e.x, z: e.z, t: -i * 0.15, T, R, landed: false, stay: 0.4, rot: rand(0, 6) });
      telegraph(e.x, e.z, R, T + i * 0.15, this.meteor ? 0xff6a00 : 0xff3355);
    }
    return any ? undefined : false;
  }
  update(dt) {
    this.tick(dt);
    const dmg = this.meteor ? 85 : this.L(this.dmg);
    this.items = this.items.filter((s) => {
      s.t += dt;
      if (s.t < 0) return true;
      if (!s.landed) {
        const k = Math.min(1, s.t / s.T);
        s.y = 16 * (1 - k * k);
        if (this.meteor && Math.random() < dt * 60) {
          particle(s.x + rand(-0.5, 0.5), s.y + 1, s.z + rand(-0.5, 0.5), 0, 4, 0, pick3(), 0.5, 0.4, 0, 1);
        }
        if (k >= 1) {
          s.landed = true;
          s.y = 0;
          if (this.meteor) explosion(s.x, s.z, s.R, 0xff6a00, 0.5);
          else {
            ring(s.x, s.z, 0.5, s.R * 1.1, 0.35, 0xffffff, 0.9);
            burst(s.x, 0.3, s.z, 10, [0xffffff, 0x9be37a, 0xff7fb6], 7, 0.3, 0.5, 4);
            sfx('slam');
            G.shake = Math.max(G.shake, 0.25);
          }
          queryCircle(s.x, s.z, s.R, (e) => {
            const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz) || 1;
            damage(e, dmg, this.id, (dx / d) * 8, (dz / d) * 8, { launch: this.meteor ? 8 : 4 });
          });
        }
        return true;
      }
      s.stay -= dt;
      return s.stay > 0;
    });
  }
  draw() {
    for (const s of this.items) {
      if (s.t < 0) continue;
      const fade = s.landed ? Math.max(0.01, s.stay / 0.4) : 1;
      dummy.position.set(s.x, s.y + (this.meteor ? 0.5 : 0.25), s.z);
      if (this.meteor) {
        dummy.rotation.set(G.time * 6, s.rot, 0.5);
        dummy.scale.setScalar(3.5 * fade);
        I.toast.push();
      } else {
        dummy.rotation.set(0, s.rot, 0);
        const sz = 1.25 * s.R / 2.4;
        dummy.scale.set(sz * fade, sz * (s.landed ? 0.6 : 1) * fade, sz * fade);
        I.slipper.push();
      }
    }
  }
}
const pick3 = () => [0xff6a00, 0xffd23f, 0xff3d2e][Math.floor(Math.random() * 3)];

// ---------- Thunder Plunger: 10,000 volt bonk that chains ----------
class Plunger extends Weapon {
  dmg = [20, 23, 28, 32, 42];
  chains = [2, 3, 3, 4, 6];
  cds = [1.5, 1.4, 1.3, 1.2, 1.0];
  cooldown() { return this.L(this.cds); }
  fire() {
    const p = P();
    const first = nearest(p.x, p.z, 11);
    if (!first) return false;
    const hit = new Set();
    let cur = first, d = this.L(this.dmg);
    _a.set(cur.x, 12, cur.z);
    _b.set(cur.x, 0.8, cur.z);
    lightning(_a, _b, 0xfff27a, 0.18);
    this.items.push({ x: cur.x, z: cur.z, t: 0.35 });
    const n = this.L(this.chains) + amt();
    for (let j = 0; j <= n && cur; j++) {
      hit.add(cur.id);
      const from = new THREE.Vector3(cur.x, 0.8 * cur.scale, cur.z);
      damage(cur, d, this.id, 0, 0);
      burst(cur.x, 0.8, cur.z, 3, [0xfff27a, 0xffffff], 4, 0.15, 0.3, 3);
      d *= 0.88;
      const nx = nearest(cur.x, cur.z, 4.5 * area(), hit);
      if (nx) {
        _b.set(nx.x, 0.8 * nx.scale, nx.z);
        lightning(from, _b, 0xb6f3ff, 0.11);
      }
      cur = nx;
    }
    sfx('zap');
  }
  update(dt) {
    this.tick(dt);
    this.items = this.items.filter((it) => (it.t -= dt) > 0);
  }
  draw() {
    for (const it of this.items) {
      const k = it.t / 0.35;
      dummy.position.set(it.x, 1.6 + k * 2, it.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1.6);
      I.plunger.push();
    }
  }
}

// ---------- Banana Peels: slip hazard ----------
const peels = [];
function dropPeel(x, z, life, uses, dmg = 30) {
  if (peels.length >= 70) peels.shift();
  peels.push({ x, z, y: 1.5, vy: 4, life, uses, dmg, rot: rand(0, 6) });
}
function updatePeels(dt) {
  for (let i = peels.length - 1; i >= 0; i--) {
    const pl = peels[i];
    pl.life -= dt;
    if (pl.y > 0) {
      pl.vy -= 25 * dt;
      pl.y = Math.max(0, pl.y + pl.vy * dt);
    } else {
      let slipped = null;
      queryCircle(pl.x, pl.z, 0.55, (e) => {
        if (!slipped && !e.air && !e.isBoss) slipped = e;
      });
      if (slipped) {
        damage(slipped, pl.dmg, 'banana', rand(-3, 3), rand(-3, 3), { launch: 10 });
        slipped.spin = 0.01;
        if (Math.random() < 0.25) floater('WHEE!', slipped.x, 2, slipped.z, '');
        sfx('slip');
        pl.uses--;
      }
    }
    if (pl.life <= 0 || pl.uses <= 0) peels.splice(i, 1);
  }
}
function drawPeels() {
  for (const pl of peels) {
    dummy.position.set(pl.x, pl.y + 0.02, pl.z);
    dummy.rotation.set(0, pl.rot, 0);
    dummy.scale.setScalar(1.1 * Math.min(1, pl.life * 2));
    I.banana.push();
  }
}
class Banana extends Weapon {
  dmg = [26, 28, 36, 38, 50];
  count = [1, 2, 2, 3, 4];
  life = [8, 8, 10, 10, 12];
  uses = [1, 1, 1, 2, 2];
  cds = [1.6, 1.5, 1.4, 1.3, 1.1];
  cooldown() { return this.L(this.cds); }
  fire() {
    const p = P();
    const n = this.L(this.count) + amt();
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), d = rand(1.5, 4.5) * area();
      dropPeel(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, this.L(this.life), this.L(this.uses), this.L(this.dmg));
    }
  }
}

// ---------- shared helpers for the newer weapons ----------
// Orient the shared dummy along a segment so a unit +Y model (the noodle) spans it.
function span(ax, ay, az, bx, by, bz) {
  _a.set(bx - ax, by - ay, bz - az);
  const len = _a.length() || 0.001;
  _a.divideScalar(len);
  dummy.position.set(ax, ay, az);
  dummy.quaternion.setFromUnitVectors(_up, _a);
  dummy.scale.set(1, len, 1);
}
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// A kazoo honk: everything in range gets dizzy (walks backwards, takes +20% damage), then a little hurt.
function honk(x, z, R, dmg, dur, src, rainbow = false) {
  queryCircle(x, z, R, (e) => {
    if (!e.isBoss) e.confused = G.time + dur * (e.elite ? 0.5 : 1);
    const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz) || 1;
    damage(e, dmg, src, (dx / d) * 5, (dz / d) * 5);
  });
  if (rainbow) for (let k = 0; k < 3; k++) ring(x, z, 0.5, R * (1 - k * 0.1), 0.5 + k * 0.05, [0xffe14d, 0xff6fa8, 0x47e5ff][k], 0.85);
  else {
    ring(x, z, 0.5, R, 0.45, 0xffe14d, 0.85);
    ring(x, z, 0.5, R * 0.86, 0.5, 0xff8a1f, 0.7);
  }
  for (let i = 0; i < 8; i++) {
    const a = rand(0, 6.28);
    particle(x + Math.cos(a) * 0.8, 1.8, z + Math.sin(a) * 0.8, Math.cos(a) * 5, rand(2, 4), Math.sin(a) * 5, i % 2 ? 0xffe14d : 0xff6fa8, 0.22, 0.6, -4, 1);
  }
  sfx('squeak');
  sfx('buzz');
}

// Acorns fired by garden gnomes. Shared, so gnomes that expire don't take their shots with them.
const acorns = [];
function updateAcorns(dt) {
  let j = 0;
  for (let i = 0; i < acorns.length; i++) {
    const a = acorns[i];
    a.life -= dt;
    const e = a.e;
    if (e.alive && e.id === a.id) {
      const dx = e.x - a.x, dz = e.z - a.z, d = Math.hypot(dx, dz) || 1;
      a.vx = (dx / d) * 18;
      a.vz = (dz / d) * 18;
    }
    a.x += a.vx * dt;
    a.z += a.vz * dt;
    a.spin += dt * 20;
    let hit = null;
    queryCircle(a.x, a.z, 0.3, (o) => {
      if (!hit) hit = o;
    });
    if (hit) {
      damage(hit, a.dmg, a.src, a.vx * 0.3, a.vz * 0.3);
      burst(a.x, 0.8, a.z, 3, [0xb07a3c, 0x6b4a2a], 3, 0.15, 0.3, 2);
      continue;
    }
    if (a.life > 0) acorns[j++] = a;
  }
  acorns.length = j;
}
function drawAcorns() {
  for (const a of acorns) {
    dummy.position.set(a.x, a.y, a.z);
    dummy.rotation.set(a.spin, a.spin * 0.7, 0);
    dummy.scale.setScalar(1.3);
    I.acorn.push();
  }
}

// ---------- Garden Gnome Sentries / Gnome Kazoo Choir ----------
class Gnome extends Weapon {
  constructor(id, choir = false) {
    super(id);
    this.choir = choir;
    this.gnomes = [];
    this.honkT = 2;
    this.angle = 0;
  }
  count = [1, 2, 2, 3, 3];
  dmg = [10, 11, 14, 15, 20];
  rate = [0.7, 0.65, 0.55, 0.5, 0.4];
  life = [9, 10, 11, 12, 14];
  cds = [4.2, 3.9, 3.6, 3.3, 3.0];
  cooldown() { return this.L(this.cds); }
  fire() {
    // plant a gnome next to you; at the union limit the oldest one clocks off
    const p = P();
    let x = p.x, z = p.z;
    for (let k = 0; k < 6; k++) {
      const a = rand(0, 6.28), r = rand(1.2, 2.4);
      x = clamp(p.x + Math.cos(a) * r, -WORLD, WORLD);
      z = clamp(p.z + Math.sin(a) * r, -WORLD, WORLD);
      if (!blocked(x, z, 0.4)) break;
    }
    if (this.gnomes.length >= this.L(this.count) + amt()) this.gnomes.shift();
    this.gnomes.push({ x, z, life: this.L(this.life), shot: rand(0.1, 0.4), rot: rand(0, 6), pop: 0, kick: 0 });
    burst(x, 0.3, z, 8, [0x9c6a3c, 0x5fcf55, 0xe3342f], 4, 0.25, 0.5, 5);
    sfx('pop');
  }
  update(dt) {
    const p = P();
    const choir = this.choir;
    const dmg = choir ? 30 : this.L(this.dmg);
    const range = (choir ? 10 : 8.5) * (0.8 + 0.2 * area());
    if (choir) {
      // the choir walks a slow circle around you
      this.angle += dt * 0.7;
      const n = Math.min(7, 5 + amt());
      while (this.gnomes.length < n) this.gnomes.push({ x: p.x, z: p.z, life: 1, shot: rand(0, 0.3), rot: 0, pop: 0, kick: 0 });
      const R = 3.6 * (0.8 + 0.2 * area());
      this.gnomes.forEach((g, i) => {
        const a = this.angle + (i / n) * Math.PI * 2;
        g.x = damp(g.x, p.x + Math.cos(a) * R, 6, dt);
        g.z = damp(g.z, p.z + Math.sin(a) * R, 6, dt);
      });
      this.honkT -= dt;
      if (this.honkT <= 0 && nearest(p.x, p.z, 8)) {
        this.honkT = 3 * cdm();
        honk(p.x, p.z, 8.5 * area(), 40, 2.6, this.id, true);
        for (const g of this.gnomes) g.kick = 0.3;
      }
    } else this.tick(dt);
    let j = 0;
    for (const g of this.gnomes) {
      if (!choir) g.life -= dt;
      g.pop = Math.min(1, g.pop + dt * 5);
      g.kick -= dt;
      g.shot -= dt;
      if (g.shot <= 0) {
        const e = nearest(g.x, g.z, range);
        if (e) {
          g.shot = (choir ? 0.3 : this.L(this.rate)) * cdm();
          g.rot = Math.atan2(e.x - g.x, e.z - g.z);
          g.kick = Math.max(g.kick, 0.12);
          if (acorns.length < 80) acorns.push({ x: g.x, z: g.z, y: 0.75, e, id: e.id, dmg, src: this.id, life: 1, vx: 0, vz: 0, spin: 0 });
        } else g.shot = 0.25;
      }
      if (g.life > 0) this.gnomes[j++] = g;
      else poof(g.x, g.z, 0.6, 0xe3342f);
    }
    this.gnomes.length = j;
  }
  draw() {
    const t = G.time;
    for (const g of this.gnomes) {
      const fade = this.choir ? 1 : Math.min(1, g.life * 2);
      const s = 1.35 * g.pop * fade * (g.kick > 0 ? 1.12 : 1);
      dummy.position.set(g.x, this.choir ? Math.abs(Math.sin(t * 8 + g.rot)) * 0.15 : 0, g.z);
      dummy.rotation.set(0, g.rot, g.kick > 0 ? 0.15 : 0);
      dummy.scale.set(s, s * (g.kick > 0 ? 0.9 : 1), s);
      (this.choir ? I.choir : I.gnome).push();
    }
  }
}

// ---------- Kazoo of Confusion ----------
class Kazoo extends Weapon {
  constructor(id) {
    super(id);
    this.show = 0;
    this.echo = 0;
  }
  rad = [4.5, 5.2, 5.6, 6.2, 7.2];
  dur = [1.6, 1.8, 2.2, 2.4, 3];
  dmg = [6, 7, 7, 11, 15];
  cds = [3.4, 3.2, 3.0, 2.8, 2.4];
  cooldown() { return this.L(this.cds); }
  fire() {
    const p = P();
    const R = this.L(this.rad) * area();
    if (!nearest(p.x, p.z, R)) return false;
    honk(p.x, p.z, R, this.L(this.dmg), this.L(this.dur), this.id);
    this.show = 0.5;
    if (amt() > 0) this.echo = 0.4;
  }
  update(dt) {
    this.tick(dt);
    this.show -= dt;
    if (this.echo > 0 && (this.echo -= dt) <= 0) {
      const p = P();
      honk(p.x, p.z, this.L(this.rad) * area() * 1.3, this.L(this.dmg) * 0.6, this.L(this.dur) * 0.6, this.id);
      this.show = 0.4;
    }
  }
  draw() {
    if (this.show <= 0) return;
    const p = P();
    dummy.position.set(p.x, 2.7 + (0.5 - this.show) * 0.6, p.z);
    dummy.rotation.set(0.3, G.time * 2, Math.sin(G.time * 40) * 0.2);
    dummy.scale.setScalar(1.6 * Math.min(1, this.show * 6));
    I.kazoo.push();
  }
}

// ---------- Spaghetti Lasso: rope a rabbit, use it as a flail ----------
class Lasso extends Weapon {
  constructor(id) {
    super(id);
    this.ropes = [];
  }
  count = [1, 1, 2, 2, 3];
  dmg = [20, 24, 26, 30, 38];
  fling = [50, 60, 66, 78, 100];
  swing = [1.6, 1.9, 1.9, 2.2, 2.6];
  rad = [3.8, 4.2, 4.4, 4.8, 5.4];
  cds = [2.6, 2.4, 2.2, 2.0, 1.7];
  cooldown() { return this.L(this.cds); }
  fire() {
    const p = P();
    const n = this.L(this.count) + amt() - this.ropes.length;
    let any = false;
    for (let i = 0; i < n; i++) {
      const e = nearestGrabbable(p.x, p.z, 8.5);
      if (!e) break;
      e.held = G.time + 0.5; // reserve it while the noodle flies
      this.ropes.push({ e, id: e.id, t: 0, k: 0, a: Math.atan2(e.z - p.z, e.x - p.x), r0: 0, swinging: false });
      any = true;
    }
    if (any) sfx('slip');
    return any || this.ropes.length ? undefined : false;
  }
  update(dt) {
    this.tick(dt);
    const p = P();
    const R = this.L(this.rad) * (0.8 + 0.2 * area()), T = this.L(this.swing), dmg = this.L(this.dmg);
    let j = 0;
    for (const r of this.ropes) {
      const e = r.e;
      if (!e.alive || e.id !== r.id) continue; // it got squashed mid-swing
      r.t += dt;
      e.held = G.time + 0.2;
      if (!r.swinging) {
        // the noodle flies out and snags the rabbit
        r.k = Math.min(1, r.t / 0.22);
        if (r.k >= 1) {
          r.swinging = true;
          r.t = 0;
          r.r0 = Math.hypot(e.x - p.x, e.z - p.z);
          r.a = Math.atan2(e.z - p.z, e.x - p.x);
          e.air = true;
          e.vy = 0;
          sfx('squeak');
        }
      } else {
        // whirl it around you, swinging in and out so it sweeps a wide band
        r.a += dt * 7;
        r.r0 = damp(r.r0, R + Math.sin(r.t * 3.1) * 1.3, 6, dt);
        const ca = Math.cos(r.a), sa = Math.sin(r.a);
        e.x = p.x + ca * r.r0;
        e.z = p.z + sa * r.r0;
        e.y = 0.9 + Math.sin(r.t * 9) * 0.2;
        e.vy = 0;
        e.kx = e.kz = 0;
        e.spin += dt * 12;
        queryCircle(e.x, e.z, e.r + 0.75, (o) => {
          if (o === e || o.held > G.time || (o.hits.lasso || 0) > G.time) return;
          o.hits.lasso = G.time + 0.35;
          damage(o, dmg, this.id, (-sa + ca * 0.5) * 12, (ca + sa * 0.5) * 12, o.isBoss ? undefined : { launch: 4 });
          sfx('hit');
        });
        if (r.t >= T) {
          // let go: the rabbit becomes a projectile
          e.held = 0;
          damage(e, this.L(this.fling), this.id, (-sa + ca * 0.6) * 30, (ca + sa * 0.6) * 30, { launch: 9 });
          burst(e.x, 1, e.z, 6, [0xffd95a, 0xe3342f], 5, 0.25, 0.4, 4);
          sfx('slip');
          continue;
        }
      }
      this.ropes[j++] = r;
    }
    this.ropes.length = j;
  }
  draw() {
    const p = P();
    for (const r of this.ropes) {
      const e = r.e;
      const k = r.swinging ? 1 : r.k;
      const ex = p.x + (e.x - p.x) * k, ez = p.z + (e.z - p.z) * k, ey = 1.1 + (e.y + 0.5 - 1.1) * k;
      span(p.x, 1.1, p.z, ex, ey, ez);
      I.noodle.push();
    }
  }
}

// ---------- Shopping Cart / Meatball Express ----------
class Cart extends Weapon {
  constructor(id, express = false) {
    super(id);
    this.express = express;
  }
  count = [1, 1, 2, 2, 3];
  dmg = [16, 20, 20, 26, 34];
  spd = [11, 12.5, 12.5, 13.5, 15];
  life = [2.2, 2.4, 2.4, 2.7, 3];
  cds = [2.6, 2.4, 2.3, 2.1, 1.8];
  cooldown() { return this.express ? 1.8 : this.L(this.cds); }
  fire() {
    const p = P();
    const e = nearest(p.x, p.z, 14);
    if (!e) return false;
    const a0 = Math.atan2(e.z - p.z, e.x - p.x);
    const n = (this.express ? 2 : this.L(this.count)) + amt();
    for (let i = 0; i < n; i++) {
      const a = a0 + (i - (n - 1) / 2) * 0.8;
      this.items.push({ x: p.x, z: p.z, a, ta: a, v: 3, life: this.express ? 3.2 : this.L(this.life), hit: new Set(), train: [], steer: 0, wob: rand(0, 6) });
    }
    sfx('wind');
  }
  update(dt) {
    this.tick(dt);
    const ex = this.express;
    const top = ex ? 15 : this.L(this.spd), dmg = ex ? 40 : this.L(this.dmg), R = (ex ? 1.25 : 0.95) * area();
    let j = 0;
    for (const c of this.items) {
      c.life -= dt;
      c.wob += dt * 20;
      c.v = Math.min(top, c.v + dt * 26);
      // the blower steers, badly: drift toward whatever rabbit is ahead
      c.steer -= dt;
      if (c.steer <= 0) {
        c.steer = 0.25;
        const t = nearest(c.x + Math.cos(c.a) * 4, c.z + Math.sin(c.a) * 4, 5);
        c.ta = t && !c.hit.has(t.id) ? Math.atan2(t.z - c.z, t.x - c.x) : c.a;
      }
      c.a += clamp(wrapAngle(c.ta - c.a), -2.4 * dt, 2.4 * dt);
      const fx = Math.cos(c.a), fz = Math.sin(c.a);
      c.x += fx * c.v * dt;
      c.z += fz * c.v * dt;
      // bounce off the fence
      if (Math.abs(c.x) > WORLD) {
        c.x = clamp(c.x, -WORLD, WORLD);
        c.a = c.ta = Math.PI - c.a;
      }
      if (Math.abs(c.z) > WORLD) {
        c.z = clamp(c.z, -WORLD, WORLD);
        c.a = c.ta = -c.a;
      }
      let crash = c.life <= 0 || blocked(c.x, c.z, 0.45);
      queryCircle(c.x, c.z, R, (e) => {
        if (c.hit.has(e.id) || e.held > G.time) return;
        c.hit.add(e.id);
        if (e.isBoss) {
          crash = true;
          damage(e, dmg * 2.5, this.id, fx * 20, fz * 20);
          return;
        }
        const side = (e.x - c.x) * -fz + (e.z - c.z) * fx >= 0 ? 1 : -1;
        damage(e, dmg, this.id, -fz * side * 12 + fx * 6, fx * side * 12 + fz * 6, { launch: 5 });
        if (ex && e.alive && c.train.length < 6 && e.type !== 'golden') c.train.push({ e, id: e.id });
      });
      if (ex) this.pull(c, fx, fz, dt);
      if (Math.random() < dt * 30) particle(c.x - fx * 1.2, 0.8, c.z - fz * 1.2, -fx * 8 + rand(-2, 2), rand(0.5, 2), -fz * 8 + rand(-2, 2), Math.random() < 0.5 ? 0xeafff0 : 0x5fcf55, 0.18, 0.35, 0, 1);
      if (crash) {
        this.crash(c);
        continue;
      }
      this.items[j++] = c;
    }
    this.items.length = j;
  }
  // Meatball Express: every rabbit the cart hits is noodled onto a flailing train behind it.
  pull(c, fx, fz, dt) {
    let px = c.x - fx * 0.9, pz = c.z - fz * 0.9, k = 0;
    for (const t of c.train) {
      const e = t.e;
      if (!e.alive || e.id !== t.id) continue;
      c.train[k++] = t;
      e.held = G.time + 0.2;
      e.air = true;
      e.vy = 0;
      e.kx = e.kz = 0;
      e.spin += dt * 9;
      const dx = e.x - px, dz = e.z - pz, d = Math.hypot(dx, dz) || 1;
      if (d > 1.1) {
        e.x = px + (dx / d) * 1.1;
        e.z = pz + (dz / d) * 1.1;
      }
      e.y = 0.6;
      queryCircle(e.x, e.z, e.r + 0.3, (o) => {
        if (o === e || o.held > G.time || (o.hits.train || 0) > G.time) return;
        o.hits.train = G.time + 0.4;
        damage(o, 18, this.id, -fz * 10, fx * 10, o.isBoss ? undefined : { launch: 4 });
      });
      px = e.x;
      pz = e.z;
    }
    c.train.length = k;
  }
  crash(c) {
    burst(c.x, 0.8, c.z, 10, [0xc9ced8, 0xe3342f, 0x5fcf55], 6, 0.3, 0.5, 6);
    sfx('slam');
    if (!this.express) return;
    explosion(c.x, c.z, 3, 0xffc83d, 0.2);
    for (const t of c.train) {
      const e = t.e;
      if (!e.alive || e.id !== t.id) continue;
      e.held = 0;
      // every passenger goes meatball
      const x = e.x, z = e.z;
      explosion(x, z, 2.6, 0xb5562b, 0.15);
      queryCircle(x, z, 2.6, (o) => {
        const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz) || 1;
        damage(o, o === e ? 80 : 45, this.id, (dx / d) * 10, (dz / d) * 10, o.isBoss ? undefined : { launch: 7 });
      });
    }
  }
  draw() {
    const ex = this.express;
    for (const c of this.items) {
      dummy.position.set(c.x, Math.abs(Math.sin(c.wob)) * 0.08, c.z);
      dummy.rotation.set(0, Math.atan2(Math.cos(c.a), Math.sin(c.a)), Math.sin(c.wob * 0.5) * 0.08);
      dummy.scale.setScalar((ex ? 1.5 : 1.25) * (0.8 + 0.2 * area()) * Math.min(1, c.life * 4 + 0.3));
      (ex ? I.express : I.cart).push();
      if (!ex) continue;
      let px = c.x, pz = c.z;
      for (const t of c.train) {
        const e = t.e;
        if (!e.alive || e.id !== t.id) continue;
        span(px, 0.9, pz, e.x, e.y + 0.6, e.z);
        I.noodle.push();
        px = e.x;
        pz = e.z;
      }
    }
  }
}

// ======================================================================
// Registry
// ======================================================================
export const WEAPONS = {
  toaster: { name: 'Toaster', emoji: '🍞', desc: 'Lobs flaming toast that explodes on landing.', ups: ['+1 toast', 'Bigger, hotter toast', '+1 toast, wider blast', 'Bagel mode: way faster'], make: () => new Toaster('toaster') },
  sabre: { name: 'Lightsabre', emoji: '⚔️', desc: 'A humming laser sword orbits you. Vwoom.', ups: ['+1 blade', 'More damage', '+1 blade, faster', '+1 blade, maximum vwoom'], make: () => new Sabre('sabre') },
  chicken: { name: 'Rubber Chicken', emoji: '🐔', desc: 'A squeaky boomerang. Hits going out and coming back.', ups: ['Longer throw', '+1 chicken', 'Harder squeak', '+1 chicken, more damage'], make: () => new Chicken('chicken') },
  blower: { name: 'Leaf Blower', emoji: '🍃', desc: 'A cone of hurricane wind. Rabbits go airborne.', ups: ['Wider, longer gust', 'More damage', 'Rabbits fly higher', 'Category 5'], make: () => new Blower('blower') },
  bees: { name: 'Jar of Angry Bees', emoji: '🐝', desc: 'Releases very angry, very homing bees.', ups: ['+1 bee', '+1 bee, more stings', '+1 bee', '+2 bees, extra spicy'], make: () => new Bees('bees') },
  disco: { name: 'Disco Ball Drone', emoji: '🪩', desc: 'An orbiting disco ball that fires groovy lasers.', ups: ['Faster lasers', '+1 disco ball', 'Funkier damage', '+1 disco ball, Saturday night'], make: () => new Disco('disco') },
  pipes: { name: 'Bagpipes of Doom', emoji: '🎵', desc: 'A horrific wail. Expanding rings of noise.', ups: ['Bigger ring', 'Louder (more damage)', 'Bigger, more often', 'The whole clan joins in'], make: () => new Pipes('pipes') },
  slipper: { name: "Grandma's Slipper", emoji: '🩴', desc: 'A colossal slipper falls from the heavens. Fwump.', ups: ['+1 slipper', 'Bigger, harder slippers', 'Faster, bigger', '+1 slipper, Grandma is furious'], make: () => new Slipper('slipper') },
  plunger: { name: 'Thunder Plunger', emoji: '🪠', desc: 'A 10,000 volt plunger bonk that chains between rabbits.', ups: ['+1 chain', 'More voltage', '+1 chain, faster', '+2 chains, overcharged'], make: () => new Plunger('plunger') },
  banana: { name: 'Banana Peels', emoji: '🍌', desc: 'Drops peels. Rabbits slip, spin and go flying.', ups: ['+1 peel', 'Peels last longer, hurt more', '+1 peel, survive 2 slips', '+1 peel, maximum slapstick'], make: () => new Banana('banana') },
  gnome: { name: 'Garden Gnome Sentries', emoji: '🧙', desc: 'Plants garden gnomes that pelt rabbits with acorns.', ups: ['+1 gnome on duty', 'Harder acorns, longer shifts', '+1 gnome, faster slingshots', 'Gnome union: everything better'], make: () => new Gnome('gnome') },
  kazoo: { name: 'Kazoo of Confusion', emoji: '🎺', desc: 'A dreadful honk. Dizzy rabbits walk backwards and take +20% damage.', ups: ['Bigger honk', 'Longer confusion', 'Louder (more damage)', 'Kazoo virtuoso'], make: () => new Kazoo('kazoo') },
  lasso: { name: 'Spaghetti Lasso', emoji: '🍝', desc: 'Ropes a rabbit with a noodle and swings it into its friends.', ups: ['Longer swing, harder fling', '+1 noodle', 'Wider swing, more damage', '+1 noodle, al dente'], make: () => new Lasso('lasso') },
  cart: { name: 'Shopping Cart', emoji: '🛒', desc: 'A leaf-blower-powered shopping cart with no brakes. Plows through rabbits.', ups: ['Faster cart', '+1 cart', 'Heavier cart (more damage)', '+1 cart, turbo blower'], make: () => new Cart('cart') },
};
export const FUSIONS = [
  { id: 'cyclone', a: 'sabre', b: 'blower', name: 'Saber Cyclone', emoji: '🌪️', desc: 'Eight lightsabres in a counter-spinning tornado that flings rabbits.', make: () => new Sabre('cyclone', true) },
  { id: 'meteor', a: 'toaster', b: 'slipper', name: 'Breakfast Meteor', emoji: '☄️', desc: 'Giant flaming toast falls from orbit. Most important meal of the day.', make: () => new Slipper('meteor', true) },
  { id: 'swarm', a: 'chicken', b: 'bees', name: 'Chicken Swarm', emoji: '🐣', desc: 'A flock of homing rubber chickens that ricochet between rabbits.', make: () => new Bees('swarm', true) },
  { id: 'funk', a: 'disco', b: 'plunger', name: 'Funkadelic Storm', emoji: '⚡', desc: 'Three disco balls shooting rainbow chain lightning.', make: () => new Disco('funk', true) },
  { id: 'rave', a: 'pipes', b: 'banana', name: 'Banana Bagpipe Rave', emoji: '🎉', desc: 'Huge rainbow sound waves launch every rabbit and rain banana peels.', make: () => new Pipes('rave', true) },
  { id: 'choir', a: 'gnome', b: 'kazoo', name: 'Gnome Kazoo Choir', emoji: '🎶', desc: 'A ring of golden gnomes follows you, pelting acorns and honking the horde into a daze.', make: () => new Gnome('choir', true) },
  { id: 'express', a: 'lasso', b: 'cart', name: 'Meatball Express', emoji: '🚂', desc: 'Golden carts noodle every rabbit they hit into a flailing train. Then it all goes meatball.', make: () => new Cart('express', true) },
];
export const MAX_LEVEL = 5;
export const MAX_WEAPONS = 6;
export const weaponInfo = (id) => WEAPONS[id] || FUSIONS.find((f) => f.id === id);

export function addWeapon(id) {
  const w = WEAPONS[id].make();
  w.fused = false;
  G.weapons.push(w);
  return w;
}
export function fusionOptions() {
  const out = [];
  for (const f of FUSIONS) {
    const a = G.weapons.find((w) => w.id === f.a), b = G.weapons.find((w) => w.id === f.b);
    if (a && b && a.level >= MAX_LEVEL && b.level >= MAX_LEVEL) out.push(f);
  }
  return out;
}
export function fuse(f) {
  G.weapons = G.weapons.filter((w) => w.id !== f.a && w.id !== f.b);
  const w = f.make();
  w.fused = true;
  w.level = 1;
  G.weapons.push(w);
  G.shake = 0.6;
  burst(P().x, 1.5, P().z, 40, [0xffc83d, 0xff6fa8, 0x47e5ff, 0xffffff], 10, 0.4, 1, 10);
  ring(P().x, P().z, 1, 12, 0.7, 0xffc83d, 1);
  banner(`${f.emoji} ${f.name.toUpperCase()}`, 'fusion complete');
  sfx('fanfare');
}

export function clearWeapons() {
  G.weapons = [];
  peels.length = 0;
  ults.length = 0;
  acorns.length = 0;
}

export function updateWeapons(dt) {
  for (const w of G.weapons) w.update(dt);
  updatePeels(dt);
  updateAcorns(dt);
  updateUlt(dt);
}
export function drawWeapons() {
  beginDraw();
  for (const w of G.weapons) w.draw();
  drawPeels();
  drawAcorns();
  drawUlt();
  endDraw();
}

// ======================================================================
// Ultimate: Orbital Carrot Strike
// ======================================================================
const ults = [];
export function fireUltimate() {
  const p = P();
  const dmg = 140 + G.wave * 24;
  for (let i = 0; i < 36; i++) {
    const e = randomNear(p.x, p.z, G.viewR);
    const x = e ? e.x + rand(-1, 1) : p.x + rand(-G.viewR, G.viewR) * 0.8;
    const z = e ? e.z + rand(-1, 1) : p.z + rand(-G.viewR, G.viewR) * 0.6;
    const delay = i * 0.055;
    ults.push({ x, z, t: -delay, T: 0.7, dmg });
    telegraph(x, z, 3.8, 0.7 + delay, 0xff8a1f);
  }
  banner('ORBITAL CARROT STRIKE', 'incoming!');
  G.shake = 0.5;
  sfx('ult');
}
function updateUlt(dt) {
  for (let i = ults.length - 1; i >= 0; i--) {
    const u = ults[i];
    u.t += dt;
    if (u.t < 0) continue;
    const k = Math.min(1, u.t / u.T);
    u.y = 30 * (1 - k * k);
    if (Math.random() < dt * 40) particle(u.x, u.y + 2, u.z, 0, 3, 0, 0xffd23f, 0.4, 0.3, 0, 1);
    if (k >= 1) {
      explosion(u.x, u.z, 3.8, 0xff8a1f, 0.6);
      queryCircle(u.x, u.z, 3.8, (e) => {
        const dx = e.x - u.x, dz = e.z - u.z, d = Math.hypot(dx, dz) || 1;
        damage(e, u.dmg, 'ult', (dx / d) * 12, (dz / d) * 12, { launch: 9 });
      });
      ults.splice(i, 1);
    }
  }
}
function drawUlt() {
  for (const u of ults) {
    if (u.t < 0) continue;
    dummy.position.set(u.x, u.y + 2.5, u.z);
    dummy.rotation.set(0, G.time * 5, 0);
    dummy.scale.setScalar(6);
    I.bigCarrot.push();
  }
}
