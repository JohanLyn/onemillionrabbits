// The soundtrack: songs written in scale degrees, so the same hook can be played in
// F major (the meadow), F harmonic minor (the boss) or bumped up a key for the last chorus.
// The sequencer only decides *what* plays on each 16th step; audio.js turns it into sound.
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const HMINOR = [0, 2, 3, 5, 7, 8, 11];
const semi = (d, sc) => Math.floor(d / 7) * 12 + sc[((d % 7) + 7) % 7];
const fold = (m, lo) => lo + ((((m - lo) % 12) + 12) % 12);

// One bar of melody: "degree/length-in-16ths" tokens, r = rest. Every bar adds up to 16.
const bar = (s) => {
  let at = 0;
  const out = [];
  for (const tok of s.trim().split(/\s+/)) {
    const [d, l] = tok.split('/');
    if (d !== 'r') out.push([at, Number(d), Number(l)]);
    at += Number(l);
  }
  out.len = at;
  return out;
};
const bars = (...s) => s.map(bar);

// Degrees: 0 = F4 (root), 7 = F5. Chords are scale degrees too (0 = I, 4 = V ...),
// and a [a, b] pair splits the bar in two.
const HOOK_A = '2/2 4/2 7/3 6/1 7/2 4/2 2/4';
const HOOK_B = '1/2 4/2 6/3 5/1 6/2 4/2 1/4';
const CHORUS = {
  chords: [0, 4, 5, 3, 0, 4, [3, 4], 0],
  mel: bars(HOOK_A, HOOK_B, '2/2 5/2 7/3 6/1 7/2 5/2 2/2 3/2', '5/1 r/1 5/1 r/1 4/1 r/1 3/2 5/2 4/2 7/4',
    HOOK_A, HOOK_B, '3/2 5/2 7/2 5/2 4/2 6/2 8/2 6/2', '7/4 4/2 2/2 0/4 r/4'),
};
const VERSE = {
  chords: [0, 5, 3, 4, 0, 5, 1, 4],
  mel: bars('0/2 0/1 1/1 2/2 0/2 4/4 r/4', '5/2 4/2 2/2 0/2 2/4 r/4', '3/2 3/1 4/1 5/2 3/2 7/4 r/4', '6/2 5/2 4/2 3/2 1/4 r/4',
    '0/2 0/1 1/1 2/2 0/2 4/4 r/4', '5/2 7/2 6/2 5/2 2/4 r/4', '1/2 3/2 5/2 8/2 7/2 5/2 3/4', '1/2 4/2 6/2 8/2 6/2 4/2 3/2 1/2'),
};
const BREAK = {
  chords: [5, 3, 0, 4, 5, 3, 1, 4],
  mel: bars('2/6 5/2 4/8', '5/8 4/4 3/4', '2/8 4/8', '1/12 r/4', '2/6 5/2 4/8', '5/8 4/4 3/4', '3/8 5/8', '4/8 6/8'),
};
const BUILD = {
  chords: [3, 4],
  mel: bars('3/2 4/2 5/2 7/2 3/2 4/2 5/2 7/2', '4/1 5/1 6/1 8/1 4/1 5/1 6/1 8/1 6/1 7/1 8/1 9/1 8/1 9/1 10/1 11/1'),
};
const MENU = {
  chords: [0, 3, 0, 4, 0, 3, 4, 0],
  mel: bars('4/4 2/2 4/2 7/6 6/2', '5/6 4/2 3/4 5/4', '4/4 2/2 0/2 2/4 4/4', '1/8 4/2 1/2 -1/4',
    '4/4 2/2 4/2 7/6 6/2', '5/4 7/4 5/2 4/2 3/4', '1/2 2/2 3/2 4/2 6/4 5/2 6/2', '7/8 r/8'),
};

// Drum lanes: [drum, pattern, minLevel, maxLevel, fromBar]. x = hit, X = accent, o = soft, g = ghost.
const VEL = { x: 1, X: 1.3, o: 0.6, g: 0.3 };
const DRUMS = {
  intro: [['kick', 'x.......x.......'], ['kick', '..........x.....', 0, 9, 2], ['hat', '..x...x...x...x.', 0, 9, 1], ['clap', '....x.......x...', 0, 9, 2], ['shaker', 'g.g.g.g.g.g.g.g.', 1, 9, 2]],
  verse: [['kick', 'x.......x.x.....'], ['snare', '....x.......x...'], ['hat', '..x...x...x...x.', 0, 0], ['hat', 'x.o.x.o.x.o.x.o.', 1], ['shaker', '.g.g.g.g.g.g.g.g', 2], ['snare', '.......g.......g', 2], ['kick', '..............x.', 3]],
  chorus: [['kick', 'x.......x.x.....', 0, 0], ['kick', 'x...x...x...x...', 1], ['clap', '....x.......x...'], ['snare', '....x.......x...', 1], ['hat', 'x.x.x.x.x.x.x.x.', 0, 1], ['hat', 'x...x...x...x...', 2], ['ohat', '..x...x...x...x.', 2], ['snare', '.g.g..g..g.g..gg', 2], ['cowbell', 'x..x..x...x.x...', 3]],
  break: [['kick', 'x...............'], ['kick', '........x.......', 2], ['clap', '........x.......'], ['shaker', 'o.g.o.g.o.g.o.g.'], ['wbH', '..x.......x.....'], ['wbL', '.....x.......x..']],
  build: [['kick', 'x...x...x...x...']],
  disco: [['kick2', 'x...x...x...x...'], ['clap', '....x.......x...'], ['ohat', '..x...x...x...x.'], ['hat', 'g..gg..gg..gg..g', 1], ['cowbell', '......x.......x.', 2], ['shaker', '.g.g.g.g.g.g.g.g', 3]],
  boss: [['kick', 'x.....x.x.......'], ['snare', '....x.......x...'], ['snare', 'g.gg..g.g.gg..g.'], ['tomL', '..............x.', 1], ['hat', 'x.x.x.x.x.x.x.x.', 1], ['kick', '...x.......x....', 2]],
  bossIntro: [['tomL', 'x.......x.......'], ['tomM', '....x.......x...'], ['tomH', '......x.......x.', 0, 9, 1]],
  bossBridge: [['kick', 'x.......x.......'], ['tomL', '......x.......x.'], ['shaker', 'o.g.o.g.o.g.o.g.'], ['hat', '..x...x...x...x.', 1]],
  menu: [['kick', 'o.......o.......'], ['wbH', '....x.......x...'], ['wbL', '......o.......o.'], ['shaker', 'o.g.o.g.o.g.o.g.']],
};
const FILL = [['snare', '........x.x.x.xx', 0, 0], ['tomH', '........x.x.....', 1], ['tomM', '............xx..', 1], ['tomL', '..............xX', 1]];
const ARP = [0, 1, 2, 1, 3, 2, 1, 2];
const GTR = '.x.x.xx..x.x.xx.';

// Sections. lead: [instrument, octave, minLevel, velocity]; harmony layers turn on at a level.
const NO = 9;
const S = {
  intro: { bars: 4, chords: [0, 3, 0, 4], bass: 'R.......R...R.A.', drums: 'intro', arp: 0, crash: true, fill: true },
  verse: { ...VERSE, bars: 8, lead: [['lead', 0, 0, 1], ['lead', 1, 3, 0.35]], bass: 'R.8.R.8.R.8.5.A.', drums: 'verse', arp: 1, fill: true },
  chorus: { ...CHORUS, bars: 8, lead: [['lead', 0, 0, 1], ['brass', -1, 1, 0.7], ['glock', 1, 2, 0.55]], bass: 'R.5.8.5.R.5.8.A.', drums: 'chorus', arp: 1, stabs: 2, crash: true, fill: true },
  verse2: { ...VERSE, bars: 8, lead: [['brass', 0, 0, 1], ['lead', 1, 2, 0.35]], bass: 'R.8.R.8.R.8.5.A.', drums: 'verse', arp: 0, fill: true, farm: [[3, 14, 'cluck']] },
  chorus2: { ...CHORUS, bars: 8, lead: [['lead', 0, 0, 1], ['brass', -1, 0, 0.75], ['glock', 1, 1, 0.55]], bass: 'R.5.8.5.R.5.8.A.', drums: 'chorus', arp: 1, stabs: 1, crash: true, fill: true },
  break: { ...BREAK, bars: 8, lead: [['whistle', 0, 0, 1], ['glock', 1, 1, 0.5]], bass: 'R.......5.......', bassInst: 'tuba', drums: 'break', strum: '..x...x...x...x.', farm: [[3, 12, 'baa'], [7, 13, 'cluck']], crash: true },
  build: { ...BUILD, bars: 2, lead: [['lead', 0, 0, 0.9], ['brass', -1, 1, 0.7]], bass: 'R.R.R.R.R.R.R.R.', drums: 'build', roll: true, riser: true, arp: NO },
  chorusUp: { ...CHORUS, bars: 8, key: 2, lead: [['lead', 0, 0, 1], ['brass', -1, 0, 0.75], ['glock', 1, 1, 0.6]], bass: 'R.5.8.5.R.5.8.A.', drums: 'chorus', arp: 1, stabs: 1, pad: 2, crash: true, fill: true },
  turn: { bars: 1, chords: [4], bass: 'R...R...R.R.R.A.', drums: 'chorus', fill: true },

  bossIntro: { bars: 2, chords: [0, 4], bass: 'R.R.R.R.R.R.R.R.', drums: 'bossIntro', roll: true, pad: 0, timp: true },
  bossA: { ...CHORUS, bars: 8, lead: [['brass', -1, 0, 1], ['lead', 0, 1, 0.55], ['glock', 1, 2, 0.45]], bass: 'R.RRR.RRR.RRR.RA', drums: 'boss', pad: 0, timp: true, crash: true, fill: true },
  bossB: { ...VERSE, bars: 8, lead: [['lead', 0, 0, 0.9], ['brass', -1, 1, 0.6]], bass: 'R.RRR.RRR.RRR.RA', drums: 'boss', stabs: 1, pad: 0, timp: true, fill: true },
  bossBridge: { bars: 4, chords: [5, 5, 4, 4], bass: 'R.......R.......', bassInst: 'tuba', drums: 'bossBridge', pad: 0, timp: true, riser: true },

  menuA: { ...MENU, bars: 8, lead: [['whistle', 0, 0, 1]], bass: 'R.......5.......', bassInst: 'tuba', drums: 'menu', strum: 'x.x...x...x...x.', farm: [[3, 12, 'baa']] },
  menuB: { ...CHORUS, bars: 8, lead: [['whistle', 0, 0, 0.9], ['glock', 1, 0, 0.4]], bass: 'R.......5.......', bassInst: 'tuba', drums: 'menu', strum: 'x.x...x...x...x.', farm: [[7, 14, 'cluck']] },
};
for (const k in S) S[k].name = k;

export const SONGS = {
  menu: { bpm: 100, swing: 0.55, scale: MAJOR, root: 65, form: [S.menuA, S.menuB], loop: 0 },
  main: { bpm: 128, swing: 0, scale: MAJOR, root: 65, form: [S.intro, S.verse, S.chorus, S.verse2, S.chorus2, S.break, S.build, S.chorusUp, S.turn], loop: 1 },
  boss: { bpm: 140, swing: 0, scale: HMINOR, root: 65, form: [S.bossIntro, S.bossA, S.bossB, S.bossA, S.bossBridge], loop: 1 },
};
export { DRUMS as DRUM_STYLES };

const chordAt = (sec, b, i) => {
  const c = sec.chords[b % sec.chords.length];
  return Array.isArray(c) ? c[i < 8 ? 0 : 1] : c;
};

// Close-position triad in [lo, hi] that moves the least from the previous voicing (smooth voice leading).
function voice(song, key, deg, lo, hi, prev) {
  const pcs = [0, 2, 4].map((k) => (((song.root + key + semi(deg + k, song.scale)) % 12) + 12) % 12);
  let best = null, bestCost = Infinity;
  for (let m = lo; m <= hi; m++) {
    if (!pcs.includes(m % 12)) continue;
    const v = [m];
    while (v.length < 3) {
      let n = v[v.length - 1] + 1;
      while (!pcs.includes(n % 12) || v.some((x) => x % 12 === n % 12)) n++;
      v.push(n);
    }
    if (v[2] > hi) continue;
    const cost = prev ? v.reduce((s, x, k) => s + Math.abs(x - prev[k]), 0) : Math.abs(v[1] - (lo + hi) / 2);
    if (cost < bestCost) {
      bestCost = cost;
      best = v;
    }
  }
  return best;
}

export class Sequencer {
  constructor(name) {
    this.name = name;
    this.song = SONGS[name];
    this.sec = 0;
    this.bar = 0;
    this.step = 0;
    this.loops = 0;
    this.lvl = 0;
    this.target = 0;
    this.vc = {}; // last voicing per layer
  }
  get section() {
    return this.song.form[this.sec];
  }
  jump(secName) {
    const i = this.song.form.findIndex((s) => s.name === secName);
    this.sec = Math.max(0, i);
    this.bar = this.step = 0;
  }
  // Steps until the next beat (0 when the next step is on one).
  toBeat() {
    return (4 - (this.step % 4)) % 4;
  }

  // Emit one 16th step at time t (step length sd). out.note / out.drum make the sound.
  play(t, sd, out, opt = {}) {
    const song = this.song, sec = this.section, i = this.step, b = this.bar;
    if (i === 0 && (b === 0 || this.target > this.lvl)) this.lvl = this.target; // layers rise per bar, fall per section
    const lvl = this.lvl, key = sec.key || 0, sc = song.scale;
    const ch = chordAt(sec, b, i);
    const lastBar = b === sec.bars - 1;
    const filling = sec.fill && lastBar && i >= 8;
    const disco = opt.disco && sec.drums !== 'build' && sec.drums !== 'intro';
    const sw = song.swing * (opt.disco ? 0 : 1);
    t += sw * sd * (i % 4 === 2 ? 1 : i % 2 ? 0.5 : 0);

    // drums
    const lanes = DRUMS[disco ? 'disco' : sec.drums] || [];
    for (const [d, p, mn = 0, mx = 9, from = 0] of lanes) {
      if (lvl < mn || lvl > mx || b < from || p[i] === '.') continue;
      if (filling && d !== 'kick' && d !== 'kick2') continue;
      out.drum(d, t, VEL[p[i]], 'drums');
    }
    if (filling) for (const [d, p, mn, mx = 9] of FILL) if (lvl >= mn && lvl <= mx && p[i] !== '.') out.drum(d, t, VEL[p[i]], 'drums');
    if (sec.crash && b === 0 && i === 0) out.drum('crash', t, 0.8, 'drums');
    if (sec.roll) {
      const k = (b * 16 + i) / (sec.bars * 16);
      if (k < 0.5 ? i % 2 === 0 : true) out.drum('snare', t, 0.18 + 0.75 * k, 'drums');
    }
    if (sec.riser && b === 0 && i === 0) out.drum('riser', t, 0.7, 'drums', 4 / (sec.bars * 16 * sd));
    if (sec.farm && this.loops % 2 === 0) for (const [fb, fi, d] of sec.farm) if (fb === b && fi === i) out.drum(d, t, 1, 'drums');
    if (opt.heart && i % 8 < 3 && i % 8 !== 1) out.drum('thump', t, i % 8 ? 0.6 : 1, 'drums');

    // bass
    const bp = disco ? 'R.8.R.8.R.8.R.8.' : sec.bass;
    const bc = bp && bp[i];
    if (bc && bc !== '.') {
      let n = 1;
      while (i + n < 16 && bp[i + n] === '.') n++;
      const root = fold(song.root + key + semi(ch, sc), 40);
      let m = root;
      if (bc === '8') m = root + 12;
      else if (bc === '5') m = root + semi(ch + 4, sc) - semi(ch, sc);
      else if (bc === 'A') {
        const nx = this.nextChord(b, i);
        const nr = fold(song.root + (nx.key || 0) + semi(nx.ch, sc), 40);
        m = nr - (semi(nx.ch, sc) - semi(nx.ch - 1, sc));
        if (m === root || m === this.lastBass) m = nr + semi(nx.ch + 1, sc) - semi(nx.ch, sc);
      }
      const inst = disco ? 'bass' : sec.bassInst || 'bass';
      out.note(inst, m, t, n * sd * 0.9, bc === 'R' && i % 4 === 0 ? 1 : 0.8, 'bass');
      this.lastBass = m;
    }
    if (sec.timp && (i === 0 || (i === 8 && Array.isArray(sec.chords[b % sec.chords.length])))) {
      out.note('timp', fold(song.root + key + semi(ch, sc), 36), t, sd * 16, i === 0 && b === 0 ? 1 : 0.7, 'drums');
    }

    // melody
    const mel = sec.mel && sec.mel[b];
    if (mel && sec.lead) {
      for (const [s, d, l] of mel) {
        if (s !== i) continue;
        for (const [inst, oct, mn, v] of sec.lead) {
          if (lvl >= mn) out.note(inst, song.root + key + semi(d, sc) + 12 * oct, t, l * sd * 0.92, v, 'lead');
        }
      }
    }

    // harmony layers
    const chordChange = i === 0 || (i === 8 && Array.isArray(sec.chords[b % sec.chords.length]));
    if (lvl >= (sec.arp ?? NO) && i % 2 === 0) {
      const v = (this.vc.arp = voice(song, key, ch, 57, 74, this.vc.arp));
      const notes = [v[0], v[1], v[2], v[0] + 12];
      out.note('blip', notes[ARP[(i / 2) % 8]], t, sd * 1.6, i % 4 === 0 ? 0.8 : 0.55, 'harm');
    }
    if (!disco && lvl >= (sec.stabs ?? NO) && i % 4 === 2) {
      const v = (this.vc.stab = voice(song, key, ch, 55, 70, this.vc.stab));
      for (const m of v) out.note('brass', m, t, sd * 0.9, 0.35, 'harm');
    }
    if ((disco || lvl >= (sec.pad ?? NO)) && chordChange) {
      const v = (this.vc.pad = voice(song, key, ch, 53, 69, this.vc.pad));
      const len = Array.isArray(sec.chords[b % sec.chords.length]) ? 8 : 16;
      for (const m of v) out.note('strings', m, t, len * sd, disco ? 0.5 : 0.4, 'harm');
    }
    if (sec.strum && sec.strum[i] !== '.') {
      const v = (this.vc.strum = voice(song, key, ch, 55, 70, this.vc.strum));
      let n = 1;
      while (i + n < 16 && sec.strum[i + n] === '.') n++;
      v.forEach((m, k) => out.note('pluck', m, t + k * 0.012, n * sd, i % 4 === 0 ? 0.9 : 0.6, 'harm'));
    }
    if (disco && GTR[i] !== '.') {
      const v = (this.vc.gtr = voice(song, key, ch, 62, 77, this.vc.gtr));
      out.note('gtr', v[i % 3], t, sd, 0.5, 'harm');
    }

    // advance
    if (++this.step === 16) {
      this.step = 0;
      if (++this.bar >= sec.bars) {
        this.bar = 0;
        if (++this.sec >= song.form.length) {
          this.sec = song.loop;
          this.loops++;
        }
      }
    }
  }
  nextChord(b, i) {
    const sec = this.section;
    if (i < 8 && Array.isArray(sec.chords[b % sec.chords.length])) return { ch: chordAt(sec, b, 8), key: sec.key };
    if (b + 1 < sec.bars) return { ch: chordAt(sec, b + 1, 0), key: sec.key };
    const n = this.song.form[this.sec + 1] || this.song.form[this.song.loop];
    return { ch: chordAt(n, 0, 0), key: n.key };
  }
}
