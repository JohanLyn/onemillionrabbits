import * as THREE from 'three';
import { G, rand, damp, clamp } from './core.js';

// Camera rig: follows the player from a high three-quarter angle, orbits on the title screen,
// and measures how much ground is visible so rabbits spawn just off-screen.
const camOffset = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();

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
  const camDist = camOffset.length();
  G.scene.fog.near = camDist + 18;
  G.scene.fog.far = camDist + 80;
  cam.updateProjectionMatrix();
  cam.position.copy(camOffset);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  let r = 10;
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
    _ray.setFromCamera({ x, y }, cam);
    if (_ray.ray.intersectPlane(_ground, _hit)) r = Math.max(r, Math.hypot(_hit.x, _hit.z));
  }
  G.viewR = Math.min(r, 48);
}

export function updateCamera(realDt) {
  const cam = G.camera, p = G.player;
  if (G.state === 'menu') {
    const a = G.time * 0.08;
    const r = camOffset.length() * 0.85;
    camPos.set(Math.sin(a) * r * 0.7, r * 0.55, Math.cos(a) * r * 0.7);
    camTarget.set(0, 1.5, 0);
    cam.position.lerp(camPos, 1 - Math.exp(-3 * realDt));
  } else {
    camTarget.x = damp(camTarget.x, p.x, 8, realDt);
    camTarget.z = damp(camTarget.z, p.z, 8, realDt);
    camTarget.y = 0;
    camPos.copy(camTarget).add(camOffset);
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
