// Everything you hear is synthesized at runtime: no audio files to load.
// Sound effects and instruments are rendered once into small buffers (sounds.js), so playing
// one costs two nodes; the music is a step sequencer over those buffers (music.js).
// Bus graph:
//   sfx voices -> 3 panned sub-buses -> sfx --------------------------------\
//   music parts -> duck (dips under big hits) -> muffle (LPF) -> music -> master -> glue comp -> soft clip -> out
//   stingers -> sting -----------------------------------------------------/
import { G } from './core.js';
import { SFX, DRUMS, INST } from './sounds.js';
import { mtof } from './dsp.js';
import { Sequencer } from './music.js';

const MASTER = 0.8, MUSIC = 0.42, SFX_GAIN = 0.9, STING = 0.6;
let ctx = null, offline = false, horde = null;
let master, sfxBus, pans = [], duck, muffle, musicBus, stingBus, parts = {};
let muted = false, stopped = false, vol = { music: 0.7, sfx: 0.8 };
let maxVoices = 28, LOOK = 0.12;

export const music = { on: false, boss: false, intensity: 0, track: null, level: 0 };

// ---------- buffers ----------
const cache = new Map();
const warmQ = [];
const srFor = (hi) => (hi ? ctx.sampleRate : Math.min(ctx.sampleRate, 32000));
function buffer(key, sr, make) {
  let b = cache.get(key);
  if (!b) {
    const data = make(sr);
    b = ctx.createBuffer(1, data.length, sr);
    b.getChannelData(0).set(data);
    cache.set(key, b);
  }
  return b;
}
const sfxBuf = (n, v) => buffer(`s:${n}:${v}`, SFX[n].sr ? Math.min(ctx.sampleRate, SFX[n].sr) : srFor(SFX[n].hi), (sr) => SFX[n].make(v, sr));
const drumBuf = (n) => buffer(`d:${n}`, srFor(DRUMS[n].hi), (sr) => DRUMS[n].make(sr));
const instBuf = (n, m) => buffer(`i:${n}:${m}`, Math.min(ctx.sampleRate, 24000), (sr) => INST[n].make(mtof(m), sr));

// Render a few buffers per scheduler tick so the first rabbit pop never stalls a frame.
function warm(ms) {
  const t0 = performance.now();
  while (warmQ.length && performance.now() - t0 < ms) warmQ.shift()();
}
const STING_NOTES = [['brass', [53, 60, 65, 68, 69, 72, 77]], ['glock', [77, 81, 84, 89, 92, 93, 96, 101]], ['blip', [72, 77, 80, 81, 84, 89]], ['timp', [41]], ['strings', [65, 69, 72]]];
function queueWarm() {
  const first = ['pop', 'hit', 'pickup', 'eep', 'tick', 'hurt'];
  for (const n of [...first, ...Object.keys(SFX).filter((n) => !first.includes(n))]) {
    for (let v = 0; v < SFX[n].n; v++) warmQ.push(() => sfxBuf(n, v));
  }
  // dry-run every song to find the notes it will need
  const need = new Map();
  const rec = {
    note: (inst, m) => need.set(`i:${inst}:${m}`, () => instBuf(inst, m)),
    drum: (d) => need.set(`d:${d}`, () => drumBuf(d)),
  };
  for (const [name, disco] of [['menu', false], ['main', false], ['boss', false], ['main', true]]) {
    for (const lvl of [0, 3]) {
      const s = new Sequencer(name);
      s.target = lvl;
      const steps = s.song.form.reduce((a, x) => a + x.bars * 16, 0);
      for (let i = 0; i < steps; i++) s.play(0, 0.1, rec, { disco, heart: true });
    }
  }
  for (const [inst, ms] of STING_NOTES) for (const m of ms) need.set(`i:${inst}:${m}`, () => instBuf(inst, m));
  warmQ.push(...need.values());
}

// ---------- graph ----------
function softClip() {
  // input is pre-scaled by 0.5, so the curve covers -2..2; unity below 0.75, never above 0.98
  const n = 2048, c = new Float32Array(n), T = 0.75, L = 0.98;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= T ? a : T + (L - T) * Math.tanh((a - T) / (L - T)));
  }
  return c;
}
const gainNode = (v, dest) => {
  const g = ctx.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
};
function panned(p, dest) {
  const g = gainNode(1);
  if (ctx.createStereoPanner) {
    const sp = ctx.createStereoPanner();
    sp.pan.value = p;
    g.connect(sp).connect(dest);
  } else g.connect(dest);
  return g;
}
function build() {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  const pre = gainNode(0.5);
  const clip = ctx.createWaveShaper();
  clip.curve = softClip();
  master = gainNode(muted ? 0 : MASTER);
  master.connect(comp).connect(pre).connect(clip).connect(ctx.destination);
  sfxBus = gainNode(SFX_GAIN * vol.sfx, master);
  pans = [-0.35, 0, 0.35].map((p) => panned(p, sfxBus));
  musicBus = gainNode(MUSIC * vol.music, master);
  muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 18000;
  muffle.Q.value = 0.9;
  muffle.connect(musicBus);
  duck = gainNode(1, muffle);
  parts = { drums: gainNode(1, duck), bass: gainNode(1, duck), lead: panned(0.08, duck), harm: panned(-0.22, duck) };
  stingBus = gainNode(STING * vol.music, master);
}

function attach(c) {
  ctx = c;
  offline = typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext;
  maxVoices = G.lowPower ? 16 : 28;
  LOOK = G.lowPower ? 0.2 : 0.12;
  build();
  queueWarm();
  // read the horde size without a static import cycle (enemies.js imports this file)
  import('./enemies.js').then((m) => (horde = m.E), () => {});
}
const wake = () => {
  try {
    const p = ctx.resume();
    if (p && p.catch) p.catch(() => {});
  } catch {
    // older Safari: resume may throw outside a gesture; the next gesture retries
  }
};
const running = () => offline || ctx.state === 'running';

export function initAudio() {
  if (ctx) {
    if (!offline && !running() && !muted && !document.hidden) wake();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  let c;
  try {
    c = new AC({ latencyHint: 'interactive' });
  } catch {
    try {
      c = new AC();
    } catch {
      return;
    }
  }
  attach(c);
  // iOS only unlocks output after something plays inside a gesture
  const s = ctx.createBufferSource();
  s.buffer = ctx.createBuffer(1, 1, 22050);
  s.connect(ctx.destination);
  s.start(0);
  if (muted) ctx.suspend();
  else wake();
  setInterval(pump, 25);
}

// For tests: drive the engine with an (Offline)AudioContext and call tickAudio() yourself.
export function attachContext(c) {
  attach(c);
  while (warmQ.length) warmQ.shift()();
}
export const tickAudio = () => pump();

if (typeof window !== 'undefined') {
  // any first touch, click or key unlocks audio (and starts the menu theme)
  for (const e of ['pointerdown', 'touchend', 'keydown']) addEventListener(e, () => initAudio(), { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx || offline) return;
    if (document.hidden) ctx.suspend();
    else if (!muted) wake();
  });
}

const musicLevel = () => MUSIC * vol.music * (muffled ? 0.6 : 1);
function ramp(param, v, tau = 0.05, t = ctx.currentTime) {
  param.cancelScheduledValues(t);
  param.setTargetAtTime(v, t, tau);
}
// Settings sliders: 0..1 for each bus.
export function setVolumes(m, s) {
  vol = { music: m, sfx: s };
  if (!ctx) return;
  ramp(musicBus.gain, musicLevel());
  ramp(stingBus.gain, STING * m);
  ramp(sfxBus.gain, SFX_GAIN * s);
}

let muteT = null;
export function setMuted(m) {
  muted = m;
  if (!ctx) return;
  ramp(master.gain, m ? 0 : MASTER, 0.03);
  clearTimeout(muteT);
  if (offline) return;
  // a muted game shouldn't burn battery rendering silence
  if (m) muteT = setTimeout(() => muted && ctx.suspend(), 200);
  else wake();
}

// ---------- sound effects ----------
// vol: level · gap: min ms between plays · max: concurrent voices of this sound ·
// prio: who wins when the voice pool is full · rate: random playback-rate range ·
// pan: spread over the stereo field · duck: how far the music dips under it
const DEF = {
  pop: { vol: 0.42, gap: 30, max: 5, prio: 1, rate: [0.86, 1.2], pan: 1 },
  eep: { vol: 0.17, gap: 400, max: 1, prio: 1, rate: [0.9, 1.15], pan: 1 },
  hit: { vol: 0.28, gap: 35, max: 4, prio: 0, rate: [0.85, 1.2], pan: 1 },
  pickup: { vol: 0.2, gap: 32, max: 3, prio: 2 },
  squeak: { vol: 0.26, gap: 90, max: 2, prio: 1, rate: [0.9, 1.12], pan: 1 },
  zap: { vol: 0.3, gap: 60, max: 2, prio: 1, rate: [0.9, 1.1], pan: 1 },
  laser: { vol: 0.17, gap: 70, max: 3, prio: 1, pan: 1 },
  boom: { vol: 0.62, gap: 70, max: 3, prio: 2, rate: [0.85, 1.15], pan: 1, duck: 0.3 },
  slam: { vol: 0.72, gap: 90, max: 2, prio: 2, rate: [0.9, 1.1], duck: 0.4 },
  toast: { vol: 0.32, gap: 120, max: 2, prio: 1, rate: [0.98, 1.02], pan: 1 },
  wind: { vol: 0.32, gap: 150, max: 2, prio: 1, rate: [0.9, 1.1] },
  buzz: { vol: 0.2, gap: 200, max: 2, prio: 1, rate: [0.92, 1.1], pan: 1 },
  slip: { vol: 0.26, gap: 90, max: 2, prio: 1, rate: [0.9, 1.15], pan: 1 },
  heart: { vol: 0.2, gap: 150, max: 2, prio: 1, pan: 1 },
  pipes: { vol: 0.3, gap: 300, max: 2, prio: 2 },
  saber: { vol: 0.3, gap: 160, max: 2, prio: 1, rate: [0.93, 1.08], pan: 1 },
  hurt: { vol: 0.55, gap: 120, max: 1, prio: 3, rate: [0.95, 1.06], duck: 0.25 },
  tick: { vol: 0.22, gap: 25, max: 2, prio: 2, rate: [0.97, 1.03] },
  ult: { vol: 0.8, gap: 500, max: 1, prio: 4, duck: 0.55, hold: 2 },
  gold: { vol: 0.36, gap: 80, max: 2, prio: 3 },
  boss: { vol: 0.66, gap: 400, max: 1, prio: 4, duck: 0.45, hold: 1 },
  die: { vol: 0.62, gap: 500, max: 1, prio: 4 },
  sparkle: { vol: 0.14, gap: 200, max: 1, prio: 3 },
  levelup: { gap: 150, live: liveLevelUp },
  fanfare: { gap: 250, live: liveFanfare },
};
const lastT = {}, lastV = {}, heat = {};
const voices = []; // live sfx voices: { s, g, end, prio, name }
const COMBO = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

function playBuf(buf, t, gain, rate, dest) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  if (rate !== 1) s.playbackRate.value = rate;
  const g = gainNode(gain, dest);
  s.connect(g);
  s.onended = () => g.disconnect();
  s.start(t);
  return { s, g };
}
// Pool full: fade out the lowest-priority voice if it ranks below the newcomer.
function steal(prio, now) {
  let w = -1;
  for (let i = 0; i < voices.length; i++) if (voices[i].prio < prio && (w < 0 || voices[i].prio < voices[w].prio)) w = i;
  if (w < 0) return false;
  const v = voices.splice(w, 1)[0];
  v.g.gain.setTargetAtTime(0, now, 0.008);
  try {
    v.s.stop(now + 0.05);
  } catch {
    // already stopped
  }
  return true;
}
let duckBusy = 0;
function duckMusic(amount, hold) {
  const now = ctx.currentTime;
  if (now < duckBusy) return;
  duckBusy = now + 0.06;
  const p = duck.gain;
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now);
  else {
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
  }
  p.setTargetAtTime(1 - amount, now, 0.012);
  p.setTargetAtTime(1, now + hold, 0.25);
}

export function sfx(name, p = 1) {
  if (!ctx || muted || !running()) return;
  const d = DEF[name];
  if (!d) return;
  const now = ctx.currentTime, since = now - (lastT[name] ?? -9);
  // density: the more often a sound fires, the rarer and quieter each copy, so a horde never piles up
  let h = (heat[name] || 0) * Math.exp(-since / 0.4);
  if (since < (d.gap / 1000) * Math.min(3, 1 + h / 8)) return;
  if (name === 'die' && G.remaining <= 0) return; // a win gets the victory fanfare instead
  heat[name] = ++h;
  lastT[name] = now;
  if (d.live) return d.live(now);
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) voices.splice(i, 1);
  let same = 0;
  for (const v of voices) if (v.name === name) same++;
  if (same >= d.max) return;
  if (voices.length >= maxVoices && !steal(d.prio, now)) return;
  const n = SFX[name].n;
  let v = Math.floor(Math.random() * n);
  if (n > 1 && v === lastV[name]) v = (v + 1) % n;
  lastV[name] = v;
  const buf = sfxBuf(name, v);
  let rate = d.rate ? d.rate[0] + Math.random() * (d.rate[1] - d.rate[0]) : 1;
  if (name === 'pickup') {
    // combo pickups climb the pentatonic scale instead of sliding out of key
    const st = 12 * Math.log2(Math.max(1, p));
    rate = Math.pow(2, COMBO.reduce((a, b) => (Math.abs(b - st) < Math.abs(a - st) ? b : a)) / 12);
  }
  const { s, g } = playBuf(buf, now, d.vol / Math.sqrt(Math.max(1, h * 0.5)), rate, pans[d.pan ? (Math.random() * 3) | 0 : 1]);
  voices.push({ s, g, end: now + buf.duration / rate, prio: d.prio, name });
  if (d.duck) duckMusic(d.duck, d.hold || 0.15);
  if (name === 'pop' && Math.random() < 0.12 / (1 + h / 6)) sfx('eep');
}

// ---------- instruments (shared by the music and the stingers) ----------
const IVOL = { bass: 0.5, tuba: 0.55, lead: 0.2, brass: 0.21, whistle: 0.24, glock: 0.16, pluck: 0.26, blip: 0.1, gtr: 0.13, strings: 0.075, timp: 0.42 };
const DVOL = { kick: 0.85, kick2: 0.85, snare: 0.42, clap: 0.38, hat: 0.13, ohat: 0.11, crash: 0.2, shaker: 0.12, tomL: 0.45, tomM: 0.42, tomH: 0.4, cowbell: 0.12, wbH: 0.22, wbL: 0.22, baa: 0.3, cluck: 0.22, riser: 0.16, thump: 0.5 };
const held = []; // sustained notes, cut short when the track changes

function note(inst, m, t, dur, vel, dest) {
  const I = INST[inst], buf = instBuf(inst, m);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const g = gainNode(0, dest);
  g.gain.setValueAtTime(vel * IVOL[inst], t);
  const end = t + Math.min(dur, buf.duration);
  if (dur < buf.duration - 0.01) g.gain.setTargetAtTime(0, end, I.rel);
  s.connect(g);
  s.onended = () => g.disconnect();
  s.start(t);
  const stop = Math.min(t + buf.duration, end + I.rel * 6);
  s.stop(stop);
  if (stop - t > 0.6) held.push({ s, g, end: stop });
}
function drum(name, t, vel, dest, rate = 1) {
  playBuf(drumBuf(name), t, vel * DVOL[name], rate, dest);
}
function release(t) {
  for (const h of held) {
    if (h.end <= t) continue;
    h.g.gain.cancelScheduledValues(t);
    h.g.gain.setTargetAtTime(0, t, 0.04);
    try {
      h.s.stop(t + 0.3);
    } catch {
      // already stopped
    }
  }
  held.length = 0;
}
const audible = () => !muted && vol.music > 0.001;
const out = {
  note: (inst, m, t, dur, vel, part) => audible() && note(inst, m, t, dur, vel, parts[part]),
  drum: (d, t, vel, part, rate) => audible() && drum(d, t, vel, parts[part], rate),
};

// ---------- stingers ----------
let seq = null, pending = null, nextT = 0, sd = 0.1, quietUntil = 0;
const lastSting = {};
const minor = () => seq?.name === 'boss';
const nextBeat = () => (seq ? Math.max(nextT + seq.toBeat() * sd, ctx.currentTime + 0.02) : ctx.currentTime + 0.03);
const chordNotes = (t, notes, inst, dur, vel, dest) => notes.forEach((m, i) => note(inst, m, t + i * 0.008, dur, vel, dest));

function liveLevelUp(now) {
  const third = minor() ? 80 : 81;
  [72, 77, third, 84, 89].forEach((m, i) => {
    note('glock', m + 12, now + i * 0.055, 0.5, 0.9, pans[1]);
    note('blip', m, now + i * 0.055, 0.12, 1.4, pans[1]);
  });
  playBuf(sfxBuf('sparkle', 0), now + 0.05, DEF.sparkle.vol, 1, pans[1]);
}
function liveFanfare(now) {
  const third = minor() ? 68 : 69;
  chordNotes(now, [60, 65], 'brass', 0.09, 1.3, pans[1]);
  chordNotes(now + 0.12, [65, third, 72], 'brass', 0.5, 1.3, pans[1]);
  note('glock', 89, now + 0.12, 0.6, 1.2, pans[1]);
}

// Musical cues. Wave starts and boss defeats land on the beat; the run's end is immediate.
// Names: 'wave', 'bossDown', 'gameover', 'victory' (each plays at most once per 2 s).
export function stinger(name) {
  if (!ctx || muted || !running()) return;
  const now = ctx.currentTime;
  if (now - (lastSting[name] ?? -9) < 2) return;
  lastSting[name] = now;
  const B = stingBus;
  if (name === 'wave') {
    const t = Math.max(nextBeat(), now + 0.1);
    [-0.09, -0.06, -0.03].forEach((o, i) => drum('snare', t + o, 0.3 + i * 0.12, B));
    drum('snare', t, 1, B);
    drum('crash', t, 0.9, B);
    drum('kick', t, 1, B);
    chordNotes(t, [53, 60, 65], 'brass', 0.22, 1.1, B);
  } else if (name === 'bossDown') {
    const t = nextBeat();
    drum('crash', t, 1, B);
    for (let i = 0; i < 8; i++) note('timp', 41, t + i * 0.05, 0.4, 0.4 + i * 0.07, B);
    [65, 69, 72, 77, 81, 84].forEach((m, i) => note('glock', m + 12, t + i * 0.06, 0.6, 1, B));
    chordNotes(t + 0.42, [65, 69, 72, 77], 'brass', 0.8, 1.1, B);
    note('timp', 41, t + 0.42, 1.2, 1, B);
  } else if (name === 'gameover') {
    quietUntil = now + 3.8;
    playBuf(sfxBuf('sadtrombone', 0), now + 0.95, 0.75, 1, B);
  } else if (name === 'victory') {
    quietUntil = now + 4.2;
    for (let i = 0; i < 10; i++) drum('snare', now + i * 0.05, 0.25 + i * 0.07, B);
    [0.55, 0.65, 0.75].forEach((o) => note('brass', 60, now + o, 0.08, 1.2, B));
    const t = now + 0.85;
    drum('crash', t, 1, B);
    drum('kick', t, 1, B);
    note('timp', 41, t, 1.3, 1, B);
    chordNotes(t, [53, 65, 69, 72, 77], 'brass', 1.5, 1.1, B);
    [77, 81, 84, 89, 93, 96].forEach((m, i) => note('glock', m, t + 0.1 + i * 0.07, 0.8, 0.9, B));
    chordNotes(t + 0.1, [65, 69, 72], 'strings', 1.8, 1.5, B);
  }
}

// ---------- music scheduling ----------
let muffled = false, prevState = null, prevBoss = null;
const inRun = (s) => s === 'playing' || s === 'levelup' || s === 'wheel' || s === 'paused';

function wanted(st, now) {
  if (stopped || st === 'dying') return null;
  if (st === 'gameover') return now < quietUntil ? null : 'menu';
  if (!inRun(st)) return 'menu';
  return G.boss || music.boss ? 'boss' : 'main';
}
function level() {
  if (!seq || seq.name === 'menu') return 0;
  const n = horde ? horde.length : 0;
  const l = Math.floor((G.wave - 1) / 3) + (n > 90 ? 1 : 0) + (n > 220 ? 1 : 0);
  return Math.max(0, Math.min(3, Math.max(l, music.intensity | 0)));
}
const stepDur = () => 60 / (seq.song.bpm * (seq.name !== 'menu' && G.mod?.id === 'turbo' ? 1.2 : 1)) / 4;

// Read the game state; fire stingers on transitions and decide which track should play.
function poll(now) {
  const st = G.state;
  const m = st === 'paused' || st === 'levelup' || st === 'wheel';
  if (m !== muffled) {
    muffled = m;
    ramp(muffle.frequency, m ? 650 : 18000, m ? 0.08 : 0.2, now);
    ramp(musicBus.gain, musicLevel(), 0.15, now);
  }
  if (st !== prevState) {
    if (prevState === 'wheel' && st === 'playing' && G.wave % 5 !== 0) stinger('wave');
    if (st === 'dying') stinger(G.remaining <= 0 ? 'victory' : 'gameover');
  }
  if (prevBoss && !G.boss && inRun(st) && inRun(prevState)) stinger('bossDown');
  prevState = st;
  prevBoss = G.boss;
  const want = wanted(st, now), cur = seq ? seq.name : null;
  if (want === cur) pending = null;
  else if (!pending || pending.name !== want) pending = { name: want, now: !seq || want === null || cur === 'menu' };
}
function switchTrack(t) {
  const name = pending.name, from = seq ? seq.name : null;
  pending = null;
  release(t);
  if (!name) {
    seq = null;
    music.track = null;
    return;
  }
  seq = new Sequencer(name);
  sd = stepDur();
  nextT = t;
  if (name === 'main' && from === 'boss') {
    seq.jump('chorus'); // come back swinging, after the boss-down fanfare
    stinger('bossDown');
    nextT += 8 * sd;
  } else if (name === 'main' && G.runTime > 3) seq.jump('verse');
  seq.target = seq.lvl = level();
  music.track = name;
}

function pump() {
  if (!ctx) return;
  warm(offline ? 1e9 : 3);
  if (!running()) return;
  const now = ctx.currentTime;
  poll(now);
  for (let i = held.length - 1; i >= 0; i--) if (held[i].end < now) held.splice(i, 1);
  if (!seq) {
    if (pending) switchTrack(now + 0.05);
    if (!seq) return;
  }
  if (nextT < now) nextT = now + 0.02; // the timer was starved (background tab, long frame): skip, don't burst
  const disco = G.mod?.id === 'disco';
  const heart = G.state === 'playing' && G.player && G.player.hp > 0 && G.player.hp < G.player.maxHp * 0.25;
  while (seq && nextT < now + LOOK) {
    if (pending && (pending.now || seq.toBeat() === 0)) {
      switchTrack(nextT);
      continue;
    }
    if (seq.step % 4 === 0) sd = stepDur(); // tempo changes land on the beat
    seq.target = level();
    seq.play(nextT, sd, out, { disco: disco && seq.name === 'main', heart });
    music.level = seq.lvl;
    nextT += sd;
  }
}

export function startMusic() {
  stopped = false;
  music.on = true;
  initAudio();
}
export function stopMusic() {
  stopped = true;
  music.on = false;
  if (ctx && seq) {
    pending = { name: null, now: true };
    switchTrack(ctx.currentTime);
  }
}
