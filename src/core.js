import * as THREE from 'three';

// Shared game state. Every system reads and writes this one object.
export const G = {
  scene: null,
  camera: null,
  renderer: null,
  state: 'loading', // loading | menu | playing | levelup | wheel | paused | gameover
  time: 0, // game time (seconds, scaled)
  dt: 0,
  timeScale: 1,
  touch: false,
  lowPower: false,
  shake: 0,
  hitStop: 0,

  player: null,
  stats: null,
  weapons: [],
  passives: [],

  wave: 1,
  waveTime: 0,
  runTime: 0,
  kills: 0,
  born: 0,
  remaining: 1_000_000,
  ultCharge: 0,
  pendingLevels: 0,
  rerolls: 0,
  mod: null, // active Wheel of Chaos modifier
  boss: null,
  goldThisRun: 0,
  damageBy: {}, // weapon id -> damage dealt this run
};

export const WORLD = 105; // half-size of the playable meadow
export const ULT_COST = 150; // kills to charge the Orbital Carrot Strike

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export function fmtTime(s) {
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const dummy = new THREE.Object3D();
export const WHITE = new THREE.Color(1, 1, 1);
