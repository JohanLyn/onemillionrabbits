import * as THREE from 'three';
import { G, rand, damp, clamp } from './core.js';
import { E } from './enemies.js';

// Camera rig: follows the player from a high three-quarter angle, orbits low on the title screen
// (so the sky shows), drifts up toward the sky on game over, and eases out a little when the
// horde gets thick or a boss shows up. It measures how much ground is visible so rabbits
// spawn just off-screen.
const camOffset = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();
const VIEW_CAP = 48;
let baseR = 30, camDist = 25, zoomK = 1, maxK = 1, orbitA = 0;

export function initCamera() {
  G.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
  return G.camera;
}

export function resizeCamera(w, h) {
  const cam = G.camera;
  cam.aspect = w / h;
  // portrait phones pull the camera back so you can see the horde coming
  const zoom = clamp(0.9 / cam.aspect, 1, 1.75);
  camOffset.set(0, 21 * zoom, 14.5 * zoom);
  camDist = camOffset.length();
  cam.updateProjectionMatrix();
  cam.position.copy(camOffset);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  let r = 10;
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
    _ray.setFromCamera({ x, y }, cam);
    if (_ray.ray.intersectPlane(_ground, _hit)) r = Math.max(r, Math.hypot(_hit.x, _hit.z));
  }
  baseR = r;
  // the visible ground grows linearly with the pull-back, so only zoom out while spawns stay hidden
  maxK = clamp(VIEW_CAP / r, 1, 1.2);
  applyZoom();
}

function applyZoom() {
  G.viewR = Math.min(baseR * zoomK, VIEW_CAP);
  G.scene.fog.near = camDist * zoomK + 18;
  G.scene.fog.far = camDist * zoomK + 80;
}

export function updateCamera(realDt) {
  const cam = G.camera, p = G.player;
  if (G.state === 'menu' || G.state === 'gameover' || G.state === 'victory') {
    // low, slow orbit with the horizon in the top of the frame
    orbitA += realDt * 0.08;
    const over = G.state !== 'menu';
    const r = camDist * (over ? 0.75 : 0.8);
    const cx = over ? p.x : 0, cz = over ? p.z : 0;
    camPos.set(cx + Math.sin(orbitA) * r, r * (over ? 0.36 : 0.3), cz + Math.cos(orbitA) * r);
    camTarget.x = damp(camTarget.x, cx, 3, realDt);
    camTarget.z = damp(camTarget.z, cz, 3, realDt);
    camTarget.y = damp(camTarget.y, 2.2, 3, realDt);
    cam.position.lerp(camPos, 1 - Math.exp(-(over ? 1.2 : 3) * realDt));
  } else {
    // a gentle pull-back for a thick horde or a boss, never more than keeps spawns off-screen
    const crowd = clamp((E.length - 80) / 320, 0, 1);
    const want = 1 + (maxK - 1) * Math.min(1, crowd * 0.75 + (G.boss ? 0.6 : 0));
    zoomK = damp(zoomK, want, 0.6, realDt);
    applyZoom();
    orbitA = Math.atan2(cam.position.x - p.x, cam.position.z - p.z);
    camTarget.x = damp(camTarget.x, p.x, 8, realDt);
    camTarget.z = damp(camTarget.z, p.z, 8, realDt);
    camTarget.y = damp(camTarget.y, 0, 8, realDt);
    camPos.copy(camOffset).multiplyScalar(zoomK).add(camTarget);
    cam.position.lerp(camPos, 1 - Math.exp(-10 * realDt));
  }
  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - realDt * 2.5);
    const s = G.shake * G.shake * 0.8 * (G.settings?.shake === false ? 0 : 1);
    cam.position.x += rand(-s, s);
    cam.position.y += rand(-s, s);
  }
  cam.lookAt(camTarget);
  if (G.mod?.id === 'jelly') cam.rotation.z += Math.sin(G.time * 2.2) * 0.02;
}
