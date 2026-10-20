// Everything you hear is synthesized with WebAudio: no audio files to load.
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let muted = false;
const last = {};

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.32;
  musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.05);
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function tone(type, f0, f1, dur, vol = 0.3, when = 0, bus = sfxBus) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}
function noise(dur, vol, freq, q = 1, type = 'lowpass', when = 0, f1 = freq, bus = sfxBus) {
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (f1 !== freq) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.005, vol, dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

const GAP = { pop: 45, hit: 40, pickup: 35, zap: 60, boom: 70, squeak: 90, laser: 70, buzz: 200, slip: 90, toast: 120, heart: 150, wind: 150, slam: 90, pipes: 300, saber: 160 };

export function sfx(name, p = 1) {
  if (!ctx || muted) return;
  const now = performance.now();
  if (now - (last[name] || 0) < (GAP[name] || 0)) return;
  last[name] = now;
  const r = 0.9 + Math.random() * 0.2;
  switch (name) {
    case 'pop': tone('sine', 700 * r, 180, 0.09, 0.18); break;
    case 'hit': noise(0.05, 0.12, 2400 * r, 1, 'bandpass'); break;
    case 'pickup': tone('sine', 900 * p, 1500 * p, 0.07, 0.12); break;
    case 'squeak': tone('square', 900 * r, 1700 * r, 0.12, 0.08); tone('square', 1700 * r, 1100 * r, 0.08, 0.06, 0.1); break;
    case 'zap': tone('sawtooth', 1800 * r, 120, 0.15, 0.12); noise(0.12, 0.12, 5000, 2, 'highpass'); break;
    case 'laser': tone('square', 1600 * r, 300, 0.1, 0.06); break;
    case 'boom': noise(0.45, 0.5, 900, 1, 'lowpass', 0, 80); tone('sine', 120, 40, 0.35, 0.4); break;
    case 'slam': tone('sine', 160, 35, 0.3, 0.55); noise(0.25, 0.3, 500, 1, 'lowpass', 0, 60); break;
    case 'toast': tone('triangle', 1320, 1320, 0.25, 0.12); tone('triangle', 1980, 1980, 0.3, 0.06, 0.02); break;
    case 'wind': noise(0.5, 0.25, 600, 0.8, 'bandpass', 0, 2500); break;
    case 'buzz': { const o = tone('sawtooth', 220 * r, 240 * r, 0.35, 0.05); o.detune.value = 30; break; }
    case 'slip': tone('sine', 1400 * r, 200, 0.35, 0.12); break;
    case 'heart': tone('sine', 1046, 1046, 0.12, 0.08); tone('sine', 1568, 1568, 0.18, 0.08, 0.09); break;
    case 'pipes': {
      for (const f of [147, 220, 294]) {
        const o = tone('sawtooth', f * r, f * r * 0.98, 0.7, 0.07);
        o.detune.setValueAtTime(0, ctx.currentTime);
        o.detune.linearRampToValueAtTime(60, ctx.currentTime + 0.7);
      }
      break;
    }
    case 'saber': tone('sawtooth', 110, 90, 0.3, 0.05); tone('sine', 220, 180, 0.3, 0.06); break;
    case 'hurt': tone('square', 220, 90, 0.18, 0.14); break;
    case 'levelup': [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.12, 0.08, i * 0.07)); break;
    case 'fanfare': [392, 523, 659, 784, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.2, 0.15, i * 0.1)); break;
    case 'tick': tone('square', 1200, 1200, 0.02, 0.05); break;
    case 'ult': tone('sawtooth', 60, 800, 1.2, 0.2); noise(1.4, 0.3, 200, 1, 'lowpass', 0, 3000); break;
    case 'gold': [1318, 1760, 2637].forEach((f, i) => tone('sine', f, f, 0.15, 0.1, i * 0.05)); break;
    case 'boss': tone('sawtooth', 55, 50, 1.6, 0.25); tone('sawtooth', 82, 78, 1.6, 0.18); break;
    case 'die': [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.97, 0.3, 0.15, i * 0.22)); break;
  }
}

// ---------- music: a tiny step sequencer ----------
const BPM = 128;
const STEP = 60 / BPM / 4;
const PROG = [[45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62], [40, 52, 55, 59]]; // Am F G Em
const BOSS_PROG = [[38, 50, 53, 57], [38, 50, 53, 56], [36, 48, 51, 55], [37, 49, 52, 56]];
const LEAD = [0, -1, 2, -1, 3, -1, 2, 1, 0, -1, 3, -1, 2, -1, 1, -1];
let seqTimer = null, nextT = 0, step = 0;
export const music = { on: false, boss: false, intensity: 0 };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function scheduleStep(t, s) {
  const bar = Math.floor(s / 16) % 4;
  const prog = music.boss ? BOSS_PROG : PROG;
  const chord = prog[bar];
  const i = s % 16;
  const play = (type, f, dur, vol) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  // kick
  if (i % 4 === 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + 0.2);
  }
  // hats
  if (i % 2 === 1 || (music.intensity > 1 && i % 2 === 0)) {
    const sN = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    sN.buffer = noiseBuf;
    f.type = 'highpass';
    f.frequency.value = 7000;
    g.gain.setValueAtTime(i % 4 === 2 ? 0.18 : 0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    sN.connect(f).connect(g).connect(musicBus);
    sN.start(t, Math.random());
    sN.stop(t + 0.05);
  }
  // snare clap
  if (i === 4 || i === 12) {
    const sN = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    sN.buffer = noiseBuf;
    f.type = 'bandpass';
    f.frequency.value = 1800;
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    sN.connect(f).connect(g).connect(musicBus);
    sN.start(t, Math.random());
    sN.stop(t + 0.14);
  }
  // bouncy octave bass
  if (i % 2 === 0) play('square', mtof(chord[0] - 12 + (i % 4 === 2 ? 12 : 0)), STEP * 1.6, 0.12);
  // plucky lead
  if (music.intensity > 0 && LEAD[i] >= 0) play('triangle', mtof(chord[LEAD[i]] + 12), STEP * 1.5, 0.08);
}

export function startMusic() {
  if (!ctx || seqTimer) return;
  music.on = true;
  nextT = ctx.currentTime + 0.1;
  seqTimer = setInterval(() => {
    while (nextT < ctx.currentTime + 0.12) {
      scheduleStep(nextT, step++);
      nextT += STEP;
    }
  }, 30);
}
export function stopMusic() {
  clearInterval(seqTimer);
  seqTimer = null;
  music.on = false;
}
