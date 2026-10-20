import * as THREE from 'three';
import { G, dummy, rand, clamp } from './core.js';
import { Inst, vtoon, toon, outlined } from './toon.js';
import { toastGeo, chickenGeo, beeGeo, slipperGeo, bananaGeo, sabreHiltGeo, plungerGeo, carrotGeo } from './models.js';
import { queryCircle, nearest, randomNear, damage } from './enemies.js';
import { burst, particle, explosion, ring, telegraph, beam, lightning, floater, banner } from './fx.js';
import { sfx } from './audio.js';

// ======================================================================
// Shared render batches. All weapons push into these every frame.
// ======================================================================
let I = {};
let sabreMeshes = [], discoMeshes = [];
const SABRE_COLORS = [0x47e5ff, 0x6bff5c, 0xff3b5c, 0xc77dff, 0xffe14d, 0xff8a1f, 0x47e5ff, 0xff3b5c];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Color();

export function initWeapons() {
  I.toast = new Inst(toastGeo(), 80, { outline: 0.03 });
  I.chicken = new Inst(chickenGeo(), 80, { outline: 0.03 });
  I.bee = new Inst(beeGeo(), 120, { outline: 0.025 });
  I.slipper = new Inst(slipperGeo(), 12, { outline: 0.03 });
  I.banana = new Inst(bananaGeo(), 80, { outline: 0.025 });
  I.plunger = new Inst(plungerGeo(), 12, { outline: 0.03 });
  I.bigCarrot = new Inst(carrotGeo(0xff7a12, 0x3fae49), 40, { outline: 0.02 });
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
      const e = randomNear(p.x, p.z, 13);
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
  dmg = [9, 9, 13, 13, 18];
  blades = [1, 2, 2, 3, 4];
  spd = [3.2, 3.4, 3.6, 3.9, 4.3];
  update(dt) {
    const p = P();
    const ar = area();
    const cyc = this.cyclone;
    const n = cyc ? 8 : Math.min(8, this.L(this.blades) + amt());
    const sp = cyc ? 5.5 : this.L(this.spd);
    this.angle += dt * sp;
    const dmg = cyc ? 24 : this.L(this.dmg);
    this.blade = [];
    for (let i = 0; i < n; i++) {
      const outer = cyc && i % 2 === 1;
      const r0 = (outer ? 3.4 : 0.9) * (cyc ? ar : 1);
      const len = (outer ? 2.6 : 1.9) * ar;
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
  dmg = [7, 7, 10, 10, 14];
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
  dmg = [5, 5, 7, 7, 9];
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
      this.items.push({ x: p.x, z: p.z, y: 1.2, vx: Math.cos(a) * 6, vz: Math.sin(a) * 6, target: null, stings: this.swarm ? 6 : this.L(this.stings), life: 6, hcd: 0, wob: rand(0, 6) });
    }
    sfx(this.swarm ? 'squeak' : 'buzz');
  }
  update(dt) {
    this.tick(dt);
    const sp = this.swarm ? 13 : 9.5;
    const dmg = this.swarm ? 16 : this.L(this.dmg);
    this.items = this.items.filter((b) => {
      b.life -= dt;
      b.hcd -= dt;
      b.wob += dt * 12;
      if (!b.target || !b.target.alive) b.target = randomNear(b.x, b.z, 11);
      let tx = 0, tz = 0;
      if (b.target) {
        const dx = b.target.x - b.x, dz = b.target.z - b.z, d = Math.hypot(dx, dz) || 1;
        tx = (dx / d) * sp;
        tz = (dz / d) * sp;
        if (d < b.target.r + 0.45 && b.hcd <= 0) {
          damage(b.target, dmg, this.id, (dx / d) * (this.swarm ? 5 : 1), (dz / d) * (this.swarm ? 5 : 1));
          b.stings--;
          b.hcd = 0.3;
          b.target = this.swarm ? randomNear(b.x, b.z, 8) : b.target;
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
  rate = [0.55, 0.45, 0.45, 0.38, 0.3];
  dmg = [8, 10, 10, 13, 15];
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
      this.shots[i] = (this.storm ? 0.35 : this.L(this.rate)) * cdm();
      _c.setHSL(Math.random(), 1, 0.6);
      _a.set(bx, by, bz);
      if (this.storm) {
        const hit = new Set();
        let cur = e, from = _a.clone(), d = 22;
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
  dmg = [35, 35, 45, 45, 60];
  count = [1, 1, 2, 2, 3];
  rad = [2.4, 2.6, 2.8, 3, 3.4];
  cds = [2.9, 2.6, 2.5, 2.3, 2.0];
  cooldown() { return this.meteor ? 2.0 : this.L(this.cds); }
  fire() {
    const p = P();
    const n = (this.meteor ? 3 : this.L(this.count)) + amt();
    const R = (this.meteor ? 4.5 : this.L(this.rad)) * area();
    let any = false;
    for (let i = 0; i < n; i++) {
      const e = randomNear(p.x, p.z, 13);
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
  dmg = [14, 14, 18, 18, 24];
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
  dmg = [22, 22, 30, 30, 40];
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
  slipper: { name: "Grandma's Slipper", emoji: '🩴', desc: 'A colossal slipper falls from the heavens. Fwump.', ups: ['Faster', '+1 slipper, bigger', 'Bigger slippers', '+1 slipper, Grandma is furious'], make: () => new Slipper('slipper') },
  plunger: { name: 'Thunder Plunger', emoji: '🪠', desc: 'A 10,000 volt plunger bonk that chains between rabbits.', ups: ['+1 chain', 'More voltage', '+1 chain, faster', '+2 chains, overcharged'], make: () => new Plunger('plunger') },
  banana: { name: 'Banana Peels', emoji: '🍌', desc: 'Drops peels. Rabbits slip, spin and go flying.', ups: ['+1 peel', 'Peels last longer, hurt more', '+1 peel, survive 2 slips', '+1 peel, maximum slapstick'], make: () => new Banana('banana') },
};
export const FUSIONS = [
  { id: 'cyclone', a: 'sabre', b: 'blower', name: 'Saber Cyclone', emoji: '🌪️', desc: 'Eight lightsabres in a counter-spinning tornado that flings rabbits.', make: () => new Sabre('cyclone', true) },
  { id: 'meteor', a: 'toaster', b: 'slipper', name: 'Breakfast Meteor', emoji: '☄️', desc: 'Giant flaming toast falls from orbit. Most important meal of the day.', make: () => new Slipper('meteor', true) },
  { id: 'swarm', a: 'chicken', b: 'bees', name: 'Chicken Swarm', emoji: '🐣', desc: 'A flock of homing rubber chickens that ricochet between rabbits.', make: () => new Bees('swarm', true) },
  { id: 'funk', a: 'disco', b: 'plunger', name: 'Funkadelic Storm', emoji: '⚡', desc: 'Three disco balls shooting rainbow chain lightning.', make: () => new Disco('funk', true) },
  { id: 'rave', a: 'pipes', b: 'banana', name: 'Banana Bagpipe Rave', emoji: '🎉', desc: 'Huge rainbow sound waves launch every rabbit and rain banana peels.', make: () => new Pipes('rave', true) },
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
}

export function updateWeapons(dt) {
  for (const w of G.weapons) w.update(dt);
  updatePeels(dt);
  updateUlt(dt);
}
export function drawWeapons() {
  beginDraw();
  for (const w of G.weapons) w.draw();
  drawPeels();
  drawUlt();
  endDraw();
}

// ======================================================================
// Ultimate: Orbital Carrot Strike
// ======================================================================
const ults = [];
export function fireUltimate() {
  const p = P();
  const dmg = 160 + G.wave * 30;
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
