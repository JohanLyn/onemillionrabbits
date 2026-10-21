// A tiny offline synth. Every sound is rendered once into a Float32Array and then
// played back as a cheap buffer source, so a horde of 500 pops costs 2 nodes each.
export const TAU = Math.PI * 2;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const dec = (t, tau) => Math.exp(-t / tau);
// linear attack, then exponential decay
export const ar = (t, a, tau) => (t < a ? t / a : Math.exp(-(t - a) / tau));
// 0..1..0 hump over `dur`, sharpened or softened by `pow`
export const hump = (t, dur, pow = 1) => (t <= 0 || t >= dur ? 0 : Math.pow(Math.sin((Math.PI * t) / dur), pow));

// Seeded PRNG so every sound bank renders identically.
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

// Band-limited (PolyBLEP) oscillator; call one waveform method per sample.
export class Osc {
  constructor(sr, phase = 0) {
    this.sr = sr;
    this.p = phase;
  }
  adv(f) {
    const dt = Math.min(0.5, Math.abs(f) / this.sr);
    this.p += dt;
    if (this.p >= 1) this.p -= Math.floor(this.p);
    return dt;
  }
  sin(f) {
    this.adv(f);
    return Math.sin(TAU * this.p);
  }
  tri(f) {
    this.adv(f);
    return 4 * Math.abs(this.p - 0.5) - 1;
  }
  saw(f) {
    const dt = this.adv(f);
    return 2 * this.p - 1 - blep(this.p, dt);
  }
  pulse(f, w = 0.5) {
    const dt = this.adv(f), p = this.p;
    return (p < w ? 1 : -1) + blep(p, dt) - blep((p - w + 1) % 1, dt);
  }
}

// Topology-preserving state variable filter: stable under per-sample cutoff sweeps.
export class SVF {
  constructor(sr, fc = 1000, q = 0.707) {
    this.sr = sr;
    this.s1 = this.s2 = 0;
    this.lp = this.bp = this.hp = 0;
    this.set(fc, q);
  }
  set(fc, q = this.q) {
    // sweeps call this every sample: skip the tan() when the cutoff barely moved
    if (q === this.q && Math.abs(fc - this.fc) < this.fc * 0.003) return this;
    this.q = q;
    this.fc = fc;
    const g = Math.tan((Math.PI * Math.min(Math.max(fc, 10), this.sr * 0.45)) / this.sr);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
    return this;
  }
  run(x) {
    const v3 = x - this.s2;
    const v1 = this.a1 * this.s1 + this.a2 * v3;
    const v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
    this.s1 = 2 * v1 - this.s1;
    this.s2 = 2 * v2 - this.s2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

// Render `dur` seconds by calling fn(t, i) per sample, with a short fade at both ends.
export function render(sr, dur, fn) {
  const n = Math.max(1, Math.ceil(sr * dur));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / sr, i);
  const m = Math.min(n >> 1, Math.ceil(sr * 0.004));
  for (let i = 0; i < m; i++) out[n - 1 - i] *= i / m;
  return out;
}

export function normalize(out, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < out.length; i++) m = Math.max(m, Math.abs(out[i]));
  if (m > 0) for (let i = 0; i < out.length; i++) out[i] *= peak / m;
  return out;
}

// Karplus-Strong plucked string (ukulele, muted guitar). `damp` < 1 shortens the ring.
export function pluck(sr, f, dur, { damp = 0.996, bright = 0.6, seed = 7 } = {}) {
  const n = Math.ceil(sr * dur);
  const out = new Float32Array(n);
  const P = sr / f - 0.5; // the two-tap average adds half a sample of delay
  const r = rng(seed);
  const ex = Math.ceil(P);
  const at = (t) => {
    if (t < 0) return 0;
    const j = Math.floor(t), fr = t - j;
    return out[j] * (1 - fr) + out[j + 1] * fr;
  };
  let lp = 0;
  for (let i = 0; i < n; i++) {
    let x = 0;
    if (i < ex) {
      lp += bright * (r() * 2 - 1 - lp);
      x = lp;
    }
    out[i] = x + damp * 0.5 * (at(i - P) + at(i - P - 1));
  }
  return out;
}
