import * as THREE from 'three';
import { G, WORLD, dummy, rand, clamp, lerp, damp } from './core.js';
import { Inst, toon, vtoon, outlined, U, P, S, C, Cap, merge } from './toon.js';
import { treeGeo, pineGeo, bushGeo, flowerGeo, mushroomGeo, grassGeo, postGeo, barnGeo, scarecrowGeo } from './models.js';
import { initSky, updateSky, skyU } from './sky.js';
import { initAmbient, updateAmbient } from './ambient.js';

// The meadow: ground, scenery, lights, the day/night cycle, and the static obstacles you bump into.
export const SKY = new THREE.Color(0x8fd3ff);
let hemi, sun, fog, lamp, barnWin, water;
const obstacles = [];
const CELL = 8;
const ogrid = new Map();
const okey = (cx, cz) => cx * 1000 + cz;
const POND = { x: -17, z: 21, r: 5.2 };

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

// Tileable soft blobs: red = drifting cloud shadows, green = large-scale lawn colour variation.
function cloudTexture() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'lighter';
  const blob = (x, y, r, rgb, a) => {
    for (const ox of [-N, 0, N])
      for (const oy of [-N, 0, N]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(${rgb},${a})`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  };
  for (let i = 0; i < 7; i++) {
    const x = rand(0, N), y = rand(0, N), r = rand(26, 44);
    for (let k = 0; k < 5; k++) blob(x + rand(-r, r), y + rand(-r * 0.6, r * 0.6), r * rand(0.5, 0.9), '255,0,0', 0.55);
  }
  for (let i = 0; i < 26; i++) blob(rand(0, N), rand(0, N), rand(20, 60), '0,255,0', 0.35);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
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

// ---------- the pond ----------
const WATER_VERT = `
varying vec2 vP;
#include <fog_pars_vertex>
void main() {
  vP = position.xz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FRAG = `
uniform vec3 deep, shallow, hi;
uniform float uTime, night, R;
varying vec2 vP;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float r = length(vP) / R;
  vec3 c = mix(deep, shallow, smoothstep(0.35, 0.9, r));
  // flat cartoon ripples drifting across the surface
  float w = sin(vP.x * 1.4 + uTime * 1.1 + sin(vP.y * 0.9 + uTime * 0.7) * 1.5) * sin(vP.y * 1.2 - uTime * 0.8);
  c = mix(c, hi, step(0.78, w) * 0.55);
  // stars reflected at night
  vec2 cell = floor(vP * 2.2);
  float s = step(0.93, hash(cell)) * smoothstep(0.16, 0.02, length(fract(vP * 2.2) - 0.5));
  c += vec3(s * night * (0.6 + 0.4 * sin(uTime * 3.0 + hash(cell) * 50.0)));
  // foam ring at the shore
  c = mix(c, hi, smoothstep(0.9, 0.92, r));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const waterU = {
  deep: { value: new THREE.Color() },
  shallow: { value: new THREE.Color() },
  hi: { value: new THREE.Color() },
  night: { value: 0 },
  R: { value: POND.r },
};
function buildPond(scene) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(uniforms, waterU, { uTime: U.time });
  water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.r, 40).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, fog: true })
  );
  water.position.set(POND.x, 0.06, POND.z);
  scene.add(water);
  const shore = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 0.9, 40).rotateX(-Math.PI / 2), toon(0xe8d49a));
  shore.position.set(POND.x, 0.035, POND.z);
  scene.add(shore);
  addObstacle(POND.x, POND.z, POND.r - 0.3);

  // lily pads and a few reeds; the reeds sway with the grass
  const pads = [];
  for (let i = 0; i < 5; i++) {
    const a = rand(0, 6.3), d = rand(1.2, POND.r - 1.2), s = rand(0.45, 0.75);
    const pad = new THREE.CylinderGeometry(s, s, 0.06, 14, 1, false, 0.5, Math.PI * 2 - 0.5);
    pads.push(P(pad, i % 2 ? 0x4fb848 : 0x5fcf55, [Math.cos(a) * d, 0.09, Math.sin(a) * d], [0, rand(0, 6), 0]));
    if (i === 1) pads.push(P(S(0.18, 8, 6), 0xff8fc8, [Math.cos(a) * d, 0.2, Math.sin(a) * d], 0, [1, 0.6, 1]));
  }
  const padMesh = outlined(merge(pads), vtoon(), 0.03);
  padMesh.position.set(POND.x, 0, POND.z);
  scene.add(padMesh);
  const reedSway = [0.09, 0.2];
  const reeds = new Inst(merge([
    P(C(0.03, 0.035, 1.5, 5), 0x4f9a3a, [0, 0.75, 0]),
    P(Cap(0.07, 0.3, 6), 0x7a4a2a, [0, 1.4, 0]),
    P(C(0.025, 0.03, 1.1, 5), 0x5fae45, [0.15, 0.55, 0.05], [0, 0, -0.15]),
  ]), 24, { mat: vtoon({}, { sway: reedSway }), outline: 0.025, sway: reedSway });
  reeds.begin();
  for (let i = 0; i < 18; i++) {
    const a = rand(0, 6.3), d = POND.r + rand(-0.4, 0.5);
    dummy.position.set(POND.x + Math.cos(a) * d, 0, POND.z + Math.sin(a) * d);
    dummy.rotation.set(0, rand(0, 6.3), 0);
    dummy.scale.setScalar(rand(0.7, 1.15));
    reeds.push();
  }
  reeds.end();
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
  // a warm lantern glow around the player after dark (one more light per pixel, so not on phones)
  if (!G.lowPower) {
    lamp = new THREE.PointLight(0xffc77a, 0, 20, 1.2);
    scene.add(lamp);
  }
  initSky();

  const tex = lawnTexture();
  U.cloudTex.value = cloudTexture();
  const size = (WORLD + 60) * 2;
  tex.repeat.set(size / 16, size / 16);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), toon(0xffffff, { map: tex }, { ground: true }));
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
  // the hayloft window lights up at night
  barnWin = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0x3a2618 }));
  barnWin.position.set(0, 4.6, 3.7);
  barn.add(barnWin);
  for (const [dx, dz] of [[0, 0], [2, 2], [-2, -2], [2, -2], [-2, 2], [0, 3.2], [0, -3.2], [3, 0], [-3, 0]]) {
    const c = Math.cos(0.5), s = Math.sin(0.5);
    addObstacle(-20 + dx * c + dz * s, -18 - dx * s + dz * c, 2.4);
  }
  const crow = outlined(scarecrowGeo(), vtoon(), 0.04);
  crow.position.set(14, 0, -6);
  scene.add(crow);
  addObstacle(14, -6, 0.5);
  buildPond(scene);

  const free = (x, z, r) => Math.hypot(x, z) > 9 && !blocked(x, z, r + 1.5);
  // o: { edge: only outside the fence, cap, sway: [strength, fromY], glow }
  const scatter = (geo, n, r, outline, scaleRange, collide, o = {}) => {
    const inst = new Inst(geo, o.cap || n, { mat: vtoon({}, { sway: o.sway, glow: o.glow }), outline, sway: o.sway });
    inst.begin();
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 30) {
      let x, z;
      if (o.edge) {
        const side = Math.floor(rand(0, 4)), t = rand(-WORLD - 30, WORLD + 30), off = WORLD + rand(5, 30);
        [x, z] = side === 0 ? [t, off] : side === 1 ? [t, -off] : side === 2 ? [off, t] : [-off, t];
      } else {
        x = rand(-WORLD + 3, WORLD - 3);
        z = rand(-WORLD + 3, WORLD - 3);
      }
      const s = rand(scaleRange[0], scaleRange[1]);
      if (!o.edge && !free(x, z, r * s)) continue;
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
  const treeSway = [0.035, 1.5], pineSway = [0.025, 1.0];
  scatter(treeGeo(), 70, 0.9, 0.06, [0.8, 1.3], true, { sway: treeSway });
  scatter(pineGeo(), 45, 0.7, 0.06, [0.8, 1.4], true, { sway: pineSway });
  scatter(treeGeo(), 140, 1, 0.06, [1, 1.6], false, { edge: true, sway: treeSway });
  scatter(pineGeo(), 120, 1, 0.06, [1, 1.7], false, { edge: true, sway: pineSway });
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
  for (const col of [0xff6fa8, 0xffffff, 0x9b7bff, 0xff5b5b]) scatter(flowerGeo(col), 160, 0.1, 0.02, [0.8, 1.4], false, { glow: true });
  scatter(mushroomGeo(), 60, 0.2, 0.025, [0.8, 1.6], false, { glow: true });
  scatter(grassGeo(), G.lowPower ? 700 : 1600, 0.05, 0, [0.8, 1.5], false, { sway: [0.16, 0] });

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
  // the disco dance floor: glowing tiles that follow the player around
  floor = new Inst(new THREE.PlaneGeometry(TILE * 0.9, TILE * 0.9).rotateX(-Math.PI / 2), (FLOOR_N * 2 + 1) ** 2, {
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
    outline: 0,
    colors: true,
  });
  floor.mesh.renderOrder = 1;
  initAmbient();
  sampleDay(phase);
  applyLook();
}

// ---------- time of day ----------
// Keyframes in waves: morning → noon → golden hour → sunset → dusk → starry night,
// then a long night, a pink dawn and round again. One wave is 40 seconds.
const WAVE_LEN = 40;
const CYCLE = 22;
const KEYS = [
  [0, { top: 0x5aaef5, hor: 0xd8f1ff, fog: 0xc6e9ff, hs: 0xe4f4ff, hg: 0x7aa860, hi: 1.3, sc: 0xfff0d8, si: 2.2, el: 0.75, rim: 0xfff2d6, ri: 0.3, night: 0, cloud: 0.2, deep: 0x3aa6e6, shal: 0x7fdcff }],
  [3, { top: 0x3f98f5, hor: 0xb4e2ff, fog: 0xaedcff, hs: 0xeaf7ff, hg: 0x86b866, hi: 1.38, sc: 0xffffff, si: 2.35, el: 1.15, rim: 0xffffff, ri: 0.28, night: 0, cloud: 0.22, deep: 0x2f9be6, shal: 0x74d8ff }],
  [7, { top: 0x5a92e0, hor: 0xffe2ad, fog: 0xf2dcae, hs: 0xffeccc, hg: 0x8c9e52, hi: 1.25, sc: 0xffd08a, si: 2.35, el: 0.55, rim: 0xffd890, ri: 0.4, night: 0, cloud: 0.2, deep: 0x3c8fd0, shal: 0x8fd6e8 }],
  [9.5, { top: 0x4c5cb4, hor: 0xffa070, fog: 0xf0aa86, hs: 0xffb4c4, hg: 0x5c7a64, hi: 1.15, sc: 0xffa060, si: 2.3, el: 0.22, rim: 0xffa060, ri: 0.55, night: 0.05, cloud: 0.12, deep: 0x3a5aa8, shal: 0xe89a8a }],
  [11.5, { top: 0x26286a, hor: 0xa2608e, fog: 0x7a5a8e, hs: 0xa898f0, hg: 0x3a5262, hi: 1.0, sc: 0xd8a0ff, si: 1.2, el: 0.4, rim: 0xd0a8ff, ri: 0.5, night: 0.55, cloud: 0.05, deep: 0x232a66, shal: 0x5a4a8e }],
  [13.5, { top: 0x0a0f2e, hor: 0x24305e, fog: 0x1c2850, hs: 0x7c94e6, hg: 0x22304a, hi: 0.95, sc: 0x9fb6ff, si: 0.95, el: 0.95, rim: 0xa8c8ff, ri: 0.6, night: 1, cloud: 0, deep: 0x0e1638, shal: 0x24387a }],
  [19, { top: 0x0a0f2e, hor: 0x24305e, fog: 0x1c2850, hs: 0x7c94e6, hg: 0x22304a, hi: 0.95, sc: 0x9fb6ff, si: 0.95, el: 0.95, rim: 0xa8c8ff, ri: 0.6, night: 1, cloud: 0, deep: 0x0e1638, shal: 0x24387a }],
  [20.6, { top: 0x7484d4, hor: 0xffc4ac, fog: 0xe6bfb6, hs: 0xffd6cc, hg: 0x6e8a62, hi: 1.15, sc: 0xffb894, si: 1.9, el: 0.3, rim: 0xffc0a0, ri: 0.45, night: 0.15, cloud: 0.12, deep: 0x4a70c0, shal: 0xf0b0b0 }],
];
const COLS = ['top', 'hor', 'fog', 'hs', 'hg', 'sc', 'rim', 'deep', 'shal'];
const NUMS = ['hi', 'si', 'el', 'ri', 'night', 'cloud'];
for (const [, k] of KEYS) for (const c of COLS) k[c] = new THREE.Color(k[c]);
KEYS.push([CYCLE, KEYS[0][1]]);
const mkLook = () => {
  const o = {};
  for (const c of COLS) o[c] = new THREE.Color();
  for (const n of NUMS) o[n] = 0;
  return o;
};
const look = mkLook();
const MENU_PHASE = 1.4; // the title screen is always a sunny late morning
let phase = MENU_PHASE;

function dayPhase() {
  if (G.state === 'menu' || G.state === 'loading') return MENU_PHASE;
  return (G.wave - 1 + Math.min(1, G.waveTime / WAVE_LEN)) % CYCLE;
}
function sampleDay(d) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= d) i++;
  const [d0, a] = KEYS[i], [d1, b] = KEYS[i + 1];
  let t = clamp((d - d0) / (d1 - d0), 0, 1);
  t = t * t * (3 - 2 * t);
  for (const c of COLS) look[c].lerpColors(a[c], b[c], t);
  for (const n of NUMS) look[n] = lerp(a[n], b[n], t);
}

// Wheel of Chaos "Disco Inferno" turns the meadow into a dance floor on top of whatever hour it is.
let disco = false, discoT = 0, discoMix = 0, floor;
const DISCO_SKY = new THREE.Color(0x2a1446);
const TILE = 3, FLOOR_N = 7;

function drawFloor() {
  floor.begin();
  if (discoMix > 0.01) {
    const p = G.player;
    const cx = Math.round(p.x / TILE), cz = Math.round(p.z / TILE);
    const beat = Math.floor(discoT * 2.2);
    const R = FLOOR_N * TILE;
    for (let i = -FLOOR_N; i <= FLOOR_N; i++)
      for (let j = -FLOOR_N; j <= FLOOR_N; j++) {
        const x = (cx + i) * TILE, z = (cz + j) * TILE;
        const fade = Math.max(0, 1 - Math.hypot(x - p.x, z - p.z) / R);
        // classic light-up floor: tiles take turns in a rolling checker pattern
        const on = (cx + i + cz + j + beat) % 3 === 0 ? 1 : 0.12;
        dummy.position.set(x, 0.05, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        _col.setHSL((((cx + i) * 0.13 + (cz + j) * 0.07 + beat * 0.11) % 1 + 1) % 1, 1, 0.5).multiplyScalar(on * fade * discoMix * 0.32);
        floor.push(_col);
      }
  }
  floor.end();
}
const _col = new THREE.Color();
export function setDisco(on) {
  disco = on;
}

// Push the sampled look into the lights, fog, sky and water.
function applyLook() {
  const L = look;
  hemi.color.copy(L.hs);
  hemi.groundColor.copy(L.hg);
  hemi.intensity = L.hi;
  sun.color.copy(L.sc);
  sun.intensity = L.si;
  const az = 0.9 - L.el * 0.5;
  sun.position.set(Math.cos(L.el) * Math.sin(az), Math.sin(L.el), Math.cos(L.el) * Math.cos(az));
  fog.color.copy(L.fog);
  skyU.top.value.copy(L.top);
  skyU.hor.value.copy(L.hor);
  skyU.fogc.value.copy(L.fog);
  skyU.night.value = L.night;
  skyU.sunCol.value.copy(L.sc).lerp(_col.set(0xffffff), 0.45).lerp(_col.set(0xeef0ff), L.night);
  skyU.sunDir.value.copy(sun.position).normalize();
  U.rim.value.copy(L.rim).multiplyScalar(L.ri);
  U.cloudAmt.value = L.cloud;
  U.glow.value = L.night * 0.32;
  waterU.deep.value.copy(L.deep);
  waterU.shallow.value.copy(L.shal);
  waterU.hi.value.copy(L.hor).lerp(_col.set(0xffffff), 0.6 - L.night * 0.35);
  waterU.night.value = L.night;
  barnWin.material.color.set(0x3a2618).lerp(_col.set(0xffd36b), clamp(L.night * 1.6 - 0.2, 0, 1));
  if (lamp) lamp.intensity = L.night * (G.state === 'menu' ? 0 : 9);

  if (discoMix > 0.001) {
    _col.setHSL((discoT * 0.25) % 1, 0.9, 0.6);
    sun.color.lerp(_col, discoMix);
    sun.intensity = lerp(sun.intensity, 2.6, discoMix);
    hemi.intensity = lerp(hemi.intensity, 0.55, discoMix);
    fog.color.lerp(_col.lerp(DISCO_SKY, 0.85), discoMix);
    skyU.top.value.lerp(DISCO_SKY, discoMix);
    skyU.hor.value.lerp(fog.color, discoMix);
    skyU.fogc.value.copy(fog.color);
    U.cloudAmt.value *= 1 - discoMix;
  }
  G.scene.background.copy(fog.color);
}

export function updateWorld(dt) {
  U.time.value += dt;
  U.cloudOff.value.x += dt * 0.006;
  U.cloudOff.value.y += dt * 0.0025;
  discoT += dt;
  discoMix = clamp(discoMix + (disco ? dt : -dt) * 1.5, 0, 1);
  // ease small steps (title → wave 1), cut big ones (game over → title, or wrapping round the cycle)
  const target = dayPhase();
  phase = Math.abs(target - phase) > 2 ? target : damp(phase, target, 1.5, dt);
  sampleDay(phase);
  applyLook();
  drawFloor();
  const p = G.player;
  if (p && lamp) lamp.position.set(p.x, 3.5, p.z + 1);
  updateSky(dt);
  updateAmbient(dt, look.night);
}
