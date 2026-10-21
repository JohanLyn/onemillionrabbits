import * as THREE from 'three';
import { G, rand, pick } from './core.js';
import { initCamera, resizeCamera, updateCamera } from './camera.js';
import { initWorld, updateWorld } from './world.js';
import { initFx, updateFx, clearFx, banner, burst, ring, levelUpFx } from './fx.js';
import { initEnemies, clearEnemies, updateEnemies, drawEnemies, drawPlayerShadow, director, hordeEvent, spawnBoss, spawnEnemy, queryCircle, damage, E } from './enemies.js';
import { initPickups, clearPickups, updatePickups, drawPickups } from './pickups.js';
import { initWeapons, clearWeapons, updateWeapons, drawWeapons, addWeapon, fireUltimate } from './weapons.js';
import { Player, CHARS } from './player.js';
import { computeStats, rollOptions, applyOption, openChest, SHOP, shopCost } from './upgrades.js';
import { applyMod, clearMod, spinWheel, updateWheel, skipWheel } from './chaos.js';
import { initInput, readInput, input, resetJoystick } from './input.js';
import { initAudio, sfx, setMuted, startMusic, music } from './audio.js';
import { save, loadSave, writeSave, resetSave, upgradeLevel } from './save.js';
import { checkAchievements, observe, resetRunTracking, run, sawMod, firedUlt, setUnlockHandler } from './achievements.js';
import { tip, inlineTip, updateTips, clearTips, dismissTip, skipTips } from './tutorial.js';
import { applySettings, bindSettings, renderSettings, vibrate } from './settings.js';
import { initPwa, whenInstallable, promptInstall, canFullscreen, toggleFullscreen } from './pwa.js';
import * as UI from './ui.js';

const WAVE_LEN = 40;
const COUNTDOWN = 2.1; // seconds of 3-2-1 after unpausing
const VICTORY_BONUS = 250;
const FIRST_WIN_BONUS = 150; // first win with each survivor
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
loadSave();
G.settings = save.settings;
G.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
// quality is read once at boot: every system sizes its buffers from G.lowPower when it initializes
const quality = (G.bootQuality = save.settings.quality);
G.lowPower = quality === 'low' || (quality === 'auto' && (G.touch || (navigator.hardwareConcurrency || 8) <= 4));
if (G.touch) document.body.classList.add('touch');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, quality === 'low' ? 1 : G.lowPower ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
G.renderer = renderer;
G.scene = new THREE.Scene();
initCamera();
G.frame = 0;
G.openChest = openChest;
G.onPlayerDeath = onPlayerDeath;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  resizeCamera(innerWidth, innerHeight);
}
addEventListener('resize', resize);

// ---------- boot ----------
setMuted(save.muted);
applySettings();
initPwa();
initWorld();
initFx();
initEnemies();
initPickups();
initWeapons();
G.player = new Player();
computeStats();
initInput(canvas);
resize();

const $ = (id) => document.getElementById(id);
let settingsFrom = 'menu';
UI.renderHow();
UI.bindButtons({
  play: startRun,
  screen: (id) => {
    if (id === 'menu') {
      if (G.state === 'menu') showMenu();
      else toMenu();
      return;
    }
    if (id === 'shop') UI.renderShop(buy);
    if (id === 'trophies') UI.renderTrophies();
    UI.show(id);
  },
  settings: (from) => {
    settingsFrom = from;
    renderSettings();
    UI.show('settings');
  },
  mute: () => {
    save.muted = !save.muted;
    setMuted(save.muted);
    writeSave();
    initAudio();
    refreshSound();
  },
  pause,
  resume,
  quit: async () => {
    const ok = await UI.confirmBox({ title: 'GIVE UP?', text: 'This run ends here. You keep the golden carrots you earned.', yes: 'GIVE UP', no: 'KEEP GOING', emoji: '🏳️' });
    if (!ok || G.state !== 'paused') return;
    G.state = 'playing';
    quitRun = true;
    onPlayerDeath(true);
  },
  ult: tryUlt,
  skipWheel,
});
bindSettings({
  onChange: refreshSound,
  onReset: async () => {
    const ok = await UI.confirmBox({ title: 'RESET PROGRESS?', text: 'Golden carrots, survivors, Shed upgrades, trophies and best runs all go. This can\'t be undone.', yes: 'WIPE IT', no: 'KEEP IT', emoji: '🧨' });
    if (!ok) return;
    resetSave();
    toMenu();
    banner('FRESH START', 'the rabbits forgot you too');
  },
});
$('settingsBack').dataset.esc = '';
$('settingsBack').onclick = () => (settingsFrom === 'pause' && G.state === 'paused' ? UI.showPause() : showMenu());
$('coachOk').onclick = dismissTip;
$('coachSkip').onclick = skipTips;
$('installBtn').onclick = promptInstall;
whenInstallable((on) => ($('installBtn').hidden = !on));
$('fsBtn').hidden = !(G.touch && canFullscreen());
$('fsBtn').onclick = toggleFullscreen;
setUnlockHandler(UI.trophyToast);

function refreshSound() {
  UI.renderMenu(selectChar);
  $('pauseMute').textContent = save.muted ? 'SOUND: OFF' : 'SOUND: ON';
  if (!$('settings').hidden) renderSettings();
}
function showMenu() {
  UI.renderMenu(selectChar);
  UI.show('menu');
}

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
  checkAchievements();
  UI.renderMenu(selectChar);
}

function buy(id) {
  const cost = shopCost(id);
  if (save.gold < cost || upgradeLevel(id) >= SHOP[id].max) return;
  save.gold -= cost;
  save.upgrades[id] = upgradeLevel(id) + 1;
  writeSave();
  sfx('gold');
  checkAchievements();
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
  won = quitRun = false;
  goT = 0;
  UI.setCountdown('');
  clearTips();
}

function toMenu() {
  resetRun();
  if (!save.unlocked.includes(save.char)) save.char = 'gardener';
  G.player.reset(save.char);
  computeStats();
  G.state = 'menu';
  UI.hud(false);
  showMenu();
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
  goldAtStart = save.gold;
  resetRunTracking();
  G.state = 'playing';
  resetJoystick();
  UI.resetHudCache();
  UI.renderLoadout();
  UI.hud(true);
  UI.show();
  banner('WAVE 1', 'survive the horde');
  G.time = 0;
  tip('move');
  tip('auto');
}

function nextWave() {
  G.wave++;
  G.waveTime = 0;
  music.intensity = Math.min(2, Math.floor(G.wave / 3));
  clearMod();
  G.state = 'wheel';
  UI.show('wheel');
  inlineTip('wheel', $('wheelTip'));
  spinWheel((mod) => {
    sawMod(mod.id);
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
  levelTip();
}
// the fusion tip wins over the how-to-pick tip; a tip stays up for the rest of its level-up chain
let tipChain = false;
function levelTip() {
  const el = $('luTip');
  const fusion = currentOpts.some((o) => o.kind === 'fusion');
  if (fusion && inlineTip('fusion', el)) tipChain = false;
  else if (inlineTip('levelup', el)) tipChain = true;
  else el.hidden = !tipChain;
}
function choose(o) {
  if (G.state !== 'levelup') return;
  applyOption(o);
  G.pendingLevels--;
  const p = G.player;
  levelUpFx(p.x, p.z);
  UI.renderLoadout();
  if (G.pendingLevels > 0) openLevelUp();
  else {
    tipChain = false;
    G.state = 'playing';
    UI.show();
  }
}
function reroll() {
  if (G.rerolls <= 0) return;
  G.rerolls--;
  currentOpts = rollOptions();
  UI.showLevelUp(currentOpts, choose, reroll);
  levelTip();
}

function pause() {
  if (G.state !== 'playing' && G.state !== 'countdown') return;
  G.state = 'paused';
  UI.setCountdown('');
  resetJoystick();
  UI.showPause();
}
// unpausing counts 3-2-1 so you can find the horde again before it finds you
function resume() {
  if (G.state !== 'paused') return;
  G.state = 'countdown';
  countT = COUNTDOWN;
  UI.show();
}

function tryUlt() {
  if (G.state !== 'playing' || G.ultCharge < G.stats.ultCost) return;
  G.ultCharge = 0;
  firedUlt();
  fireUltimate();
}

let dyingT = 0, won = false, quitRun = false, countT = 0, goT = 0, goldAtStart = 0;

// The content code calls this when the final boss falls (and it fires if the counter ever hits zero).
function onVictory() {
  if (G.state !== 'playing') return;
  won = true;
  G.victory = true;
  G.state = 'dying';
  dyingT = 2.4;
  G.player.invuln = 1e9;
  resetJoystick();
  clearTips();
  banner('VICTORY!', 'the meadow is yours');
  sfx('fanfare');
  vibrate([60, 40, 60, 40, 160]);
}
G.onVictory = onVictory;

function onPlayerDeath(gaveUp = false) {
  const p = G.player;
  if (G.state !== 'playing') return;
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
  if (!gaveUp) vibrate(220);
  resetJoystick();
  clearTips();
}

function gameOver() {
  const c = save.char;
  const breakdown = { pickups: G.goldThisRun, kills: Math.floor(G.kills / 60), waves: G.wave * 2 };
  if (won) {
    breakdown.victory = VICTORY_BONUS + (save.winsBy[c] ? 0 : FIRST_WIN_BONUS);
    save.victories = (save.victories || 0) + 1;
    save.winsBy[c] = (save.winsBy[c] || 0) + 1;
  }
  const gold = breakdown.pickups + breakdown.kills + breakdown.waves + (breakdown.victory || 0);
  save.gold += gold;
  // a record only counts once there is an earlier run to beat
  const b = save.best;
  const prev = b.kills > 0 ? { ...b } : null;
  b.kills = Math.max(b.kills, G.kills);
  b.wave = Math.max(b.wave, G.wave);
  b.time = Math.max(b.time, G.runTime);
  b.born = Math.max(b.born || 0, G.born);
  save.life.kills += G.kills;
  checkAchievements();
  breakdown.trophies = run.achGold;
  writeSave();
  const afford = Object.keys(CHARS).filter((id) => !save.unlocked.includes(id) && CHARS[id].price > goldAtStart && CHARS[id].price <= save.gold).map((id) => CHARS[id]);
  const r = { gold: gold + run.achGold, breakdown, prev, quip: pick(QUIPS), quit: quitRun, unlocked: run.unlocked, afford };
  G.state = won ? 'victory' : 'gameover';
  UI.clearToasts();
  UI.hud(false);
  if (won) UI.showVictory(r);
  else UI.showGameOver(r);
  won = quitRun = false;
}

// ---------- keys outside the joystick ----------
// (arrow keys and Escape on menus belong to the menu navigation in ui.js)
addEventListener('keydown', (e) => {
  if (UI.confirmOpen() || e.repeat) return;
  const k = e.key.toLowerCase();
  const onControl = document.activeElement?.matches?.('button, a, input');
  if (G.state === 'levelup' && /^[1-4]$/.test(k)) {
    const o = currentOpts?.[Number(k) - 1];
    if (o) choose(o);
  } else if (G.state === 'levelup' && k === 'r') reroll();
  else if (G.state === 'paused' && k === 'p' && !$('pause').hidden) {
    input.pause = false;
    resume();
  } else if (G.state === 'wheel' && (k === ' ' || k === 'enter')) skipWheel();
  else if (k === 'enter' && !onControl && ((G.state === 'menu' && !$('menu').hidden) || G.state === 'gameover' || G.state === 'victory')) startRun();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
// iOS Safari ignores user-scalable=no, so stop pinch and double-tap zoom by hand
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// ---------- main loop ----------
let lastNow = performance.now();
let perfAcc = 0, perfFrames = 0, slowStreak = 0;

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
    watch(realDt);
    if (G.remaining <= 0) onVictory();
    if (G.waveTime >= WAVE_LEN && G.state === 'playing') nextWave();
    if (G.pendingLevels > 0 && G.state === 'playing') openLevelUp();
  } else if (G.state === 'countdown') {
    countT -= realDt;
    if (countT <= 0) {
      G.state = 'playing';
      goT = 0.6;
    }
  } else if (G.state === 'dying') {
    dt = realDt * 0.3;
    G.time += dt;
    updateEnemies(dt);
    dyingT -= realDt;
    if (dyingT <= 0) gameOver();
  } else if (G.state === 'menu' || G.state === 'gameover' || G.state === 'victory') {
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
  goT -= realDt;
  UI.setCountdown(G.state === 'countdown' ? String(Math.ceil((countT / COUNTDOWN) * 3)) : goT > 0 ? 'GO!' : '');
  return dt;
}

// Reacts to what happened this tick: tips, haptics, trophies.
function watch(realDt) {
  for (const ev of observe()) {
    if (ev === 'hurt') vibrate(25);
    else if (ev === 'bighurt') vibrate(70);
    else if (ev === 'born') tip('breed');
    else if (ev === 'ultready') tip('ult');
    else if (ev === 'golden') tip('golden');
    else if (ev === 'boss') tip('boss');
  }
  if (G.kills >= 3) tip('carrots');
  updateTips(realDt);
  if (G.frame % 15 === 0) checkAchievements();
}

function render(dt, realDt) {
  const p = G.player;
  updateFx(dt, G.state === 'paused' || G.state === 'levelup' ? 0 : realDt);
  updateWorld(realDt);
  drawEnemies();
  drawPlayerShadow(p.x, p.z, 1.3);
  drawPickups();
  drawWeapons();

  updateCamera(realDt);

  renderer.render(G.scene, G.camera);
  if (G.state === 'playing' || G.state === 'countdown' || G.state === 'levelup' || G.state === 'wheel' || G.state === 'paused' || G.state === 'dying') UI.updateHud();

  // adaptive resolution: if we keep dropping frames, render fewer pixels
  perfAcc += realDt;
  perfFrames++;
  if (perfAcc > 2) {
    const avg = perfAcc / perfFrames;
    if (avg > 1 / 45 && G.state === 'playing') slowStreak++;
    else slowStreak = 0;
    if (slowStreak >= 2 && pixelRatio > 1 && quality !== 'high') {
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
  save,
  startRun,
  give(id, level = 5) {
    const w = G.weapons.find((x) => x.id === id) || addWeapon(id);
    w.level = level;
    computeStats();
    UI.renderLoadout();
  },
  levelUp: () => G.pendingLevels++,
  ult: tryUlt,
  win: () => G.onVictory(),
  advance(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) {
      if (G.state === 'levelup') choose(currentOpts[0]);
      if (G.state === 'wheel') skipWheel();
      updateFx(tick(step), step);
    }
  },
};
