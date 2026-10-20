import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, dummy } from './core.js';

// ---------- cel shading ----------
let gradient = null;
export function gradientMap() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([70, 160, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export function toon(color = 0xffffff, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
}
export const vtoon = (opts = {}) => toon(0xffffff, { vertexColors: true, ...opts });

// Inverted-hull outline: back faces pushed out along the normal, drawn flat dark.
const outlineCache = new Map();
export function outlineMat(width = 0.04, color = 0x2b1d3a) {
  const key = width + ':' + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.outlineWidth = { value: width };
    s.vertexShader = 'uniform float outlineWidth;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += normal * outlineWidth;'
    );
  };
  m.customProgramCacheKey = () => 'outline';
  outlineCache.set(key, m);
  return m;
}

// ---------- geometry kit ----------
export const S = (r, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
export const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
export const C = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const K = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);
export const Cap = (r, l, seg = 8) => new THREE.CapsuleGeometry(r, l, 3, seg);
export const T = (r, tube, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, rs, ts, arc);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Place a primitive (position, euler rotation, scale) and paint it a flat vertex color.
export function P(geo, color, p = [0, 0, 0], r = 0, s = 1) {
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  const rr = Array.isArray(r) ? r : [0, 0, 0];
  const ss = Array.isArray(s) ? s : [s, s, s];
  _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(rr[0], rr[1], rr[2])), _s.set(ss[0], ss[1], ss[2]));
  geo.applyMatrix4(_m);
  _c.set(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function merge(parts) {
  const anyNonIndexed = parts.some((g) => !g.index);
  const list = anyNonIndexed ? parts.map((g) => (g.index ? g.toNonIndexed() : g)) : parts;
  const out = mergeGeometries(list, false);
  out.computeBoundingSphere();
  return out;
}

// ---------- instancing ----------
// An InstancedMesh plus an outline InstancedMesh that shares its matrices.
// Usage per frame: begin(); push(...) for every visible thing; end().
export class Inst {
  constructor(geo, capacity, { mat = vtoon(), outline = 0.04, colors = false, add = true } = {}) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    if (colors) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    if (outline) {
      this.ol = new THREE.InstancedMesh(geo, outlineMat(outline), capacity);
      this.ol.instanceMatrix = this.mesh.instanceMatrix;
      this.ol.frustumCulled = false;
      this.ol.count = 0;
    }
    this.n = 0;
    if (add) this.addTo(G.scene);
  }
  addTo(parent) {
    parent.add(this.mesh);
    if (this.ol) parent.add(this.ol);
    return this;
  }
  begin() {
    this.n = 0;
  }
  // Uses the shared `dummy` transform unless a matrix is given.
  push(color, matrix) {
    if (this.n >= this.capacity) return false;
    if (!matrix) {
      dummy.updateMatrix();
      matrix = dummy.matrix;
    }
    this.mesh.setMatrixAt(this.n, matrix);
    if (color && this.mesh.instanceColor) this.mesh.setColorAt(this.n, color);
    this.n++;
    return true;
  }
  end() {
    this.mesh.count = this.n;
    if (this.ol) this.ol.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  set visible(v) {
    this.mesh.visible = v;
    if (this.ol) this.ol.visible = v;
  }
}

// A plain mesh with an outline child.
export function outlined(geo, mat = vtoon(), width = 0.04) {
  const m = new THREE.Mesh(geo, mat);
  if (width) m.add(new THREE.Mesh(geo, outlineMat(width)));
  return m;
}
