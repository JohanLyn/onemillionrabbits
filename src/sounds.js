// Sound recipes: each returns a Float32Array rendered offline (see dsp.js).
// SFX have several variants so repeated sounds never machine-gun the same sample.
import { Osc, SVF, render, normalize, pluck, rng, mtof, dec, ar, hump, TAU } from './dsp.js';

const noiseOf = (seed) => {
  const r = rng(seed);
  return () => r() * 2 - 1;
};
const sat = (x, k) => Math.tanh(x * k) / Math.tanh(k);
// F major pentatonic, used wherever a sound effect has a pitch, so it sits in the music's key
export const PENTA = [77, 79, 81, 84, 86];

// ---------- sound effects: name -> { n: variants, hi: needs full sample rate, sr: fixed rate, make(v, sr) } ----------
export const SFX = {
  // rabbit defeated: a cartoon "plop" (mostly rising, some falling) with a puff of air
  pop: {
    n: 6,
    make(v, sr) {
      const r = rng(11 + v), o = new Osc(sr), nz = noiseOf(31 + v);
      const up = v < 4, f0 = 250 + v * 50 + r() * 30, ratio = up ? 2.3 + r() * 0.9 : 0.42, dur = 0.07 + r() * 0.04;
      const bp = new SVF(sr, 2600 + v * 300, 1.4), lp = new SVF(sr, 900, 0.7);
      return normalize(render(sr, dur + 0.05, (t) => {
        const k = Math.min(1, t / dur);
        const body = o.sin(f0 * Math.pow(ratio, Math.sqrt(k))) * ar(t, 0.002, dur * 0.32);
        const n = nz();
        bp.run(n);
        lp.run(n);
        return body + bp.bp * dec(t, 0.004) * 0.9 + lp.lp * ar(t, 0.004, 0.025) * 0.5;
      }));
    },
  },
  // the occasional tiny rabbit "eep!"
  eep: {
    n: 4,
    make(v, sr) {
      const o = new Osc(sr), o2 = new Osc(sr), f0 = 1150 + v * 140, dur = 0.09 + (v % 2) * 0.04;
      const fm = new SVF(sr, 2500, 2.2);
      return normalize(render(sr, dur + 0.01, (t) => {
        const k = Math.min(1, t / dur);
        const f = f0 * (1 + 0.45 * Math.sin(Math.PI * k * 0.85)) * (1 + 0.035 * Math.sin(TAU * 27 * t));
        const x = o.tri(f) * 0.7 + o2.pulse(f, 0.3) * 0.3;
        fm.run(x);
        return (x * 0.45 + fm.bp * 0.8) * hump(t, dur, 0.55);
      }));
    },
  },
  // weapon connects: a short thwack with a little body
  hit: {
    n: 5,
    make(v, sr) {
      const o = new Osc(sr), o2 = new Osc(sr), nz = noiseOf(51 + v);
      const bp = new SVF(sr, 1500 + v * 320, 1.3);
      return normalize(render(sr, 0.1, (t) => {
        const thump = o.sin(165 * (1 + 1.6 * dec(t, 0.007))) * dec(t, 0.03) * 0.8;
        bp.run(nz());
        const tok = o2.tri(680 + v * 95) * dec(t, 0.014) * 0.3;
        return sat(thump + bp.bp * dec(t, 0.012) * 1.3 + tok, 1.6);
      }));
    },
  },
  // XP carrot: a soft bell blip (pitch is set per combo step at playback)
  pickup: {
    n: 1,
    make(v, sr) {
      const a = new Osc(sr), b = new Osc(sr), c = new Osc(sr), f0 = mtof(77);
      return normalize(render(sr, 0.17, (t) => {
        const f = f0 * (t < 0.012 ? 0.94 + (0.06 * t) / 0.012 : 1);
        return (a.sin(f) + b.sin(2 * f) * 0.25 * dec(t, 0.03) + c.tri(3 * f) * 0.08 * dec(t, 0.02)) * ar(t, 0.002, 0.045);
      }));
    },
  },
  // rubber chicken: a strangled nasal squawk, sometimes a double "eek-eek"
  squeak: {
    n: 4,
    make(v, sr) {
      const r = rng(71 + v), o = new Osc(sr), nz = noiseOf(72 + v);
      const f1 = new SVF(sr, 1750 + v * 120, 3), f2 = new SVF(sr, 3200, 4), br = new SVF(sr, 2600, 1);
      const dur = 0.22 + v * 0.035, f0 = 900 + v * 90 + r() * 40, dbl = v === 3;
      return normalize(render(sr, dur + 0.02, (t) => {
        const k = Math.min(1, t / dur);
        const rise = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) * 0.45;
        const f = f0 * (1 + 0.6 * rise) * (1 + 0.04 * Math.sin(TAU * 23 * t) + 0.01 * Math.sin(TAU * 61 * t));
        const x = o.pulse(f, 0.17);
        f1.run(x);
        f2.run(x);
        br.run(nz());
        let env = hump(t, dur, 0.4);
        if (dbl) env *= Math.pow(Math.abs(Math.sin(TAU * k)), 0.5);
        return (f1.bp * 0.75 + f2.bp * 0.5 + x * 0.12) * env + br.bp * dec(t, 0.02) * 0.25;
      }));
    },
  },
  // thunder plunger: rubbery bonk + falling electric crackle
  zap: {
    n: 3,
    hi: true,
    make(v, sr) {
      const r = rng(81 + v), o = new Osc(sr), g = new Osc(sr), b = new Osc(sr), nz = noiseOf(82 + v);
      const hp = new SVF(sr, 3500, 0.8), dur = 0.22;
      let imp = 0;
      return normalize(render(sr, dur + 0.05, (t) => {
        const k = Math.min(1, t / dur);
        const f = 1900 * Math.pow(120 / 1900, Math.sqrt(k));
        const buzz = o.saw(f) * (g.pulse(70 + v * 22) > 0 ? 1 : 0.35) * ar(t, 0.002, 0.06) * 0.5;
        if (r() < 0.14 * dec(t, 0.08)) imp = nz();
        else imp *= 0.62;
        hp.run(imp);
        const bonk = b.sin(300 * (1 + 0.8 * dec(t, 0.01))) * dec(t, 0.03) * 0.6;
        return sat(buzz + hp.hp * 1.2 * dec(t, 0.1) + bonk, 1.4);
      }));
    },
  },
  // disco ball: "pew" with pulse-width sweep and a slap echo, tuned to the key
  laser: {
    n: 5,
    make(v, sr) {
      const f = mtof(PENTA[v]), dur = 0.13, lp = new SVF(sr, 5500, 0.7);
      const one = new Float32Array(Math.ceil(sr * (dur + 0.3)));
      const o = new Osc(sr);
      for (let i = 0; i < Math.ceil(sr * dur); i++) {
        const t = i / sr, k = t / dur;
        one[i] = lp.run(o.pulse(f * 2 * Math.pow(0.25, Math.pow(k, 0.6)), 0.5 - 0.35 * k)) * ar(t, 0.002, 0.05);
      }
      const out = one.slice();
      const d1 = Math.round(sr * 0.075), d2 = d1 * 2;
      for (let i = 0; i < out.length; i++) out[i] += (i >= d1 ? one[i - d1] * 0.32 : 0) + (i >= d2 ? one[i - d2] * 0.1 : 0);
      return normalize(out);
    },
  },
  // explosions: sub thump + noise blast + debris crackle, driven into a soft clip
  boom: {
    n: 4,
    make(v, sr) {
      const r = rng(91 + v), o = new Osc(sr), nz = noiseOf(92 + v), lp = new SVF(sr, 3000, 0.8), db = new SVF(sr, 1800, 1.5);
      let imp = 0;
      return normalize(render(sr, 0.75, (t) => {
        const sub = o.sin(38 + (100 + v * 12) * dec(t, 0.045 + v * 0.008)) * dec(t, 0.22);
        lp.set(180 + 3600 * dec(t, 0.07 + v * 0.01));
        lp.run(nz());
        if (t > 0.04 && r() < 0.004 * dec(t, 0.25)) imp = 1;
        else imp *= 0.9;
        db.run(imp * nz());
        return sat(sub + lp.lp * ar(t, 0.001, 0.17) * 1.1 + db.bp * 0.5, 1.8);
      }));
    },
  },
  // grandma's slipper / boss landing: a THWACK on top of a deep thud
  slam: {
    n: 3,
    make(v, sr) {
      const o = new Osc(sr), nz = noiseOf(101 + v), bp = new SVF(sr, 1700 + v * 350, 0.9), lp = new SVF(sr, 500, 0.7);
      return normalize(render(sr, 0.6, (t) => {
        const n = nz();
        bp.run(n);
        lp.run(n);
        const thud = o.sin(34 + 95 * dec(t, 0.04)) * dec(t, 0.24);
        return sat(bp.bp * dec(t, 0.016) * 1.6 + thud + lp.lp * ar(t, 0.01, 0.12) * 0.5, 1.5);
      }));
    },
  },
  // toaster: ka-CHUNK, then a ding (or a spring boing) and a whoosh as the toast flies
  toast: {
    n: 3,
    make(v, sr) {
      const o = new Osc(sr), nz = noiseOf(111 + v), ck = new SVF(sr, 750, 1.5), wh = new SVF(sr, 400, 1.2);
      const fb = [1047, 1397, 0][v];
      const P = [1, 2, 2.76, 5.4], A = [1, 0.15, 0.35, 0.12], D = [0.22, 0.1, 0.11, 0.05];
      const bells = P.map(() => new Osc(sr)), sp = new Osc(sr);
      return normalize(render(sr, 0.5, (t) => {
        const n = nz();
        ck.run(n);
        const chunk = ck.bp * dec(t, 0.012) * 1.2 + o.sin(140) * dec(t, 0.02) * 0.5;
        wh.set(400 * Math.pow(6, Math.min(1, t / 0.35)));
        wh.run(n);
        const whoosh = wh.bp * hump(t, 0.38, 1) * 0.35;
        const td = t - 0.035;
        let ding = 0;
        if (td > 0) {
          if (fb) for (let i = 0; i < 4; i++) ding += bells[i].sin(fb * P[i]) * A[i] * dec(td, D[i]);
          else ding = sp.sin(230 * (1 + 0.45 * Math.min(1, td / 0.2)) * (1 + 0.25 * Math.sin(TAU * 15 * td) * dec(td, 0.12))) * dec(td, 0.12);
          ding *= Math.min(1, td / 0.002) * 0.5;
        }
        return chunk + whoosh + ding;
      }));
    },
  },
  // leaf blower: two-stroke putter under a big rising whoosh
  wind: {
    n: 3,
    make(v, sr) {
      const o = new Osc(sr), nz = noiseOf(121 + v), lp = new SVF(sr, 500, 0.9), bp = new SVF(sr, 500, 0.9), dur = 0.6;
      return normalize(render(sr, dur, (t) => {
        const k = t / dur;
        lp.run(o.saw(60 + v * 6) * (0.6 + 0.4 * Math.sin(TAU * (24 + v * 3) * t)));
        bp.set(450 * Math.pow(5.5, k));
        bp.run(nz());
        return lp.lp * 0.45 * hump(t, dur, 0.4) + bp.bp * hump(t, dur, 1.2) * 1.2;
      }));
    },
  },
  // angry bees: a little swarm of detuned, wobbling buzzers
  buzz: {
    n: 4,
    make(v, sr) {
      const r = rng(131 + v), base = 225 + v * 28, dur = 0.5;
      const bees = [1, 1.07, 0.93, 1.13, 0.88].map((m) => ({ o: new Osc(sr, r()), f: base * m, vr: 7 + r() * 6, vp: r() * TAU }));
      const bp = new SVF(sr, 950, 0.9), hp = new SVF(sr, 220, 0.7);
      return normalize(render(sr, dur, (t) => {
        let x = 0;
        for (const b of bees) x += b.o.saw(b.f * (1 + 0.05 * Math.sin(TAU * b.vr * t + b.vp)));
        bp.run(x);
        hp.run(bp.bp);
        return hp.hp * (0.75 + 0.25 * Math.sin(TAU * 41 * t)) * hump(t, dur, 0.7);
      }));
    },
  },
  // banana slip: slide whistle (down, up, up-down, wobbly) ending in a bonk
  slip: {
    n: 4,
    make(v, sr) {
      const o = new Osc(sr), o2 = new Osc(sr), nz = noiseOf(141 + v), br = new SVF(sr, 1000, 6), dur = 0.36;
      const path = [
        (k) => 1400 * Math.pow(0.2, k),
        (k) => 480 * Math.pow(3.4, k),
        (k) => 600 + 900 * Math.sin(Math.PI * k) - 250 * k,
        (k) => 1300 * Math.pow(0.25, k) * (1 + 0.08 * Math.sin(TAU * 9 * k)),
      ][v];
      return normalize(render(sr, dur + 0.1, (t) => {
        let x = 0;
        if (t < dur) {
          const f = path(t / dur) * (1 + 0.02 * Math.sin(TAU * 6 * t));
          br.set(f, 6);
          br.run(nz());
          x = (o.sin(f) * 0.85 + br.bp * 0.5) * hump(t, dur, 0.35);
        }
        const tb = t - dur + 0.02;
        if (tb > 0) x += o2.sin(150 * (1 + dec(tb, 0.01))) * dec(tb, 0.04) * 0.7;
        return x;
      }));
    },
  },
  // kazoo of confusion: a nasal, buzzing "waaah" that bends down, in the music's key
  kazoo: {
    n: 3,
    make(v, sr) {
      const m = [PENTA[0], PENTA[2], PENTA[4]][v] - 12, dur = 0.42;
      const o = new Osc(sr), lfo = new Osc(sr), nz = noiseOf(171 + v);
      const f1 = new SVF(sr, 900, 3), f2 = new SVF(sr, 2400, 4);
      return normalize(render(sr, dur + 0.03, (t) => {
        const k = t / dur;
        const f = mtof(m) * (1 + 0.04 * Math.sin(TAU * 6 * t)) * (k < 0.5 ? 1 : Math.pow(0.8, (k - 0.5) * 2));
        // the membrane rattles: hard-clipped saw plus a dash of noise, through two vowel formants
        const x = sat(o.saw(f) + 0.15 * nz(), 3) * (0.8 + 0.2 * lfo.pulse(f * 0.5));
        f1.run(x);
        f2.run(x);
        return (f1.bp + f2.bp * 0.7) * hump(t, dur, 0.15);
      }));
    },
  },
  // burrower diving: a few crunchy shovelfuls of dirt
  dig: {
    n: 3,
    make(v, sr) {
      const r = rng(181 + v), nz = noiseOf(191 + v), lp = new SVF(sr, 700, 1.2);
      const grains = [0, 0.09, 0.17, 0.27].map((g) => g + r() * 0.03);
      return normalize(render(sr, 0.42, (t) => {
        let env = 0;
        for (const g of grains) if (t > g) env += dec(t - g, 0.03);
        lp.set(500 + 900 * Math.min(1, env), 1.2);
        lp.run(nz());
        return lp.lp * Math.min(1, env) * 1.4;
      }));
    },
  },
  // love is in the air: a cute two-note "boop-bip"
  heart: {
    n: 3,
    make(v, sr) {
      const [m1, m2] = [[84, 89], [81, 86], [89, 93]][v];
      const a = new Osc(sr), b = new Osc(sr);
      return normalize(render(sr, 0.3, (t) => {
        let x = a.sin(mtof(m1)) * ar(t, 0.004, 0.04);
        const t2 = t - 0.08;
        if (t2 > 0) x += (b.sin(mtof(m2)) * (1 + 0.15 * Math.sin(TAU * 9 * t2))) * ar(t2, 0.004, 0.06);
        return x;
      }));
    },
  },
  // bagpipes of doom: drones that wheeze into pitch, a nasal chanter with grace notes,
  // and the bag sagging flat at the end
  pipes: {
    n: 3,
    make(v, sr) {
      const tunes = [
        [[79, 0.03], [77, 0.2], [81, 0.03], [72, 0.17], [79, 0.03], [74, 0.17], [77, 0.3]],
        [[81, 0.03], [72, 0.14], [79, 0.03], [77, 0.14], [81, 0.03], [79, 0.14], [84, 0.03], [81, 0.39]],
        [[84, 0.03], [77, 0.28], [79, 0.03], [75, 0.15], [79, 0.03], [77, 0.41]],
      ][v];
      const dur = tunes.reduce((s, n) => s + n[1], 0) + 0.06;
      const dr = [new Osc(sr), new Osc(sr), new Osc(sr)], ch = new Osc(sr);
      const dlp = new SVF(sr, 1300, 1.3), c1 = new SVF(sr, 1250, 1.6), c2 = new SVF(sr, 2900, 2.2);
      let ni = 0, nt = tunes[0][1];
      return normalize(render(sr, dur + 0.05, (t) => {
        while (ni < tunes.length - 1 && t > nt) nt += tunes[++ni][1];
        const sag = 1 - 0.1 * Math.max(0, (t - dur + 0.14) / 0.14);
        const pf = (1 - 0.14 * dec(t, 0.06)) * sag;
        dlp.run(dr[0].saw(87.31 * pf) + dr[1].saw(174.6 * pf * 1.002) * 0.8 + dr[2].saw(174.6 * pf * 0.997) * 0.6);
        const cx = ch.pulse(mtof(tunes[ni][0] + 0.25) * pf, 0.22); // a quarter-tone sharp: horrific, as advertised
        c1.run(cx);
        c2.run(cx);
        const env = Math.min(1, t / 0.06) * Math.min(1, Math.max(0, dur + 0.04 - t) / 0.1);
        return (dlp.lp * 0.45 + c1.bp * 0.7 + c2.bp * 0.45) * env;
      }));
    },
  },
  // lightsabre swing: beating hum with a doppler swoop and a filter "vwoom"
  saber: {
    n: 4,
    make(v, sr) {
      const dur = 0.45 + v * 0.05, base = 86 + v * 4, dir = v % 2 ? 1 : -1;
      const a = new Osc(sr), b = new Osc(sr), c = new Osc(sr), nz = noiseOf(151 + v);
      const lp = new SVF(sr, 400, 2), sw = new SVF(sr, 1000, 1.5);
      return normalize(render(sr, dur, (t) => {
        const k = t / dur, s = Math.sin(Math.PI * k);
        const f = base * (1 + 0.16 * dir * (1 - 2 * k));
        lp.set(320 + 2600 * s * s);
        lp.run((a.saw(f) + b.saw(f * 1.012) * 0.8 + c.sin(2 * f) * 0.5) * (0.85 + 0.15 * Math.sin(TAU * 34 * t)));
        sw.set(900 + 2600 * s);
        sw.run(nz());
        return (lp.lp + sw.bp * s * s * 0.45) * Math.pow(s, 0.8);
      }));
    },
  },
  // player hurt: a cartoon "oof!" with a thump
  hurt: {
    n: 3,
    make(v, sr) {
      const o = new Osc(sr), th = new Osc(sr), dur = 0.24;
      const f1 = new SVF(sr, 500, 5), f2 = new SVF(sr, 950, 6), lp = new SVF(sr, 700, 0.7);
      return normalize(render(sr, dur + 0.02, (t) => {
        const k = Math.min(1, t / dur);
        const x = o.saw((205 + v * 22) * Math.pow(0.62, k));
        f1.set(480 + 220 * k);
        f2.set(920 + 220 * k);
        f1.run(x);
        f2.run(x);
        lp.run(x);
        const voice = (f1.bp + f2.bp * 0.6 + lp.lp * 0.12) * hump(t, dur, 0.35);
        return voice + th.sin(110 * (1 + dec(t, 0.01))) * dec(t, 0.05) * 0.9;
      }));
    },
  },
  // wheel tick / button click: woodblock tok
  tick: {
    n: 3,
    make(v, sr) {
      const a = new Osc(sr), b = new Osc(sr), nz = noiseOf(161 + v), bp = new SVF(sr, 3000, 1);
      const f = [1200, 1350, 1520][v];
      return normalize(render(sr, 0.07, (t) => {
        bp.run(nz());
        return a.sin(f) * dec(t, 0.017) + b.sin(f * 2.7) * dec(t, 0.007) * 0.3 + bp.bp * dec(t, 0.002) * 0.6;
      }));
    },
  },
  // orbital carrot strike: falling whistles, a sub swell and a long rumble
  ult: {
    n: 1,
    sr: 24000,
    make(v, sr) {
      const ws = [0, 0.11, 0.22, 0.33, 0.45, 0.58].map((d, i) => ({ d, o: new Osc(sr), f: 2300 + i * 180 }));
      const sub = new Osc(sr), imp = new Osc(sr), nz = noiseOf(171), lp = new SVF(sr, 3000, 0.8), rb = new SVF(sr, 220, 0.7);
      const choir = [53, 57, 60, 65].map((m) => ({ o: new Osc(sr), f: mtof(m) }));
      const cl = new SVF(sr, 600, 0.9);
      return normalize(render(sr, 2.6, (t) => {
        let x = 0;
        for (const w of ws) {
          const tt = t - w.d;
          if (tt > 0 && tt < 0.75) x += w.o.sin(w.f * Math.pow(0.28, tt / 0.75) * (1 + 0.015 * Math.sin(TAU * 8 * tt))) * hump(tt, 0.75, 0.5) * 0.16;
        }
        let ch = 0;
        for (const c of choir) ch += c.o.saw(c.f);
        cl.set(500 + 2200 * Math.min(1, t / 0.7));
        cl.run(ch);
        x += cl.lp * 0.1 * Math.min(1, t / 0.6) * (t < 0.7 ? 1 : dec(t - 0.7, 0.5));
        const n = nz();
        if (t < 0.7) x += sub.sin(45) * (t / 0.7) * 0.4;
        else {
          const ti = t - 0.7;
          lp.set(150 + 4000 * dec(ti, 0.12));
          lp.run(n);
          x += lp.lp * dec(ti, 0.45) * 0.9 + imp.sin(30 + 70 * dec(ti, 0.06)) * dec(ti, 0.5);
        }
        rb.run(n);
        x += rb.lp * (t > 0.7 ? dec(t - 0.7, 0.9) : 0) * 1.4;
        return sat(x, 1.5);
      }));
    },
  },
  // golden things: "ka-ching" two-tone coin and a sparkle
  gold: {
    n: 2,
    hi: true,
    make(v, sr) {
      const [m1, m2] = [[84, 89], [81, 86]][v];
      const a = new Osc(sr), b = new Osc(sr), lp = new SVF(sr, 5000, 0.7), r = rng(181 + v);
      const sp = Array.from({ length: 6 }, (_, i) => ({ o: new Osc(sr), f: 3000 + r() * 4000, d: 0.08 + i * 0.04 }));
      return normalize(render(sr, 0.55, (t) => {
        let x = t < 0.075 ? a.pulse(mtof(m1), 0.5) * 0.5 : 0;
        const t2 = t - 0.075;
        if (t2 > 0) x += b.pulse(mtof(m2), 0.5) * 0.5 * ar(t2, 0.002, 0.16);
        lp.run(x);
        let s = 0;
        for (const p of sp) if (t > p.d) s += p.o.sin(p.f) * dec(t - p.d, 0.03) * 0.15;
        return lp.lp + s;
      }));
    },
  },
  // a royal rabbit / horde alarm: minor-second brass cluster swell, war drums and a gong
  boss: {
    n: 1,
    sr: 24000,
    make(v, sr) {
      const br = [43.65, 87.31, 92.5, 130.8].map((f) => ({ o: new Osc(sr), f }));
      const lp = new SVF(sr, 200, 1.2), drums = [new Osc(sr), new Osc(sr)];
      const gong = [1, 1.47, 2.09, 2.56, 3.13].map((m, i) => ({ o: new Osc(sr), f: 98 * m, a: 1 / (i + 1.5) }));
      return normalize(render(sr, 1.9, (t) => {
        let x = 0;
        for (const b of br) x += b.o.saw(b.f * (1 - 0.02 * dec(t, 0.1)));
        lp.set(200 + 1300 * Math.min(1, t / 0.35) * (t > 0.6 ? 0.45 + 0.55 * dec(t - 0.6, 0.4) : 1));
        lp.run(x);
        let y = lp.lp * ar(t, 0.12, 0.9) * 0.5;
        for (let i = 0; i < 2; i++) {
          const tt = t - i * 0.36;
          if (tt > 0) y += drums[i].sin(68 * (1 + 0.6 * dec(tt, 0.02))) * dec(tt, 0.28) * 0.7;
        }
        let g = 0;
        for (const p of gong) g += p.o.sin(p.f) * p.a;
        return sat(y + g * dec(t, 0.8) * (1 + 0.3 * Math.sin(TAU * 4 * t)) * 0.25, 1.3);
      }));
    },
  },
  // player down: BONK, a slide whistle down and a poof
  die: {
    n: 1,
    make(v, sr) {
      const b = new Osc(sr), w = new Osc(sr), nz = noiseOf(191), wb = new SVF(sr, 1100, 3), lp = new SVF(sr, 900, 0.7);
      return normalize(render(sr, 1.1, (t) => {
        const n = nz();
        wb.run(n);
        let x = b.sin(520 * (1 + 0.5 * dec(t, 0.005))) * dec(t, 0.07) + wb.bp * dec(t, 0.01) * 0.6;
        const ts = t - 0.08;
        if (ts > 0 && ts < 0.72) x += w.sin(1200 * Math.pow(0.18, ts / 0.72) * (1 + 0.03 * Math.sin(TAU * 7 * ts))) * hump(ts, 0.72, 0.3) * 0.5;
        const tp = t - 0.82;
        if (tp > 0) {
          lp.run(n);
          x += lp.lp * ar(tp, 0.01, 0.08) * 0.8;
        }
        return x;
      }));
    },
  },
  // level-up shimmer: a rising ripple of glassy grains
  sparkle: {
    n: 1,
    hi: true,
    make(v, sr) {
      const g = Array.from({ length: 12 }, (_, i) => ({ o: new Osc(sr), f: 1400 * Math.pow(2, i / 6), d: i * 0.045 }));
      return normalize(render(sr, 0.9, (t) => {
        let x = 0;
        for (let i = 0; i < g.length; i++) if (t > g[i].d) x += g[i].o.sin(g[i].f) * dec(t - g[i].d, 0.07) * (1 - i / 16);
        return x;
      }));
    },
  },
  // game over: the sad trombone, wah wah wah waaah, with a plunger wobble on the last note
  sadtrombone: {
    n: 1,
    sr: 24000,
    make(v, sr) {
      const notes = [[58, 0, 0.42], [57, 0.42, 0.42], [56, 0.84, 0.42], [55, 1.26, 1.3]];
      const o = new Osc(sr), o2 = new Osc(sr), lp = new SVF(sr, 600, 1.6);
      return normalize(render(sr, 2.7, (t) => {
        let i = notes.length - 1;
        while (i > 0 && t < notes[i][1]) i--;
        const [m, s, d] = notes[i], tn = t - s, last = i === 3;
        const vib = last ? 1 + 0.012 * Math.sin(TAU * 5 * tn) * Math.min(1, tn / 0.3) : 1;
        const f = mtof(m) * (1 - 0.03 * dec(tn, 0.03)) * vib;
        const wah = last ? 0.5 + 0.5 * Math.sin(TAU * 4.2 * tn - Math.PI / 2) : 1 - dec(tn, 0.09);
        lp.set(350 + 1700 * wah);
        lp.run(o.saw(f) + o2.saw(f * 1.004) * 0.6);
        const env = Math.min(1, tn / 0.03) * (last ? Math.min(1, Math.max(0, d - tn) / 0.5) : Math.min(1, Math.max(0, d - tn) / 0.05));
        return lp.lp * env;
      }));
    },
  },
};

// ---------- drum kit: name -> { hi, make(sr) } ----------
const metal = (sr) => [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => ({ o: new Osc(sr, f % 1), f: f * 1.7 }));
function hat(sr, tau, len) {
  const m = metal(sr), nz = noiseOf(201), hp = new SVF(sr, 7500, 0.8), bp = new SVF(sr, 10000, 0.9);
  return normalize(render(sr, len, (t) => {
    let x = 0;
    for (const p of m) x += p.o.pulse(p.f, 0.5);
    bp.run(x * 0.15 + nz() * 0.6);
    hp.run(bp.bp);
    return hp.hp * ar(t, 0.001, tau);
  }));
}
function tom(sr, f) {
  const o = new Osc(sr), nz = noiseOf(211), lp = new SVF(sr, 1500, 0.8);
  return normalize(render(sr, 0.4, (t) => {
    lp.run(nz());
    return o.sin(f * (1 + 0.5 * dec(t, 0.02))) * dec(t, 0.2) + lp.lp * dec(t, 0.02) * 0.4;
  }));
}
function block(sr, f) {
  const a = new Osc(sr), b = new Osc(sr);
  return normalize(render(sr, 0.09, (t) => a.tri(f) * dec(t, 0.025) + b.sin(f * 2.4) * dec(t, 0.01) * 0.4));
}
export const DRUMS = {
  kick: { make: (sr) => kick(sr, 0.17, 0.032) },
  kick2: { make: (sr) => kick(sr, 0.11, 0.022) }, // tighter disco kick
  snare: {
    make(sr) {
      const o = new Osc(sr), nz = noiseOf(221), hp = new SVF(sr, 1800, 0.7), bp = new SVF(sr, 4200, 0.8);
      return normalize(render(sr, 0.28, (t) => {
        const n = nz();
        hp.run(n);
        bp.run(n);
        return o.tri(185 * (1 + 0.3 * dec(t, 0.01))) * dec(t, 0.05) * 0.8 + (hp.hp * 0.6 + bp.bp * 0.7) * ar(t, 0.001, 0.085);
      }));
    },
  },
  clap: {
    make(sr) {
      const nz = noiseOf(231), bp = new SVF(sr, 1150, 1.3);
      return normalize(render(sr, 0.26, (t) => {
        const burst = t < 0.03 ? Math.max(0, 1 - ((t % 0.01) / 0.01) * 1.4) : dec(t - 0.03, 0.07);
        bp.run(nz());
        return bp.bp * burst;
      }));
    },
  },
  hat: { hi: true, make: (sr) => hat(sr, 0.035, 0.09) },
  ohat: { make: (sr) => hat(sr, 0.2, 0.36) },
  crash: { make: (sr) => hat(sr, 0.7, 1.8) },
  shaker: {
    hi: true,
    make(sr) {
      const nz = noiseOf(241), bp = new SVF(sr, 7200, 1.1);
      return normalize(render(sr, 0.09, (t) => {
        bp.run(nz());
        return bp.bp * (t < 0.012 ? t / 0.012 : dec(t - 0.012, 0.03));
      }));
    },
  },
  tomL: { make: (sr) => tom(sr, mtof(41)) },
  tomM: { make: (sr) => tom(sr, mtof(45)) },
  tomH: { make: (sr) => tom(sr, mtof(48)) },
  cowbell: {
    make(sr) {
      const a = new Osc(sr), b = new Osc(sr), bp = new SVF(sr, 2400, 1.2);
      return normalize(render(sr, 0.22, (t) => {
        bp.run(a.pulse(587, 0.5) + b.pulse(845, 0.5));
        return bp.bp * ar(t, 0.001, 0.07);
      }));
    },
  },
  wbH: { make: (sr) => block(sr, 1050) },
  wbL: { make: (sr) => block(sr, 760) },
  // farmyard percussion: a sheep. In the band. Yes.
  baa: {
    make(sr) {
      const o = new Osc(sr), f1 = new SVF(sr, 750, 4), f2 = new SVF(sr, 1250, 5), dur = 0.6;
      return normalize(render(sr, dur, (t) => {
        const x = o.saw(330 * (1 + 0.04 * Math.sin(TAU * 6 * t)) * (1 - 0.06 * t));
        f1.run(x);
        f2.run(x);
        return (f1.bp + f2.bp * 0.7) * (0.6 + 0.4 * Math.sin(TAU * 17 * t)) * hump(t, dur, 0.4);
      }));
    },
  },
  cluck: {
    make(sr) {
      const o = new Osc(sr), f1 = new SVF(sr, 1100, 3);
      return normalize(render(sr, 0.13, (t) => {
        f1.run(o.pulse(620 * (1 + 0.5 * Math.min(1, t / 0.05)), 0.3));
        return f1.bp * hump(t, 0.13, 0.5);
      }));
    },
  },
  // build-up riser, played back faster or slower to fit the bars it covers
  riser: {
    make(sr) {
      const nz = noiseOf(251), bp = new SVF(sr, 300, 1.2), o = new Osc(sr), dur = 4;
      return normalize(render(sr, dur, (t) => {
        const k = t / dur;
        bp.set(300 * Math.pow(26, k));
        bp.run(nz());
        return (bp.bp + o.saw(110 * Math.pow(4, k)) * 0.08) * k * k;
      }));
    },
  },
  // low-health heartbeat
  thump: {
    make(sr) {
      const o = new Osc(sr);
      return normalize(render(sr, 0.2, (t) => o.sin(55 * (1 + 0.4 * dec(t, 0.015))) * ar(t, 0.004, 0.06)));
    },
  },
};
function kick(sr, tau, ptau) {
  const o = new Osc(sr), nz = noiseOf(261), bp = new SVF(sr, 3000, 1);
  return normalize(render(sr, tau * 2.2, (t) => {
    bp.run(nz());
    return sat(o.sin(48 + 120 * dec(t, ptau)) * ar(t, 0.001, tau) + bp.bp * dec(t, 0.003) * 0.5, 1.4);
  }));
}

// ---------- pitched instruments: name -> { len, rel (release time constant), make(f, sr) } ----------
// Sustained instruments are rendered long and cut off with a gain release when the note ends.
export const INST = {
  // chip bass: pulse + sub through a plucky filter (has enough harmonics for phone speakers)
  bass: {
    len: 0.5,
    rel: 0.025,
    make(f, sr) {
      const a = new Osc(sr), b = new Osc(sr), lp = new SVF(sr, 2000, 1.1);
      return normalize(render(sr, 0.5, (t) => {
        lp.set(320 + 2300 * dec(t, 0.06));
        lp.run(a.pulse(f, 0.25) * 0.6 + b.sin(f) * 0.6);
        return sat(lp.lp * ar(t, 0.003, 0.17), 1.2);
      }));
    },
  },
  // oom-pah tuba
  tuba: {
    len: 0.6,
    rel: 0.04,
    make(f, sr) {
      const a = new Osc(sr), b = new Osc(sr), lp = new SVF(sr, 700, 0.8);
      return normalize(render(sr, 0.6, (t) => {
        const ff = f * (1 - 0.02 * dec(t, 0.03));
        lp.set(480 + 520 * dec(t, 0.06));
        lp.run(a.sin(ff) * 0.8 + b.saw(ff) * 0.4);
        return lp.lp * ar(t, 0.012, 0.26);
      }));
    },
  },
  // the main chiptune lead: square with gentle PWM and delayed vibrato
  lead: {
    len: 1.1,
    rel: 0.05,
    make(f, sr) {
      const o = new Osc(sr), lp = new SVF(sr, 4200, 0.7);
      return normalize(render(sr, 1.1, (t) => {
        const vib = t > 0.14 ? 1 + 0.007 * Math.sin(TAU * 5.5 * t) * Math.min(1, (t - 0.14) / 0.2) : 1;
        lp.run(o.pulse(f * vib, 0.5 - 0.12 * Math.sin(TAU * 2.3 * t)));
        return lp.lp * (t < 0.004 ? t / 0.004 : 0.62 + 0.38 * dec(t, 0.08));
      }));
    },
  },
  // marching-band trumpet: pitch scoop, brassy filter blat, vibrato
  brass: {
    len: 1.1,
    rel: 0.05,
    make(f, sr) {
      const o = new Osc(sr), o2 = new Osc(sr), lp = new SVF(sr, 600, 1.3);
      return normalize(render(sr, 1.1, (t) => {
        const vib = t > 0.2 ? 1 + 0.006 * Math.sin(TAU * 5.2 * t) * Math.min(1, (t - 0.2) / 0.25) : 1;
        const ff = f * (1 - 0.025 * dec(t, 0.025)) * vib;
        lp.set(Math.min(500 + f * 3, 1400) + 2600 * (1 - dec(t, 0.012)) * (0.45 + 0.55 * dec(t, 0.15)));
        lp.run(o.saw(ff) + o2.saw(ff * 1.003) * 0.5);
        return sat(lp.lp, 1.3) * (t < 0.015 ? t / 0.015 : 0.75 + 0.25 * dec(t, 0.1));
      }));
    },
  },
  // breathy pastoral whistle (menu tune and the breakdown)
  whistle: {
    len: 1.1,
    rel: 0.06,
    make(f, sr) {
      const o = new Osc(sr), o2 = new Osc(sr), nz = noiseOf(271), br = new SVF(sr, f, 9);
      return normalize(render(sr, 1.1, (t) => {
        const vib = 1 + 0.01 * Math.sin(TAU * 5.2 * t) * Math.min(1, t / 0.25);
        const ff = f * vib * (1 - 0.02 * dec(t, 0.02));
        br.run(nz());
        return (o.sin(ff) + o2.sin(2 * ff) * 0.1 + br.bp * 0.35) * (t < 0.03 ? t / 0.03 : 0.8 + 0.2 * dec(t, 0.15));
      }));
    },
  },
  glock: {
    len: 1.0,
    rel: 0.2,
    make(f, sr) {
      const P = [1, 2.76, 5.4], A = [1, 0.3, 0.12], D = [0.45, 0.16, 0.06];
      const os = P.map(() => new Osc(sr));
      return normalize(render(sr, 1.0, (t) => {
        let x = 0;
        for (let i = 0; i < 3; i++) if (f * P[i] < sr * 0.45) x += os[i].sin(f * P[i]) * A[i] * dec(t, D[i]);
        return x * Math.min(1, t / 0.001);
      }));
    },
  },
  // ukulele
  pluck: {
    len: 0.8,
    rel: 0.12,
    make(f, sr) {
      const s = pluck(sr, f, 0.8, { damp: 0.995, bright: 0.55 });
      const lp = new SVF(sr, 3500, 0.7);
      return normalize(s.map((x) => lp.run(x)));
    },
  },
  // short chip arpeggio blip
  blip: {
    len: 0.2,
    rel: 0.03,
    make(f, sr) {
      const o = new Osc(sr), lp = new SVF(sr, 5000, 0.7);
      return normalize(render(sr, 0.2, (t) => lp.run(o.pulse(f, 0.25)) * ar(t, 0.002, 0.05)));
    },
  },
  // disco chicken-scratch guitar
  gtr: {
    len: 0.18,
    rel: 0.02,
    make(f, sr) {
      const s = pluck(sr, f, 0.18, { damp: 0.97, bright: 0.9, seed: 9 });
      const bp = new SVF(sr, 1400, 1.2);
      return normalize(s.map((x, i) => {
        bp.set(900 + 1600 * dec(i / sr, 0.04)).run(x);
        return bp.bp;
      }));
    },
  },
  // disco strings / boss organ pad
  strings: {
    len: 2.2,
    rel: 0.12,
    make(f, sr) {
      const os = [0.996, 1, 1.004].map((m, i) => ({ o: new Osc(sr, i / 3), m }));
      const lp = new SVF(sr, Math.min(2400, f * 8), 0.7);
      return normalize(render(sr, 2.2, (t) => {
        const vib = 1 + 0.003 * Math.sin(TAU * 5 * t);
        let x = 0;
        for (const s of os) x += s.o.saw(f * s.m * vib);
        return lp.run(x) * Math.min(1, t / 0.09);
      }));
    },
  },
  // tuned timpani for the boss
  timp: {
    len: 1.3,
    rel: 0.15,
    make(f, sr) {
      const P = [1, 1.5, 1.98, 2.44], A = [1, 0.5, 0.3, 0.15];
      const os = P.map(() => new Osc(sr)), nz = noiseOf(281), lp = new SVF(sr, 900, 0.8);
      return normalize(render(sr, 1.3, (t) => {
        let x = 0;
        for (let i = 0; i < 4; i++) x += os[i].sin(f * P[i] * (1 + 0.04 * dec(t, 0.03))) * A[i] * dec(t, 0.5 / (i + 1));
        lp.run(nz());
        return x + lp.lp * dec(t, 0.015) * 0.6;
      }));
    },
  },
};
