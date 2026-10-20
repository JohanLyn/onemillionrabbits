import * as THREE from 'three';
import { G, dummy, rand } from './core.js';
import { Inst, toon, outlineMat, merge, P, S } from './toon.js';

// Gradient sky dome with a sun/moon disc and stars, plus a ring of puffy clouds on the horizon.
// Both follow the camera so the horizon never comes closer.
let dome, clouds, cloudGroup, cloudMat;
const SKY_R = 185;

const VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = `
uniform vec3 top, hor, fogc, sunCol, sunDir;
uniform float night, time;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(hor, top, smoothstep(0.0, 0.5, h));
  c = mix(fogc, c, smoothstep(-0.04, 0.1, h));
  // cartoon sun or moon: a hard disc plus one flat halo band
  float s = dot(d, sunDir);
  c = mix(c, sunCol, smoothstep(0.9965, 0.9972, s));
  c += sunCol * smoothstep(0.975, 0.977, s) * 0.12;
  if (night > 0.01) {
    vec2 uv = vec2(atan(d.z, d.x) * 46.0, h * 70.0);
    vec2 cell = floor(uv);
    float r = hash(cell);
    vec2 off = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
    float star = step(0.9, r) * smoothstep(0.2, 0.05, length(fract(uv) - 0.5 - off * 0.5));
    star *= 0.55 + 0.45 * sin(time * 2.5 + r * 80.0);
    c += vec3(star * night * smoothstep(0.03, 0.3, h));
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export const skyU = {
  top: { value: new THREE.Color() },
  hor: { value: new THREE.Color() },
  fogc: { value: new THREE.Color() },
  sunCol: { value: new THREE.Color() },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  night: { value: 0 },
  time: { value: 0 },
};

function cloudGeo() {
  const W = 0xffffff, Sh = 0xe4ecf7;
  return merge([
    P(S(1, 12, 8), W, [0, 0.55, 0], 0, [1.25, 1, 1]),
    P(S(0.8, 12, 8), W, [1.15, 0.35, 0.1]),
    P(S(0.75, 12, 8), W, [-1.2, 0.3, 0]),
    P(S(0.6, 10, 8), W, [0.55, 1.1, 0]),
    P(S(1.0, 12, 8), Sh, [0, 0.05, 0], 0, [2.2, 0.35, 0.9]),
  ]);
}

export function initSky() {
  const mat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 32, 16), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  G.scene.add(dome);

  cloudGroup = new THREE.Group();
  G.scene.add(cloudGroup);
  const n = 16;
  // the clouds sit beyond the fog, so neither they nor their ink may be fogged
  cloudMat = toon(0xffffff, { fog: false });
  clouds = new Inst(cloudGeo(), n, { mat: cloudMat, outline: 0.06, add: false });
  const ol = outlineMat(0.06, 0x2b1d3a, null, false);
  clouds.ol.material = ol;
  clouds.addTo(cloudGroup);
  clouds.begin();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.15, 0.15), r = rand(140, 165);
    dummy.position.set(Math.cos(a) * r, rand(6, 22), Math.sin(a) * r);
    dummy.rotation.set(0, -a + Math.PI / 2, 0);
    dummy.scale.setScalar(rand(6, 10));
    dummy.scale.y *= rand(0.7, 1);
    clouds.push();
  }
  clouds.end();
}

export function updateSky(dt) {
  const cam = G.camera;
  dome.position.copy(cam.position);
  cloudGroup.position.set(cam.position.x, 0, cam.position.z);
  cloudGroup.rotation.y += dt * 0.004;
  skyU.time.value += dt;
  // clouds take on the sky's colour in their shadows: pink at sunset, blue at night
  cloudMat.emissive.copy(skyU.hor.value).multiplyScalar(0.55);
}
