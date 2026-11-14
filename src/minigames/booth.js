// The arcade booth: now and then it appears somewhere in the meadow mid-run. Walk into it and a
// minigame starts (the horde waits); ignore it and it packs up after a while.
import * as THREE from 'three';
import { G, WORLD, rand, clamp } from '../core.js';
import { outlined, vtoon, P, B, C as Cyl, K, S, merge } from '../toon.js';
import { blocked } from '../world.js';
import { ring, sparkle, banner, poof } from '../fx.js';
import { sfx } from '../audio.js';

const LIFE = 45; // seconds the booth stays open
const REACH = 2.4;
let group = null, beacon = null, booth = null, arrowEl = null, timeEl = null, pulse = 0;
const _v = new THREE.Vector3();

function boothGeo() {
  const parts = [
    P(B(2.4, 0.3, 1.8), 0x8a5a33, [0, 0.15, 0]),
    P(B(1.8, 2.4, 1.2), 0x8f4bff, [0, 1.5, 0]),
    P(B(1.84, 0.12, 1.24), 0xffc83d, [0, 0.4, 0]),
    P(B(1.4, 0.95, 0.1), 0x47e5ff, [0, 1.95, 0.6]),
    P(B(1.95, 0.55, 1.35), 0xffc83d, [0, 2.95, 0]),
    P(B(1.75, 0.38, 0.06), 0xe8452c, [0, 2.95, 0.68]),
    P(B(1.7, 0.18, 0.7), 0xe8452c, [0, 1.25, 0.85], [0.25, 0, 0]),
    P(Cyl(0.05, 0.05, 0.35, 6), 0x2b1d3a, [-0.35, 1.5, 0.95]),
    P(S(0.12, 8, 6), 0xe8452c, [-0.35, 1.7, 0.95]),
    P(S(0.09, 8, 6), 0xffe14d, [0.15, 1.38, 1.0]),
    P(S(0.09, 8, 6), 0x47a8ff, [0.42, 1.38, 1.0]),
    // a giant carrot on the roof, so you can spot it from across the meadow
    P(K(0.32, 1.1, 10), 0xff8a1f, [0, 3.85, 0], [Math.PI, 0, 0]),
    P(K(0.1, 0.5, 6), 0x4caf50, [0.08, 4.6, 0], [0, 0, -0.3]),
    P(K(0.1, 0.55, 6), 0x4caf50, [-0.08, 4.62, 0], [0, 0, 0.3]),
  ];
  // striped awning over the front
  for (let i = 0; i < 6; i++) parts.push(P(B(0.32, 0.08, 0.7), i % 2 ? 0xffffff : 0xe8452c, [-0.8 + i * 0.32, 2.62, 0.95], [0.35, 0, 0]));
  return merge(parts);
}

export function initBooth() {
  group = new THREE.Group();
  const m = outlined(boothGeo(), vtoon({ emissive: 0x221133 }), 0.05);
  group.add(m);
  const bg = new THREE.CylinderGeometry(0.9, 1.4, 14, 16, 1, true);
  bg.translate(0, 7, 0);
  beacon = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  group.add(beacon);
  group.visible = false;
  group.scale.setScalar(1.15);
  G.scene.add(group);
  arrowEl = document.getElementById('boothArrow');
  timeEl = document.getElementById('boothTime');
}

export const boothActive = () => !!booth;

export function spawnBooth() {
  if (booth || !group) return false;
  const p = G.player;
  for (let i = 0; i < 24; i++) {
    const a = rand(0, Math.PI * 2), d = rand(13, 18);
    const x = clamp(p.x + Math.cos(a) * d, -WORLD + 6, WORLD - 6), z = clamp(p.z + Math.sin(a) * d, -WORLD + 6, WORLD - 6);
    if (blocked(x, z, 2.2) || Math.hypot(x - p.x, z - p.z) < 9) continue;
    booth = { x, z, life: LIFE };
    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(p.x - x, p.z - z); // face the player
    group.visible = true;
    ring(x, z, 0.5, 5, 0.7, 0xffc83d, 0.9);
    sparkle(x, 3, z, 16, 0xffc83d, 2);
    banner('🎪 AN ARCADE BOOTH!', 'walk in to play a minigame for prizes');
    sfx('gold');
    return true;
  }
  return false;
}

export function clearBooth(fx = false) {
  if (booth && fx) poof(booth.x, booth.z, 2, 0x8f4bff);
  booth = null;
  if (group) group.visible = false;
  if (arrowEl) arrowEl.hidden = true;
}

// Returns true the moment the player walks into the booth.
export function updateBooth(dt) {
  if (!booth) return false;
  booth.life -= dt;
  if (booth.life <= 0) {
    clearBooth(true);
    return false;
  }
  pulse -= dt;
  if (pulse <= 0) {
    pulse = 1.1;
    ring(booth.x, booth.z, 0.5, 3.2, 0.9, 0xffc83d, 0.7);
  }
  const p = G.player;
  return Math.hypot(p.x - booth.x, p.z - booth.z) < REACH;
}

// Visual bits that run every rendered frame: bobbing, blinking before it leaves, the HUD arrow.
export function drawBooth() {
  if (!booth || !group) {
    if (arrowEl && !arrowEl.hidden) arrowEl.hidden = true;
    return;
  }
  const t = performance.now() / 1000;
  const closing = booth.life < 8;
  group.visible = !closing || Math.sin(t * 14) > -0.3;
  group.children[0].position.y = Math.abs(Math.sin(t * 3)) * 0.12;
  beacon.material.opacity = 0.16 + Math.sin(t * 4) * 0.06;
  if (!arrowEl || G.state !== 'playing') {
    if (arrowEl) arrowEl.hidden = true;
    return;
  }
  // point at the booth from the screen edge when it's out of view, hover over it when it's not
  _v.set(booth.x, 4.2, booth.z).project(G.camera);
  const w = innerWidth, h = innerHeight;
  let sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h;
  const m = 48;
  const off = _v.z > 1 || sx < m || sx > w - m || sy < m + 90 || sy > h - m - 70;
  let rot = 90;
  if (off) {
    const cx = w / 2, cy = h / 2;
    let dx = sx - cx, dy = sy - cy;
    if (_v.z > 1) {
      dx = -dx;
      dy = -dy;
    }
    rot = (Math.atan2(dy, dx) * 180) / Math.PI;
    const k = Math.min((w / 2 - m) / Math.abs(dx || 1e-6), (h / 2 - m - 70) / Math.abs(dy || 1e-6));
    sx = cx + dx * k;
    sy = cy + dy * k;
  }
  arrowEl.hidden = false;
  arrowEl.classList.toggle('closing', closing);
  arrowEl.style.transform = `translate(${sx | 0}px, ${sy | 0}px) translate(-50%, -50%)`;
  arrowEl.style.setProperty('--rot', `${rot.toFixed(0)}deg`);
  timeEl.textContent = `${Math.ceil(booth.life)}s`;
}
