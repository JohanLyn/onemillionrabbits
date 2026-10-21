import * as THREE from 'three';

export const VERSION = '0.9.0-beta';

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
  settings: null, // the player's settings (see save.js), shared object
};

// Difficulty levels. The rabbit multipliers ramp in over the first six waves (see diffK), so the
// opening is the same on every level and only the middle and late game change.
export const DIFFICULTIES = {
  fluffy: { name: 'Fluffy', emoji: '🐰', desc: 'A gentle stroll. Fewer carrots.', hp: 0.85, dmg: 0.8, speed: 0.95, horde: 0.9, xp: 1.1, heal: 1.4, gold: 0.75 },
  normal: { name: 'Normal', emoji: '🥕', desc: 'The meadow as intended.', hp: 1.3, dmg: 1.25, speed: 1.07, horde: 1.2, xp: 0.9, heal: 0.7, gold: 1 },
  rabid: { name: 'Rabid', emoji: '🔥', desc: 'Foaming at the mouth. +60% golden carrots.', hp: 1.85, dmg: 1.6, speed: 1.14, horde: 1.4, xp: 0.82, heal: 0.4, gold: 1.6 },
};
G.diffId = 'normal';
G.diff = DIFFICULTIES.normal;
export function diffK(key) {
  const k = Math.min(1, Math.max(0, (G.wave - 1) / 6));
  return 1 + (G.diff[key] - 1) * k;
}

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
