// Count the Horde: a stampede of rabbits hops across the meadow for a couple of seconds, then it's
// gone and you say how many there were. Later rounds ask for just the golden ones or the ones in
// top hats, and the last round doesn't say what to count until it's over. Exact = 2, off by one = 1.
import { C, INK, FONT, lawn, ellipse, circle, rrect, rabbit, carrot, text, star, rand, randi, pick, clamp, ease } from './kit.js';

// q: what to count. n: crowd size. tgt: how many of the counted kind. hare: share of fast hares.
// back: share running right to left. decoy: carrots that tumble along and don't count. T: seconds.
const ROUNDS = [
  { q: 'all', n: [5, 7], tgt: null, hare: 0, back: 0, decoy: 0, T: 2.0, tip: '' },
  { q: 'all', n: [8, 11], tgt: null, hare: 0.25, back: 0, decoy: 2, T: 2.0, tip: "CARROTS DON'T COUNT" },
  { q: 'golden', n: [10, 13], tgt: [3, 5], hare: 0.2, back: 0.15, decoy: 2, T: 2.1, tip: "GOLDEN CARROTS DON'T EITHER" },
  { q: 'hats', n: [12, 15], tgt: [3, 6], hare: 0.2, back: 0.25, decoy: 1, T: 2.2, tip: 'HARES WEAR HATS TOO' },
  { q: 'all', n: [14, 18], tgt: null, hare: 0.3, back: 0.4, decoy: 3, T: 2.3, tip: 'SOME RUN BACKWARDS. RUDE.' },
  { q: 'surprise', n: [14, 17], tgt: [3, 5], hare: 0.25, back: 0.35, decoy: 2, T: 2.4, tip: 'THE QUESTION COMES AFTER' },
];
const ORDER = { all: 'COUNT THE RABBITS!', golden: 'COUNT THE GOLDEN ONES!', hats: 'COUNT THE TOP HATS!', surprise: 'WATCH EVERYTHING!' };
const QUESTION = { all: 'HOW MANY RABBITS?', golden: 'HOW MANY GOLDEN ONES?', hats: 'HOW MANY WORE TOP HATS?' };
const EXACT = ['NAILED IT!', 'RABBIT ACCOUNTANT!', 'EAGLE EYES!', 'BIG BRAIN BUNNY!'];
const UNDER1 = ['ONE SNUCK PAST!', 'ONE WAS HIDING!', 'SO CLOSE!'];
const OVER1 = ['YOU COUNTED ONE TWICE!', 'SO CLOSE!', 'ONE WAS JUST A BUSH'];
const UNDER = ['MORE! SO MANY MORE!', 'THEY MULTIPLY FAST', 'WERE YOU BLINKING?'];
const OVER = ['NOT THAT MANY. CALM DOWN.', 'SEEING DOUBLE?', 'YOU COUNTED THE EARS'];
const SLOW = ['TOO SLOW!', 'STILL COUNTING?'];
const ASK_TIME = 6;
const HOLD = 0.6;

function fit(g, str, maxW, size) {
  g.font = `${size}px ${FONT}`;
  const w = g.measureText(str).width;
  return w > maxW ? (size * maxW) / w : size;
}

// one rabbit (or decoy carrot) in the stampede; positions are recomputed from layout every frame
function makeRunner(R) {
  return { carrot: false, golden: false, hat: false, kind: 'bunny', fur: C.fur, size: 1, lane: 0, dir: R.back && Math.random() < R.back ? -1 : 1, t0: 0, spd: 1, hopF: 3, ph: rand(0, 3), x: 0, y: 0, gy: 0, s: 0, hop: 0 };
}

export default {
  id: 'count',
  name: 'Count the Horde',
  emoji: '🔢',
  blurb: 'One million rabbits. Roughly. Can you be more precise?',
  how: {
    touch: 'Watch the stampede, then tap how many you counted. Exact is 2 points, off by one is 1.',
    keys: 'Watch the stampede, then press 1–4 (or click) for how many you counted. Exact is 2 points, off by one is 1.',
  },
  duration: null,
  stars: [5, 8, 10],
  unit: 'points',
  create(api) {
    const L = { pad: 10, bh: 40, fy0: 0, fy1: 0, s: 20, row: true, btnH: 60, bTop: 0, cntH: 60 };
    const btns = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
    const lineup = { cols: 1, rows: 1, cell: 40, ox: 0, oy: 0 };
    const ro = {}; // reused rabbit() options, so drawing allocates nothing per rabbit
    const results = [];
    const opts = [0, 0, 0, 0];
    let round = -1, R = null, phase = 'lead', t = 0, lead = 1, runT = 2;
    let crowd = [], targets = [], q = 'all', answer = 0;
    let picked = -1, hover = -1, shown = 0, judged = false, pts = 0, line = '', lastTick = 0;

    function layout() {
      const W = api.W, H = api.H, p = (L.pad = clamp(Math.min(W, H) * 0.03, 8, 18));
      L.bh = clamp(H * 0.1, 34, 52);
      L.fy0 = p + L.bh + p + 10;
      L.fy1 = H - p;
      L.s = clamp(Math.min((L.fy1 - L.fy0) / 10, W / 19), 11, 30);
      // answer buttons: one row of four when there's width, else a 2x2 block; always thumb-sized
      L.row = W >= H * 1.1;
      L.btnH = L.row ? clamp(H * 0.2, 56, 92) : clamp(H * 0.12, 64, 96);
      const bw = L.row ? (W - p * 5) / 4 : (W - p * 3) / 2;
      for (let i = 0; i < 4; i++) {
        const b = btns[i], c = L.row ? i : i % 2, r = L.row ? 1 : Math.floor(i / 2);
        b.w = bw;
        b.h = L.btnH;
        b.x = p + c * (bw + p);
        b.y = H - p - 6 - (2 - r) * L.btnH - (1 - r) * p;
      }
      L.bTop = btns[0].y;
      L.cntH = clamp((L.bTop - L.fy0) * 0.3, 54, 110);
      lineupLayout();
    }

    // the police lineup of the rabbits that counted, sized to fit between the counter and the buttons
    function lineupLayout() {
      const n = targets.length;
      if (!n) return;
      const top = L.fy0 + L.cntH, aw = api.W - L.pad * 2, ah = Math.max(20, L.bTop - L.pad - top);
      let best = 0;
      for (let c = 1; c <= n; c++) {
        const cell = Math.min(aw / c, ah / Math.ceil(n / c) / 1.15);
        if (cell > best) {
          best = cell;
          lineup.cols = c;
        }
      }
      lineup.rows = Math.ceil(n / lineup.cols);
      lineup.cell = Math.min(best, 96);
      lineup.ox = (api.W - lineup.cols * lineup.cell) / 2 + lineup.cell / 2;
      lineup.oy = top + (ah - lineup.rows * lineup.cell * 1.15) / 2 + lineup.cell * 0.72;
    }

    function startRound(i) {
      round = i;
      R = ROUNDS[i];
      runT = R.T / (1 + (api.level - 1) * 0.25);
      lead = i === 0 ? 1.05 : 0.6;
      phase = 'lead';
      t = 0;
      picked = hover = -1;
      judged = false;
      targets = [];
      q = R.q;
      const n = randi(R.n[0], R.n[1]);
      crowd = [];
      for (let k = 0; k < n; k++) crowd.push(makeRunner(R));
      // who's golden, who's dressed up: the counted kind first, then a little noise of the other
      const tg = R.tgt ? randi(R.tgt[0], R.tgt[1]) : 0;
      let k = 0;
      if (q === 'golden' || q === 'surprise') for (let j = 0; j < tg; j++) crowd[k++].golden = true;
      if (q === 'hats' || q === 'surprise') for (let j = 0, m = q === 'surprise' ? randi(R.tgt[0], R.tgt[1]) : tg; j < m; j++) crowd[k++].hat = true;
      const extraG = q === 'hats' ? randi(1, 2) : q === 'all' && i > 0 ? randi(0, 2) : 0;
      const extraH = q === 'golden' ? randi(1, 2) : q === 'all' && i > 0 ? randi(0, 2) : 0;
      for (let j = 0; j < extraG && k < n; j++) crowd[k++].golden = true;
      for (let j = 0; j < extraH && k < n; j++) crowd[k++].hat = true;
      for (const r of crowd) {
        if (r.golden) {
          r.kind = 'golden';
          continue;
        }
        const d = Math.random();
        if (d < R.hare) r.kind = 'hare';
        else if (d < R.hare + 0.12) r.kind = 'chonk';
        r.fur = r.kind === 'hare' ? C.hare : r.kind === 'chonk' ? C.grey : Math.random() < 0.2 ? '#e9ddd0' : C.fur;
      }
      for (let j = 0; j < R.decoy; j++) {
        const c = makeRunner(R);
        c.carrot = true;
        c.golden = q === 'golden' && j === 0;
        crowd.push(c);
      }
      for (const r of crowd) {
        const mul = r.kind === 'hare' ? 1.65 : r.kind === 'golden' ? 1.15 : r.kind === 'chonk' ? 0.8 : 1;
        r.size = r.carrot ? 1 : r.kind === 'chonk' ? 1.3 : r.kind === 'hare' ? 0.85 : rand(0.8, 1.1);
        const cross = Math.min(runT * 0.9, (runT * rand(0.5, 0.64)) / mul);
        r.spd = 1 / cross;
        r.t0 = rand(0, runT - cross);
        r.hopF = r.kind === 'hare' ? 4.5 : r.kind === 'chonk' ? 2 : rand(2.6, 3.4);
        r.lane = Math.random();
      }
      // back to front, so the near rabbits overlap the far ones
      crowd.sort((a, b) => a.lane - b.lane);
    }

    function ask() {
      phase = 'ask';
      t = 0;
      lastTick = 0;
      if (q === 'surprise') q = Math.random() < 0.5 ? 'golden' : 'hats';
      targets = crowd.filter((r) => !r.carrot && (q === 'all' || (q === 'golden' ? r.golden : r.hat)));
      answer = targets.length;
      // the right answer plus three nearby wrong ones, in order so the keys read left to right
      const span = answer < 6 ? 2 : answer < 12 ? 3 : 4;
      opts[0] = answer;
      opts[1] = opts[2] = opts[3] = -1;
      for (let m = 1; m < 4; ) {
        const c = answer + randi(-span, span);
        if (c >= 1 && opts.indexOf(c) === -1) opts[m++] = c;
      }
      opts.sort((a, b) => a - b);
      lineupLayout();
      api.sfx('tick');
    }

    function choose(i) {
      if (phase !== 'ask' || t < 0.2) return;
      picked = i;
      phase = 'reveal';
      t = 0;
      shown = 0;
      api.sfx('pop');
    }

    const countDur = () => Math.min(0.6, 0.045 * answer + 0.1);

    function judge() {
      judged = true;
      const v = picked < 0 ? -99 : opts[picked];
      const diff = Math.abs(v - answer);
      pts = diff === 0 ? 2 : diff === 1 ? 1 : 0;
      game.score += pts;
      results[round] = picked < 0 ? 'miss' : pts === 2 ? 'exact' : pts ? 'close' : 'miss';
      line = pick(picked < 0 ? SLOW : pts === 2 ? EXACT : pts ? (v < answer ? UNDER1 : OVER1) : v < answer ? UNDER : OVER);
      const b = btns[picked < 0 ? opts.indexOf(answer) : picked];
      if (pts === 2) {
        api.sfx('gold');
        api.pops.burst(b.x + b.w / 2, b.y + b.h / 2, [C.gold, C.white, C.leaf], 24, 340);
        api.pops.float('+2', api.W / 2, L.fy0 + L.cntH, C.gold, 34);
      } else if (pts === 1) {
        api.sfx('squeak');
        api.pops.burst(b.x + b.w / 2, b.y + b.h / 2, [C.gold, C.white], 10);
        api.pops.float('+1', api.W / 2, L.fy0 + L.cntH, C.white, 30);
      } else {
        api.sfx(picked < 0 ? 'buzz' : 'kazoo');
        api.shake(5);
      }
    }

    function next() {
      if (round >= ROUNDS.length - 1) game.finished = true;
      else startRound(round + 1);
    }

    function place(r, tt) {
      const s = (r.s = L.s * r.size), m = s * 2.8, k = clamp((tt - r.t0) * r.spd, 0, 1);
      const span = api.W + m * 2;
      r.x = r.dir > 0 ? -m + span * k : api.W + m - span * k;
      const top = L.fy0 + s * 1.9, bot = L.fy1 - s * 1.1;
      r.gy = top + r.lane * Math.max(0, bot - top);
      r.hop = Math.abs(Math.sin((tt - r.t0) * r.hopF * Math.PI + r.ph));
      r.y = r.gy - r.hop * s * 0.9;
    }

    function drawRunner(g, r, tt) {
      const s = r.s, d = r.dir, lw = Math.max(2, s * 0.11);
      g.globalAlpha = 0.2;
      ellipse(g, r.x - d * s * 0.4, r.gy + s * 0.95, s * 1.6 * (1 - r.hop * 0.35), s * 0.28, 0, INK, 0);
      g.globalAlpha = 1;
      if (r.carrot) {
        g.save();
        g.translate(r.x, r.y + s * 0.2);
        g.rotate(d * (tt - r.t0) * 9);
        carrot(g, 0, -s * 0.9, s * 1.8, 0, r.golden);
        g.restore();
        return;
      }
      const fur = r.golden ? C.gold : r.fur, lean = d * (r.hop - 0.5) * 0.25;
      // a body stretched out behind the head, a back foot and a cotton tail
      ellipse(g, r.x - d * s * 1.15, r.y + s * 1.0, s * 0.45, s * 0.2, 0, fur, lw);
      ellipse(g, r.x - d * s * 0.8, r.y + s * 0.5, s * 1.0, s * 0.7, -lean, fur, lw);
      circle(g, r.x - d * s * 1.7, r.y + s * 0.3, s * 0.3, C.white, lw);
      ro.fur = r.fur;
      ro.golden = r.golden;
      ro.hat = r.hat;
      ro.rot = lean * 0.6;
      ro.squash = r.hop < 0.2 ? (0.2 - r.hop) * 0.8 : 0;
      ro.mouth = r.kind === 'hare' ? 'o' : 'teeth';
      ro.angry = r.kind !== 'golden';
      ro.blink = 0;
      rabbit(g, r.x + d * s * 0.2, r.y, s, ro);
    }

    function banner(g, str, color) {
      const p = L.pad, h = L.bh, w = Math.min(api.W - p * 2, 640), x = (api.W - w) / 2;
      rrect(g, x, p, w, h, h / 2, 'rgba(43,29,58,0.55)', 0);
      const icon = q === 'golden' || q === 'hats';
      if (icon) {
        ro.fur = C.fur;
        ro.golden = q === 'golden';
        ro.hat = q === 'hats';
        ro.rot = -0.15;
        ro.squash = 0;
        ro.mouth = 'teeth';
        ro.angry = true;
        ro.blink = 0;
        rabbit(g, x + h * 0.62, p + h * 0.66, h * 0.27, ro);
      }
      const ix = icon ? h * 0.5 : 0;
      text(g, str, api.W / 2 + ix / 2, p + h / 2, fit(g, str, w - h * 0.8 - ix, h * 0.6), color);
    }

    function pips(g) {
      const r = clamp(L.bh * 0.12, 4, 6), gap = r * 3.2, y = L.pad + L.bh + 9;
      const x0 = api.W / 2 - (gap * (ROUNDS.length - 1)) / 2;
      for (let i = 0; i < ROUNDS.length; i++) {
        const res = results[i];
        const fill = res === 'exact' ? C.leaf : res === 'close' ? C.gold : res === 'miss' ? C.red : i === round ? C.white : 'rgba(255,253,247,0.35)';
        circle(g, x0 + i * gap, y, i === round && !res ? r * (1.15 + Math.sin(t * 8) * 0.12) : r, fill, 2);
      }
    }

    function drawLead(g) {
      const W = api.W, H = api.H, delay = round === 0 ? 0.45 : 0;
      const k = ease((t - delay) / 0.25);
      if (k <= 0) return;
      const base = Math.min(W * 0.1, H * 0.13, 64) * (0.6 + 0.4 * k);
      const cy = H * 0.5;
      g.globalAlpha = k;
      text(g, round === ROUNDS.length - 1 ? 'FINAL ROUND: SURPRISE QUESTION' : `ROUND ${round + 1} OF ${ROUNDS.length}`, W / 2, cy - base * 1.05, fit(g, 'FINAL ROUND: SURPRISE QUESTION', W * 0.86, base * 0.42), C.paper);
      const str = ORDER[R.q];
      text(g, str, W / 2, cy, fit(g, str, W * 0.9, base), R.q === 'golden' ? C.gold : C.white);
      if (R.tip) text(g, R.tip, W / 2, cy + base * 0.95, fit(g, R.tip, W * 0.86, base * 0.4), C.paper);
      // a sample of what to look for, bouncing above the order
      const s = base * 0.5, y = cy - base * 1.05 - s * 2.4 - Math.abs(Math.sin(t * 7)) * s * 0.3;
      ro.fur = C.fur;
      ro.golden = R.q === 'golden';
      ro.hat = R.q === 'hats';
      ro.rot = Math.sin(t * 6) * 0.12;
      ro.squash = 0;
      ro.mouth = R.q === 'surprise' ? 'o' : 'teeth';
      ro.angry = true;
      ro.blink = 0;
      if (y - s * 2 > L.pad) {
        rabbit(g, W / 2, y, s, ro);
        if (R.q === 'surprise') text(g, '?', W / 2 + s * 1.5, y - s * 0.6, s * 1.3, C.gold);
      }
      g.globalAlpha = 1;
    }

    function drawAsk(g) {
      const W = api.W, top = L.fy0, bot = L.bTop - L.pad, cy = (top + bot) / 2, ah = bot - top;
      // a very confused rabbit and the fuse running down
      const s = clamp(ah * 0.16, 16, 46);
      ro.fur = C.fur;
      ro.golden = q === 'golden';
      ro.hat = q === 'hats';
      ro.rot = Math.sin(t * 3) * 0.15;
      ro.squash = 0;
      ro.mouth = 'o';
      ro.angry = false;
      ro.blink = (t % 2.2) > 2.05 ? 1 : 0;
      const ry = cy - ah * 0.06;
      rabbit(g, W / 2, ry, s, ro);
      // question marks bobbing around (never over) its head
      for (let i = 0; i < 3; i++) {
        const qx = i === 0 ? -1.75 : i === 1 ? 1.55 : 1.95, qy = i === 0 ? -0.4 : i === 1 ? -1.3 : 0.35;
        const bob = Math.sin(t * 5 + i * 2.1) * s * 0.15;
        text(g, '?', W / 2 + qx * s, ry + qy * s + bob, s * (0.7 + i * 0.15), i === 1 ? C.gold : C.white);
      }
      const left = clamp(1 - t / ASK_TIME, 0, 1), fw = Math.min(W * 0.55, 280), fh = clamp(s * 0.32, 10, 16);
      const fx = (W - fw) / 2, fy = ry + s * 1.45;
      rrect(g, fx, fy, fw, fh, fh / 2, 'rgba(43,29,58,0.45)', 3);
      if (left > 0.02) rrect(g, fx, fy, fw * left, fh, fh / 2, left < 0.35 ? C.red : C.carrot, 3);
    }

    function drawReveal(g) {
      const W = api.W, cd = countDur(), n = targets.length;
      const cy = L.fy0 + L.cntH * 0.42;
      const big = clamp(L.cntH * 0.62, 30, 70);
      const pop = shown ? 1 + Math.max(0, 0.25 - (t - ((shown - 1) / n) * cd) * 2) : 1;
      if (!judged) text(g, String(shown), W / 2, cy, big * pop, C.white);
      else {
        const k = ease((t - cd - 0.1) / 0.2);
        const say = pts === 2 ? `${answer}!` : `IT WAS ${answer}!`;
        text(g, say, W / 2, cy - big * 0.12, fit(g, say, W * 0.9, big * 0.9), pts === 2 ? C.gold : C.white);
        const ls = fit(g, line, W * 0.9, big * 0.5) * (0.5 + 0.5 * k);
        text(g, line, W / 2, cy + big * 0.62, ls, pts === 2 ? C.gold : pts ? C.white : '#ffb3a6');
      }
      const s = lineup.cell * 0.32;
      for (let i = 0; i < shown; i++) {
        const r = targets[i], c = i % lineup.cols, row = Math.floor(i / lineup.cols);
        const x = lineup.ox + c * lineup.cell, y = lineup.oy + row * lineup.cell * 1.15;
        const age = t - (i / n) * cd;
        const hop = judged && pts === 2 ? Math.abs(Math.sin(t * 9 + i)) * s * 0.35 : 0;
        ro.fur = r.fur;
        ro.golden = r.golden;
        ro.hat = r.hat;
        ro.rot = judged && !pts ? Math.sin(t * 10 + i) * 0.1 : 0;
        ro.squash = age < 0.12 ? (0.12 - age) * 3 : 0;
        ro.mouth = judged && pts ? 'o' : 'teeth';
        ro.angry = !(judged && pts === 2);
        ro.blink = 0;
        rabbit(g, x, y - hop, s * (r.kind === 'chonk' ? 1.12 : 1), ro);
      }
    }

    function drawButtons(g) {
      const k = phase === 'ask' ? ease(t / 0.22) : 1;
      const off = (1 - k) * (api.H - L.bTop + 10);
      for (let i = 0; i < 4; i++) {
        const b = btns[i], v = opts[i];
        const right = v === answer, mine = i === picked;
        let fill = '#fff4c7', fade = 1;
        if (phase === 'reveal' && judged) {
          if (right) fill = '#8be36b';
          else if (mine) fill = Math.abs(v - answer) === 1 ? C.gold : '#ff8f7a';
          else fade = 0.5;
        } else if (phase === 'reveal' && mine) fill = C.white;
        const lift = phase === 'ask' && i === hover ? 3 : 0;
        const pulse = phase === 'reveal' && judged && right ? 1 + Math.sin(t * 12) * 0.03 : 1;
        const w = b.w * pulse, h = b.h * pulse, x = b.x - (w - b.w) / 2, y = b.y + off - lift - (h - b.h) / 2;
        g.globalAlpha = fade;
        rrect(g, x, y + 6 + lift, w, h, Math.min(18, h * 0.3), INK, 0);
        rrect(g, x, y, w, h, Math.min(18, h * 0.3), fill, 4);
        text(g, String(v), x + w / 2, y + h * 0.52, h * 0.56, right && judged ? C.white : C.carrot);
        if (!api.touch) {
          const r = Math.min(13, h * 0.17);
          circle(g, x + r + 7, y + r + 7, r, C.white, 2);
          text(g, String(i + 1), x + r + 7, y + r + 8, r * 1.3, C.ink, 'center', 0);
        }
        if (judged && right) star(g, x + w - 14, y + 14, Math.min(14, h * 0.18), C.gold, 2.5, t * 2);
        g.globalAlpha = 1;
      }
    }

    function hit(x, y) {
      // generous: anything within half a gap of a button counts
      const m = L.pad * 0.5 + 4;
      for (let i = 0; i < 4; i++) {
        const b = btns[i];
        if (x >= b.x - m && x <= b.x + b.w + m && y >= b.y - m && y <= b.y + b.h + 10 + m) return i;
      }
      return -1;
    }

    function skip() {
      if (phase !== 'reveal') return;
      const cd = countDur();
      if (!judged) {
        t = Math.max(t, cd + 0.1);
        shown = targets.length;
      } else if (t > cd + 0.45) next();
    }

    const game = {
      score: 0,
      finished: false,
      resize: layout,
      update(dt) {
        t += dt;
        if (game.finished) return;
        if (phase === 'lead' && t >= lead) {
          phase = 'run';
          t = 0;
          api.sfx('wind');
        } else if (phase === 'run' && t >= runT + 0.05) ask();
        else if (phase === 'ask') {
          const left = Math.ceil(ASK_TIME - t);
          if (left <= 3 && left > 0 && left !== lastTick) {
            lastTick = left;
            api.sfx('tick');
          }
          if (t >= ASK_TIME) {
            picked = -1;
            phase = 'reveal';
            t = 0;
            shown = 0;
          }
        } else if (phase === 'reveal') {
          const cd = countDur(), n = targets.length;
          const want = Math.min(n, Math.floor((t / cd) * n) + 1);
          if (want > shown) {
            shown = want;
            api.sfx('pickup', 0.8 + Math.min(1.2, shown * 0.06));
          }
          if (!judged && t >= cd + 0.1) judge();
          if (judged && t >= cd + 0.1 + HOLD) next();
        }
      },
      down(x, y) {
        if (phase === 'ask') {
          const i = hit(x, y);
          if (i >= 0) choose(i);
        } else skip();
      },
      move(x, y) {
        if (!api.touch) hover = phase === 'ask' ? hit(x, y) : -1;
      },
      key(k) {
        if (phase === 'ask' && k >= '1' && k <= '4' && k.length === 1) choose(+k - 1);
        else if (k === ' ' || k === 'enter') skip();
      },
      draw(g) {
        lawn(g, api.W, api.H);
        if (phase === 'lead') drawLead(g);
        else if (phase === 'run') {
          for (const r of crowd) {
            if (t < r.t0 || (t - r.t0) * r.spd > 1) continue;
            place(r, t);
            drawRunner(g, r, t);
          }
          banner(g, ORDER[R.q], R.q === 'golden' ? C.gold : C.white);
        } else {
          banner(g, QUESTION[q], q === 'golden' ? C.gold : C.white);
          if (phase === 'ask') drawAsk(g);
          else drawReveal(g);
          drawButtons(g);
        }
        if (phase !== 'lead') pips(g);
      },
    };
    layout();
    startRound(0);
    return game;
  },
};
