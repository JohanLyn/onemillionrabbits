import * as THREE from 'three';
import { G, rand, pick, damp, clamp } from './core.js';
import { initWorld, updateWorld } from './world.js';
import { initFx, updateFx, clearFx, banner, burst, ring } from './fx.js';
import { initEnemies, clearEnemies, updateEnemies, drawEnemies, drawPlayerShadow, director, hordeEvent, spawnBoss, spawnEnemy, queryCircle, damage, E } from './enemies.js';
import { initPickups, clearPickups, updatePickups, drawPickups } from './pickups.js';
import { initWeapons, clearWeapons, updateWeapons, drawWeapons, addWeapon, fireUltimate } from './weapons.js';
import { Player, CHARS } from './player.js';
import { computeStats, rollOptions, applyOption, openChest, SHOP, shopCost } from './upgrades.js';
import { applyMod, clearMod, spinWheel, updateWheel, skipWheel } from './chaos.js';
import { initInput, readInput, input, resetJoystick } from './input.js';
import { initAudio, sfx, setMuted, startMusic, music } from './audio.js';
import { save, loadSave, writeSave, upgradeLevel } from './save.js';
import * as UI from './ui.js';

const WAVE_LEN = 40;
const QUIPS = [
  'The rabbits have unionized.',
  'Death by a thousand nibbles.',
  'You were loved to death. Literally.',
  'Turns out "breed like rabbits" is a threat.',
  'Should have brought a bigger toaster.',
  'The meadow belongs to them now.',
  'Somewhere, a carrot weeps.',
];

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
G.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
G.lowPower = G.touch || (navigator.hardwareConcurrency || 8) <= 4;
if (G.touch) document.body.classList.add('touch');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, G.lowPower ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
G.renderer = renderer;
G.scene = new THREE.Scene();
G.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
G.frame = 0;
G.openChest = openChest;
G.onPlayerDeath = onPlayerDeath;

const camOffset = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  G.camera.aspect = w / h;
  // portrait phones pull the camera back so you can see the horde coming
  const zoom = clamp(0.9 / G.camera.aspect, 1, 1.75);
  camOffset.set(0, 21 * zoom, 14.5 * zoom);
  const camDist = camOffset.length();
  G.scene.fog.near = camDist + 18;
  G.scene.fog.far = camDist + 80;
  G.camera.updateProjectionMatrix();
  // measure how far the visible ground reaches, so spawns happen just off-screen
  G.camera.position.copy(camOffset);
  G.camera.lookAt(0, 0, 0);
  G.camera.updateMatrixWorld();
  let r = 10;
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
    _ray.setFromCamera({ x, y }, G.camera);
    if (_ray.ray.intersectPlane(_ground, _hit)) r = Math.max(r, Math.hypot(_hit.x, _hit.z));
  }
  G.viewR = Math.min(r, 48);
}
addEventListener('resize', resize);

// ---------- boot ----------
loadSave();
setMuted(save.muted);
initWorld();
initFx();
initEnemies();
initPickups();
initWeapons();
G.player = new Player();
computeStats();
initInput(canvas);
resize();

UI.renderHow();
UI.bindButtons({
  play: startRun,
  screen: (id) => {
    if (id === 'menu') toMenu();
    else {
      if (id === 'shop') UI.renderShop(buy);
      UI.show(id);
    }
  },
  mute: () => {
    save.muted = !save.muted;
    setMuted(save.muted);
    writeSave();
    initAudio();
    UI.renderMenu(selectChar);
    document.getElementById('pauseMute').textContent = save.muted ? 'SOUND: OFF' : 'SOUND: ON';
  },
  pause,
  resume,
  quit: () => {
    resume();
    G.player.hp = 0;
    onPlayerDeath(true);
  },
  ult: tryUlt,
  skipWheel,
});

function selectChar(id) {
  initAudio();
  const c = CHARS[id];
  if (!save.unlocked.includes(id)) {
    if (save.gold < c.price) {
      sfx('hurt');
      return;
    }
    save.gold -= c.price;
    save.unlocked.push(id);
    sfx('fanfare');
  }
  save.char = id;
  writeSave();
  G.player.reset(id);
  computeStats();
  UI.renderMenu(selectChar);
}

function buy(id) {
  const cost = shopCost(id);
  if (save.gold < cost || upgradeLevel(id) >= SHOP[id].max) return;
  save.gold -= cost;
  save.upgrades[id] = upgradeLevel(id) + 1;
  writeSave();
  sfx('gold');
  UI.renderShop(buy);
}

// ---------- flow ----------
function resetRun() {
  clearEnemies();
  clearPickups();
  clearWeapons();
  clearFx();
  clearMod();
  G.passives = [];
  G.wave = 1;
  G.waveTime = 0;
  G.runTime = 0;
  G.kills = 0;
  G.born = 0;
  G.remaining = 1_000_000;
  G.ultCharge = 0;
  G.pendingLevels = 0;
  G.goldThisRun = 0;
  G.damageBy = {};
  G.lastMod = null;
  G.hurtFlash = 0;
  G.bornFlash = 0;
  music.boss = false;
  music.intensity = 0;
}

function toMenu() {
  resetRun();
  if (!save.unlocked.includes(save.char)) save.char = 'gardener';
  G.player.reset(save.char);
  computeStats();
  G.state = 'menu';
  UI.hud(false);
  UI.renderMenu(selectChar);
  UI.show('menu');
  const kinds = ['bunny', 'bunny', 'bunny', 'hare', 'chonk', 'jackalope'];
  for (let i = 0; i < 34; i++) {
    const a = rand(0, Math.PI * 2), d = rand(4, 18);
    spawnEnemy(pick(kinds), Math.cos(a) * d, Math.sin(a) * d);
  }
}

function startRun() {
  initAudio();
  startMusic();
  resetRun();
  if (!save.unlocked.includes(save.char)) save.char = 'gardener';
  const c = CHARS[save.char];
  G.player.reset(save.char);
  addWeapon(c.weapon);
  computeStats();
  G.rerolls = 1 + upgradeLevel('reroll') + (c.mods.rerolls || 0);
  save.runs = (save.runs || 0) + 1;
  writeSave();
  G.state = 'playing';
  resetJoystick();
  UI.resetHudCache();
  UI.renderLoadout();
  UI.hud(true);
  UI.show();
  banner('WAVE 1', 'survive the horde');
  G.time = 0;
}

function nextWave() {
  G.wave++;
  G.waveTime = 0;
  music.intensity = Math.min(2, Math.floor(G.wave / 3));
  clearMod();
  G.state = 'wheel';
  UI.show('wheel');
  spinWheel((mod) => {
    applyMod(mod);
    G.state = 'playing';
    UI.show();
    if (G.wave % 5 === 0) spawnBoss();
    else {
      banner(`WAVE ${G.wave}`, `${mod.emoji} ${mod.name}`);
      if (G.wave >= 3 && Math.random() < 0.6) setTimeout(() => G.state === 'playing' && hordeEvent(), 2600);
    }
  });
}

let currentOpts = null;
function openLevelUp() {
  G.state = 'levelup';
  resetJoystick();
  currentOpts = rollOptions();
  sfx('levelup');
  UI.showLevelUp(currentOpts, choose, reroll, G.pendingLevels > 1 ? `LEVEL UP! ×${G.pendingLevels}` : 'LEVEL UP!');
}
function choose(o) {
  if (G.state !== 'levelup') return;
  applyOption(o);
  G.pendingLevels--;
  const p = G.player;
  burst(p.x, 1.4, p.z, 14, [0x59d9ff, 0xffffff, 0xffc83d], 5, 0.3, 0.7, 6);
  UI.renderLoadout();
  if (G.pendingLevels > 0) openLevelUp();
  else {
    G.state = 'playing';
    UI.show();
  }
}
function reroll() {
  if (G.rerolls <= 0) return;
  G.rerolls--;
  currentOpts = rollOptions();
  UI.showLevelUp(currentOpts, choose, reroll);
}

function pause() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  resetJoystick();
  UI.showPause();
}
function resume() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  UI.show();
}

function tryUlt() {
  if (G.state !== 'playing' || G.ultCharge < G.stats.ultCost) return;
  G.ultCharge = 0;
  fireUltimate();
}

let dyingT = 0, won = false;
function onPlayerDeath(gaveUp = false) {
  const p = G.player;
  if (!gaveUp && upgradeLevel('revive') > 0 && !p.revived) {
    p.revived = true;
    p.hp = p.maxHp * 0.6;
    p.invuln = 2.5;
    ring(p.x, p.z, 1, 12, 0.6, 0xffffff, 1);
    burst(p.x, 1, p.z, 30, [0xffffff, 0xffc83d], 10, 0.4, 0.9, 8);
    queryCircle(p.x, p.z, 10, (e) => {
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1;
      damage(e, e.isBoss ? 200 : 9999, 'ult', (dx / d) * 20, (dz / d) * 20, { launch: 10 });
    });
    banner('SPARE LIFE!', 'back on your feet');
    sfx('fanfare');
    return;
  }
  p.dead = true;
  G.state = 'dying';
  dyingT = gaveUp ? 0.2 : 1.8;
  sfx('die');
  resetJoystick();
}

function gameOver() {
  const gold = G.goldThisRun + Math.floor(G.kills / 60) + G.wave * 2;
  save.gold += gold;
  const b = save.best;
  if (G.kills > b.kills) b.kills = G.kills;
  if (G.wave > b.wave) b.wave = G.wave;
  if (G.runTime > b.time) b.time = G.runTime;
  writeSave();
  G.state = 'gameover';
  UI.hud(false);
  UI.showGameOver({ gold, won, quip: pick(QUIPS) });
  won = false;
}

// ---------- keys outside the joystick ----------
addEventListener('keydown', (e) => {
  if (G.state === 'levelup' && /^[1-4]$/.test(e.key)) {
    const o = currentOpts?.[Number(e.key) - 1];
    if (o) choose(o);
  } else if (G.state === 'levelup' && e.key.toLowerCase() === 'r') reroll();
  else if (G.state === 'paused' && (e.key === 'Escape' || e.key.toLowerCase() === 'p')) {
    input.pause = false;
    resume();
  } else if (G.state === 'wheel' && (e.key === ' ' || e.key === 'Enter')) skipWheel();
  else if ((G.state === 'menu' || G.state === 'gameover') && e.key === 'Enter') startRun();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// ---------- main loop ----------
let lastNow = performance.now();
let perfAcc = 0, perfFrames = 0, slowStreak = 0;
const camPos = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  const dt = tick(realDt);
  render(dt, realDt);
}

// One step of game logic. Returns the scaled time step the world moved by.
function tick(realDt) {
  G.frame++;
  let dt = 0;
  const p = G.player;
  if (G.state === 'playing') {
    dt = realDt * G.timeScale;
    G.dt = dt;
    G.time += dt;
    G.runTime += dt;
    G.waveTime += dt;
    readInput();
    if (input.ult) tryUlt();
    if (input.pause) pause();
    input.ult = input.pause = false;
    p.update(dt);
    director(dt);
    updateEnemies(dt);
    updateWeapons(dt);
    updatePickups(dt);
    G.hurtFlash -= realDt;
    G.bornFlash -= realDt;
    if (G.remaining <= 0) {
      won = true;
      onPlayerDeath(true);
    }
    if (G.waveTime >= WAVE_LEN && G.state === 'playing') nextWave();
    if (G.pendingLevels > 0 && G.state === 'playing') openLevelUp();
  } else if (G.state === 'dying') {
    dt = realDt * 0.3;
    G.time += dt;
    updateEnemies(dt);
    dyingT -= realDt;
    if (dyingT <= 0) gameOver();
  } else if (G.state === 'menu' || G.state === 'gameover') {
    dt = realDt;
    G.time += dt;
    if (G.state === 'menu') {
      updateEnemies(dt);
      p.moving = false;
      p.fx = Math.sin(G.time * 0.4);
      p.fz = Math.cos(G.time * 0.4);
      p.animate(dt);
    }
  } else if (G.state === 'wheel') {
    updateWheel(realDt);
  }
  input.ult = input.pause = false;
  return dt;
}

function render(dt, realDt) {
  const p = G.player;
  updateFx(dt, G.state === 'paused' || G.state === 'levelup' ? 0 : realDt);
  updateWorld(realDt);
  drawEnemies();
  drawPlayerShadow(p.x, p.z, 1.3);
  drawPickups();
  drawWeapons();

  // camera: follow the player, orbit lazily on the title screen
  if (G.state === 'menu') {
    const a = G.time * 0.08;
    const r = Math.hypot(camOffset.y, camOffset.z) * 0.85;
    camPos.set(Math.sin(a) * r * 0.7, r * 0.55, Math.cos(a) * r * 0.7);
    camTarget.set(0, 1.5, 0);
    G.camera.position.lerp(camPos, 1 - Math.exp(-3 * realDt));
  } else {
    camTarget.x = damp(camTarget.x, p.x, 8, realDt);
    camTarget.z = damp(camTarget.z, p.z, 8, realDt);
    camTarget.y = 0;
    camPos.copy(camTarget).add(camOffset);
    G.camera.position.lerp(camPos, 1 - Math.exp(-10 * realDt));
  }
  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - realDt * 2.5);
    const s = G.shake * G.shake * 0.8;
    G.camera.position.x += rand(-s, s);
    G.camera.position.y += rand(-s, s);
  }
  G.camera.lookAt(camTarget);
  if (G.mod?.id === 'jelly') G.camera.rotation.z += Math.sin(G.time * 2.2) * 0.02;

  renderer.render(G.scene, G.camera);
  if (G.state === 'playing' || G.state === 'levelup' || G.state === 'wheel' || G.state === 'paused' || G.state === 'dying') UI.updateHud();

  // adaptive resolution: if we keep dropping frames, render fewer pixels
  perfAcc += realDt;
  perfFrames++;
  if (perfAcc > 2) {
    const avg = perfAcc / perfFrames;
    if (avg > 1 / 45 && G.state === 'playing') slowStreak++;
    else slowStreak = 0;
    if (slowStreak >= 2 && pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      resize();
      slowStreak = 0;
    }
    perfAcc = 0;
    perfFrames = 0;
  }
}

// compile every shader up front so the first toast doesn't stutter
renderer.compile(G.scene, G.camera);
toMenu();
document.getElementById('loading').hidden = true;
requestAnimationFrame(frame);

// Hooks for automated play-testing: fast-forward the simulation, auto-picking cards.
window.__omr = {
  G,
  E,
  startRun,
  give(id, level = 5) {
    const w = G.weapons.find((x) => x.id === id) || addWeapon(id);
    w.level = level;
    computeStats();
    UI.renderLoadout();
  },
  levelUp: () => G.pendingLevels++,
  advance(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) {
      if (G.state === 'levelup') choose(currentOpts[0]);
      if (G.state === 'wheel') skipWheel();
      updateFx(tick(step), step);
    }
  },
};
