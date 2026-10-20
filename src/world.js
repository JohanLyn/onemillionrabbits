import * as THREE from 'three';
import { G, WORLD, dummy, rand } from './core.js';
import { Inst, toon, vtoon, outlined } from './toon.js';
import { treeGeo, pineGeo, bushGeo, flowerGeo, mushroomGeo, grassGeo, postGeo, barnGeo, scarecrowGeo } from './models.js';

// The meadow: ground, scenery, lights, and the static obstacles you bump into.
export const SKY = new THREE.Color(0x8fd3ff);
const DISCO_SKY = new THREE.Color(0x2a1446);
let hemi, sun, fog;
const obstacles = [];
const CELL = 8;
const ogrid = new Map();
const okey = (cx, cz) => cx * 1000 + cz;

function lawnTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7fd35a';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#74c950';
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 18; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(40,90,20,0.04)';
    g.beginPath();
    g.ellipse(rand(0, 256), rand(0, 256), rand(6, 26), rand(4, 16), rand(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(50,110,30,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 140; i++) {
    const x = rand(0, 256), y = rand(0, 256);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rand(-2, 2), y - rand(3, 6));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function addObstacle(x, z, r) {
  const o = { x, z, r };
  obstacles.push(o);
  const reach = r + 1.5; // covers the radius of anything that might bump into it
  const cx0 = Math.floor((x - reach) / CELL), cx1 = Math.floor((x + reach) / CELL);
  const cz0 = Math.floor((z - reach) / CELL), cz1 = Math.floor((z + reach) / CELL);
  for (let cx = cx0; cx <= cx1; cx++)
    for (let cz = cz0; cz <= cz1; cz++) {
      const k = okey(cx, cz);
      if (!ogrid.has(k)) ogrid.set(k, []);
      ogrid.get(k).push(o);
    }
}

// Shove a circle out of any scenery it overlaps. Returns true if it collided.
export function pushOut(p, radius) {
  const list = ogrid.get(okey(Math.floor(p.x / CELL), Math.floor(p.z / CELL)));
  let hit = false;
  if (list) {
    for (const o of list) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const rr = o.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = o.x + (dx / d) * rr;
        p.z = o.z + (dz / d) * rr;
        hit = true;
      }
    }
  }
  const lim = WORLD;
  if (p.x > lim) p.x = lim;
  if (p.x < -lim) p.x = -lim;
  if (p.z > lim) p.z = lim;
  if (p.z < -lim) p.z = -lim;
  return hit;
}
export function blocked(x, z, r = 1) {
  const list = ogrid.get(okey(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return false;
  return list.some((o) => (x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + r) ** 2);
}

export function initWorld() {
  const scene = G.scene;
  scene.background = SKY.clone();
  fog = new THREE.Fog(SKY.clone(), 55, 120);
  scene.fog = fog;
  hemi = new THREE.HemisphereLight(0xdff4ff, 0x7aa860, 1.35);
  sun = new THREE.DirectionalLight(0xfff6e6, 2.3);
  sun.position.set(0.55, 1, 0.4);
  scene.add(hemi, sun);

  const tex = lawnTexture();
  const size = (WORLD + 60) * 2;
  tex.repeat.set(size / 16, size / 16);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), toon(0xffffff, { map: tex }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // a dirt farm plot in the middle of everything
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(7, 32).rotateX(-Math.PI / 2), toon(0xb98552));
  dirt.position.set(14, 0.02, -10);
  scene.add(dirt);
  const rows = new Inst(new THREE.BoxGeometry(8, 0.25, 0.7), 6, { mat: toon(0x9c6a3c), outline: 0.03 });
  rows.begin();
  for (let i = 0; i < 5; i++) {
    dummy.position.set(14, 0.1, -12.6 + i * 1.3);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    rows.push();
  }
  rows.end();

  const barn = outlined(barnGeo(), vtoon(), 0.07);
  barn.position.set(-20, 0, -18);
  barn.rotation.y = 0.5;
  scene.add(barn);
  for (const [dx, dz] of [[0, 0], [2, 2], [-2, -2], [2, -2], [-2, 2], [0, 3.2], [0, -3.2], [3, 0], [-3, 0]]) {
    const c = Math.cos(0.5), s = Math.sin(0.5);
    addObstacle(-20 + dx * c + dz * s, -18 - dx * s + dz * c, 2.4);
  }
  const crow = outlined(scarecrowGeo(), vtoon(), 0.04);
  crow.position.set(14, 0, -6);
  scene.add(crow);
  addObstacle(14, -6, 0.5);

  const free = (x, z, r) => Math.hypot(x, z) > 9 && !blocked(x, z, r + 1.5);
  const scatter = (geo, n, r, outline, scaleRange, collide, edgeOnly = false, cap = n) => {
    const inst = new Inst(geo, cap, { mat: vtoon(), outline });
    inst.begin();
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 30) {
      let x, z;
      if (edgeOnly) {
        const side = Math.floor(rand(0, 4)), t = rand(-WORLD - 30, WORLD + 30), off = WORLD + rand(5, 30);
        [x, z] = side === 0 ? [t, off] : side === 1 ? [t, -off] : side === 2 ? [off, t] : [-off, t];
      } else {
        x = rand(-WORLD + 3, WORLD - 3);
        z = rand(-WORLD + 3, WORLD - 3);
      }
      const s = rand(scaleRange[0], scaleRange[1]);
      if (!edgeOnly && !free(x, z, r * s)) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rand(0, 6.3), 0);
      dummy.scale.setScalar(s);
      inst.push();
      if (collide) addObstacle(x, z, r * s);
      placed++;
    }
    inst.end();
    return inst;
  };
  scatter(treeGeo(), 70, 0.9, 0.06, [0.8, 1.3], true);
  scatter(pineGeo(), 45, 0.7, 0.06, [0.8, 1.4], true);
  scatter(treeGeo(), 140, 1, 0.06, [1, 1.6], false, true);
  scatter(pineGeo(), 120, 1, 0.06, [1, 1.7], false, true);
  scatter(bushGeo(), 80, 0.8, 0.04, [0.8, 1.3], true);
  const rock = new THREE.DodecahedronGeometry(0.7, 0);
  rock.scale(1, 0.65, 1);
  const rocks = new Inst(rock, 60, { mat: toon(0xa6a2b5), outline: 0.05 });
  rocks.begin();
  for (let i = 0; i < 60; i++) {
    const x = rand(-WORLD, WORLD), z = rand(-WORLD, WORLD), s = rand(0.6, 1.6);
    if (!free(x, z, 0.7 * s)) continue;
    dummy.position.set(x, 0.15 * s, z);
    dummy.rotation.set(0, rand(0, 6), 0);
    dummy.scale.setScalar(s);
    rocks.push();
    addObstacle(x, z, 0.65 * s);
  }
  rocks.end();
  for (const col of [0xff6fa8, 0xffffff, 0x9b7bff, 0xff5b5b]) scatter(flowerGeo(col), 160, 0.1, 0.02, [0.8, 1.4], false);
  scatter(mushroomGeo(), 60, 0.2, 0.025, [0.8, 1.6], false);
  scatter(grassGeo(), G.lowPower ? 700 : 1600, 0.05, 0, [0.8, 1.5], false);

  // fence around the meadow
  const posts = new Inst(postGeo(), 400, { mat: vtoon(), outline: 0.04 });
  posts.begin();
  const F = WORLD + 2;
  for (let t = -F; t <= F; t += 3.5) {
    for (const [x, z] of [[t, F], [t, -F], [F, t], [-F, t]]) {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      posts.push();
    }
  }
  posts.end();
  const railMat = toon(0xd9a46a);
  for (const y of [0.45, 0.95]) {
    for (const [x, z, ry] of [[0, F, 0], [0, -F, 0], [F, 0, Math.PI / 2], [-F, 0, Math.PI / 2]]) {
      const rail = outlined(new THREE.BoxGeometry(F * 2, 0.18, 0.1), railMat, 0.03);
      rail.position.set(x, y, z);
      rail.rotation.y = ry;
      scene.add(rail);
    }
  }
}

// Wheel of Chaos "Disco Inferno" turns the meadow into a dance floor.
let disco = false, discoT = 0;
const _col = new THREE.Color();
export function setDisco(on) {
  disco = on;
  if (!on) {
    G.scene.background.copy(SKY);
    fog.color.copy(SKY);
    hemi.intensity = 1.35;
    sun.color.set(0xfff6e6);
    sun.intensity = 2.3;
  }
}
export function updateWorld(dt) {
  if (!disco) return;
  discoT += dt;
  _col.setHSL((discoT * 0.25) % 1, 0.9, 0.6);
  sun.color.copy(_col);
  sun.intensity = 2.6;
  hemi.intensity = 0.55;
  G.scene.background.lerpColors(DISCO_SKY, _col, 0.15);
  fog.color.copy(G.scene.background);
}
