// Hat Trick: a magician bunny hides the golden carrot under a top hat and shuffles. Find it.
// Rounds get faster, a fourth and a fifth hat join in, and later he cheats with decoy wobbles.
// A bomb bunny lives under every other hat, so one wrong pick ends the show.
import { C, FONT, lawn, ellipse, circle, rrect, rabbit, carrot, text, star, randi, pick, clamp, ease } from './kit.js';

const ROUNDS = 10;
// per round: hats on the table, swaps, seconds per swap, decoy wobbles, chance a swap is a double
const PLAN = [
  [3, 3, 0.42, 0, 0],
  [3, 4, 0.38, 0, 0],
  [3, 4, 0.34, 0, 0],
  [4, 4, 0.34, 0, 0],
  [4, 5, 0.3, 1, 0],
  [4, 5, 0.28, 1, 0.2],
  [5, 5, 0.28, 1, 0.25],
  [5, 6, 0.25, 2, 0.3],
  [5, 6, 0.23, 2, 0.35],
  [5, 7, 0.21, 2, 0.4],
];
const HAT = '#3d3356', HAT_HI = '#5a4d80', HAT_TOP = '#4a3f68';
const CLOTH = '#7a45d6', CLOTH_DARK = '#5e31b0';
const LABELS = '12345';
const LIFT_SPEED = 6; // hats go up and down in about a sixth of a second
const WIN_QUIPS = ['HOW?!', 'Lucky guess.', 'Hmph.', 'Rigged!', 'Impossible!', 'Beginner\'s luck.', 'Grr.'];
const LOSE_QUIPS = ['HA HA HA!', 'Gotcha!', 'Bomb bunny!', 'Classic.', 'Nope!'];
const DECOY_QUIPS = ['Ooh, that one?', 'Psst... there!', 'Did it wiggle?'];

const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
// draw order: hats sliding behind first, hats swooping in front last
const byDepth = (a, b) => a.dy - b.dy;

export default {
  id: 'hats',
  name: 'Hat Trick',
  emoji: '🎩',
  blurb: 'Keep your eye on the golden carrot. The magician is a cheat.',
  how: {
    touch: 'Watch the hat with the golden carrot, then tap it when the shuffling stops.',
    keys: 'Watch the carrot\'s hat, then press its number (1–5 from the left) or click it.',
  },
  duration: null,
  stars: [3, 6, 10],
  unit: 'carrots',
  create(api) {
    const hats = [];
    const order = [];
    const moves = [];
    let n = 3, round = 1, phase = 'show', pt = 0, mi = 0, mt = 0, elapsed = 0;
    let goldHat = null, picked = null, hover = -1, waited = false, fx = 0;
    let say = '', sayT = 0, mood = 'smug', moodT = 0, wandA = -0.9, roundLabel = '';
    // layout, recomputed on resize: L holds the current hat size and spacing
    const L = { hw: 0, sp: 0, tableY: 0, tableW: 0, skirt: 0, s: 0, cx: 0, magY: 0, fs: 16 };
    const M3 = { hw: 0, sp: 0 }, M4 = { hw: 0, sp: 0 }, M5 = { hw: 0, sp: 0 };
    const metrics = (count) => (count <= 3 ? M3 : count === 4 ? M4 : M5);

    function addHat(slot) {
      const h = { slot, from: slot, to: slot, front: false, lift: 0, liftTo: 0, wob: 0, x: 0, y: 0, dy: 0, sc: 1, tilt: 0, soot: 0, bomb: 0, fresh: 0 };
      hats.push(h);
      order.push(h);
      return h;
    }
    for (let i = 0; i < n; i++) addHat(i);
    goldHat = pick(hats);

    function layout() {
      const W = api.W, H = api.H, tall = H > W * 1.25, short = H < 450;
      // narrow screens pack the hats closer; short ones make them a bit taller
      for (const [m, count] of [[M3, 3], [M4, 4], [M5, 5]]) {
        m.hw = Math.min(((W * 0.94) / count) * (tall ? 0.74 : 0.66), H * (short ? 0.19 : 0.17), 110);
        m.sp = Math.min((W * 0.94) / count, m.hw * 2.2);
      }
      L.tableY = H * (tall ? 0.6 : short ? 0.65 : 0.63);
      L.tableW = Math.min(W - 14, Math.max(2 * M3.sp + M3.hw * 2.2, 4 * M5.sp + M5.hw * 2.2));
      L.skirt = Math.min(H - L.tableY - M3.hw * 0.2 - 6, Math.max(M3.hw * 1.5, tall ? H * 0.2 : 0));
      L.s = Math.min(H * 0.1, W * (tall ? 0.15 : 0.14), 62);
      L.cx = W / 2;
      L.magY = L.tableY - M3.hw * 1.05 - L.s * 0.8;
      L.fs = clamp(Math.min(W, H) * 0.05, 14, 24);
      place();
    }

    const slotX = (slot, m, count) => api.W / 2 + (slot - (count - 1) / 2) * m.sp;

    // Where every hat is this frame: sliding between slots, swooping in front or behind, or flying in.
    function place() {
      const shuffling = phase === 'shuffle' && mi < moves.length && mt > 0;
      const e = shuffling ? smooth(mt / moves[mi].dur) : 0;
      const m = metrics(n), grow = phase === 'grow' ? ease(pt / 0.6) : 1;
      const prev = metrics(n - 1);
      L.hw = grow < 1 ? prev.hw + (m.hw - prev.hw) * grow : m.hw;
      L.sp = grow < 1 ? prev.sp + (m.sp - prev.sp) * grow : m.sp;
      for (const h of hats) {
        let x = slotX(h.slot, m, n), dy = 0, sc = 1, tilt = 0;
        if (grow < 1) {
          if (h.fresh) {
            // the new hat is tossed in from the magician's paw
            const k = clamp(pt / 0.5, 0, 1);
            x = L.cx + (x - L.cx) * k;
            dy = -Math.sin(Math.PI * k) * L.hw * 2.2 - (1 - k) * L.s;
            sc = 0.6 + 0.4 * k;
          } else x = slotX(h.slot, prev, n - 1) + (x - slotX(h.slot, prev, n - 1)) * grow;
        } else if (h.from !== h.to) {
          const a = slotX(h.from, m, n), b = slotX(h.to, m, n);
          const arc = Math.sin(Math.PI * e) * Math.min(Math.abs(b - a) * 0.3, L.hw * 0.7);
          x = a + (b - a) * e;
          dy = h.front ? arc * 0.4 : -arc * 0.6;
          sc = 1 + (h.front ? 0.1 : -0.1) * Math.sin(Math.PI * e);
          tilt = (b > a ? 0.08 : -0.08) * Math.sin(Math.PI * e);
        }
        h.tilt = tilt;
        h.x = x;
        h.dy = dy;
        h.sc = sc;
        h.y = L.tableY + dy;
      }
    }

    function quip(str, t = 1.3) {
      say = str;
      sayT = t;
    }
    function feel(m, t) {
      mood = m;
      moodT = t;
    }

    // Plan this round's shuffle up front, following the carrot so most swaps involve its hat.
    function plan() {
      const [, count, dur, decoys, dbl] = PLAN[round - 1];
      const speed = 1 + (api.level - 1) * 0.3;
      moves.length = 0;
      let cs = goldHat.slot;
      for (let i = 0; i < count; i++) {
        const a = Math.random() < 0.6 ? cs : randi(0, n - 1);
        let b = clamp(a + pick([-2, -1, -1, 1, 1, 2]), 0, n - 1);
        if (b === a) b = a > 0 ? a - 1 : a + 1;
        let c = -1, d = -1;
        if (n >= 4 && Math.random() < dbl) {
          // a second pair swaps at the same time, to split your attention
          for (let tries = 0; tries < 8 && c < 0; tries++) {
            const cc = randi(0, n - 1), dd = cc + pick([-1, 1]);
            if (dd < 0 || dd >= n || cc === a || cc === b || dd === a || dd === b) continue;
            c = cc;
            d = dd;
          }
        }
        const dist = Math.max(Math.abs(b - a), c >= 0 ? Math.abs(d - c) : 0);
        moves.push({ a, b, c, d, dur: (dur * (0.85 + 0.15 * dist)) / speed, decoy: false });
        if (cs === a) cs = b;
        else if (cs === b) cs = a;
        else if (cs === c) cs = d;
        else if (cs === d) cs = c;
      }
      for (let k = 0; k < decoys; k++) moves[randi(1, count - 1)].decoy = true;
      mi = 0;
      mt = 0;
    }

    function hatAt(slot) {
      for (const h of hats) if (h.slot === slot) return h;
      return null;
    }

    function startMove(m) {
      for (const h of hats) {
        h.from = h.to = h.slot;
        if (h.slot === m.a) h.to = m.b;
        else if (h.slot === m.b) h.to = m.a;
        else if (h.slot === m.c) h.to = m.d;
        else if (h.slot === m.d) h.to = m.c;
      }
      // one hat of each pair swoops in front, the other slides behind
      const fa = Math.random() < 0.5;
      for (const h of hats) h.front = h.from === m.a || h.from === m.c ? fa : !fa;
      api.sfx('tick');
      if (m.decoy) {
        // the cheat: an empty hat wobbles and flashes a fake golden glint
        let cnt = 0;
        for (const h of hats) if (h.from === h.to && h !== goldHat) cnt++;
        if (cnt) {
          let k = randi(0, cnt - 1);
          for (const h of hats) {
            if (h.from !== h.to || h === goldHat) continue;
            if (k-- === 0) h.wob = 0.55;
          }
          api.sfx('squeak');
          if (Math.random() < 0.6) quip(pick(DECOY_QUIPS), 0.8);
        }
      }
    }

    function nextRound() {
      round++;
      roundLabel = '';
      waited = false;
      const want = PLAN[round - 1][0];
      if (want > n) {
        const h = addHat(n);
        n++;
        h.fresh = 1;
        phase = 'grow';
        api.sfx('slip');
        quip('MORE HATS!', 1);
        feel('laugh', 0.5);
      } else phase = 'show';
      pt = 0;
    }

    function choose(slot) {
      if (phase !== 'pick') {
        if ((phase === 'shuffle' || phase === 'cover') && !waited) {
          waited = true;
          api.pops.float('WAIT FOR IT!', L.cx, L.tableY - L.hw * 2.2, C.paper, L.fs * 1.1);
        }
        return;
      }
      if (slot < 0 || slot >= n) return;
      picked = hatAt(slot);
      picked.liftTo = 1;
      phase = 'reveal';
      pt = 0;
      fx = 0;
      hover = -1;
      say = '';
      api.sfx('pop');
    }

    const game = {
      score: 0,
      finished: false,
      resize: layout,
      update(dt) {
        elapsed += dt;
        pt += dt;
        sayT -= dt;
        if ((moodT -= dt) <= 0) mood = 'smug';
        for (const h of hats) {
          h.lift = h.lift < h.liftTo ? Math.min(h.liftTo, h.lift + dt * LIFT_SPEED) : Math.max(h.liftTo, h.lift - dt * LIFT_SPEED);
          h.wob = Math.max(0, h.wob - dt);
          h.fresh = h.fresh && phase === 'grow' ? 1 : 0;
          if (h.soot) h.soot += dt;
        }
        let aim = -0.9 + Math.sin(elapsed * 3) * 0.12;
        if (phase === 'show') {
          // lift the carrot's hat, let it sparkle, then cover it
          goldHat.liftTo = 1;
          if (pt > (round === 1 ? 1.3 : 0.35)) {
            goldHat.liftTo = 0;
            phase = 'cover';
            pt = 0;
          }
        } else if (phase === 'cover') {
          if (goldHat.lift <= 0 && pt > 0.22) {
            api.sfx('pop');
            plan();
            phase = 'shuffle';
            pt = 0;
          }
        } else if (phase === 'grow') {
          if (pt > 0.5 && !fx) {
            fx = 1;
            api.sfx('pop');
            const h = hats[hats.length - 1];
            api.pops.burst(slotX(h.slot, metrics(n), n), L.tableY, [C.white, C.purple, C.gold], 8, 160);
          }
          if (pt > 0.7) {
            fx = 0;
            phase = 'show';
            pt = 0;
          }
        } else if (phase === 'shuffle') {
          const m = moves[mi];
          if (mt <= 0 && mt + dt > 0) startMove(m);
          mt += dt;
          if (mt > 0) {
            // the wand conducts the swap
            const ha = hatAt(m.a), hb = hatAt(m.b);
            if (ha && hb) aim = Math.atan2(L.tableY - L.hw * 0.6 - (L.magY + L.s * 1.45), (ha.x + hb.x) / 2 - (L.cx + L.s * 1.3));
          }
          if (mt >= m.dur) {
            for (const h of hats) h.slot = h.from = h.to;
            mi++;
            mt = -m.dur * 0.08;
            if (mi >= moves.length) {
              phase = 'pick';
              pt = 0;
              quip(round === 1 ? 'Which hat?' : pick(['Which hat?', 'Well?', 'Pick one!', 'Go on then.']), 99);
            }
          }
        } else if (phase === 'pick') {
          aim = -0.6 + Math.sin(elapsed * 5) * 0.25;
        } else if (phase === 'reveal') {
          const won = picked === goldHat;
          if (pt > 0.12 && fx === 0) {
            fx = 1;
            if (won) {
              game.score++;
              api.sfx('gold');
              api.sfx('pickup', 1 + game.score * 0.3);
              api.pops.burst(picked.x, L.tableY - L.hw * 0.3, [C.gold, C.white, '#fff3a0'], 22, 320);
              api.pops.float('+1', picked.x, floatY(), C.gold, L.fs * 1.6);
              if (game.score >= ROUNDS) {
                quip('I... I quit.', 9);
                feel('faint', 99);
              } else {
                quip(pick(WIN_QUIPS), 1.1);
                feel('shock', 0.9);
              }
            } else {
              picked.bomb = 1;
              api.sfx('eep');
            }
          }
          if (won) {
            if (game.score >= ROUNDS) {
              // the grand finale: every other hat had a bomb bunny under it all along
              if (pt > 0.6 && fx === 1) {
                fx = 2;
                for (const h of hats) h.liftTo = 1;
                api.sfx('sparkle');
                api.pops.burst(L.cx, L.tableY - L.hw, [C.gold, C.pink, C.white, C.blue], 30, 420);
              }
              if (pt > 1.8) game.finished = true;
            } else if (pt > 0.8) nextRound();
          } else {
            if (pt > 0.5 && fx === 1) {
              fx = 2;
              picked.soot = 0.001;
              api.sfx('boom');
              api.shake(10);
              api.pops.burst(picked.x, L.tableY - L.hw * 0.5, ['#ff8a1f', '#ffe14d', '#3a3440', '#6b6375'], 20, 300);
              quip(pick(LOSE_QUIPS), 9);
              feel('laugh', 9);
            }
            if (pt > 0.95 && fx === 2) {
              fx = 3;
              goldHat.liftTo = 1;
              api.sfx('kazoo');
              api.pops.float('IT WAS HERE!', clamp(goldHat.x, L.fs * 4, api.W - L.fs * 4), floatY(), C.gold, L.fs * 1.2);
            }
            if (pt > 2.1) game.finished = true;
          }
        }
        wandA += (aim - wandA) * Math.min(1, dt * 12);
        place();
      },
      // the whole column above and below a hat counts as that hat, generous for fingers
      down(x) {
        choose(nearest(x));
      },
      move(x) {
        hover = phase === 'pick' ? nearest(x) : -1;
      },
      key(k) {
        if (k >= '1' && k <= '5' && k.length === 1) choose(+k - 1);
      },
      draw(g) {
        const W = api.W, H = api.H;
        lawn(g, W, H);
        drawMagician(g);
        drawTable(g);
        // what's under each hat shows as it lifts: the golden carrot, or a bomb bunny
        for (const h of hats) {
          if (h.lift <= 0.02 && !h.bomb) continue;
          if (h === goldHat) drawCarrot(g, h);
          else drawBomb(g, h);
        }
        for (const h of order) {
          ellipse(g, h.x, L.tableY + L.hw * 0.02, L.hw * 0.7 * h.sc * (1 - h.lift * 0.35), L.hw * 0.14, 0, 'rgba(43,29,58,0.28)', 0);
        }
        order.sort(byDepth);
        for (const h of order) drawHat(g, h);
        drawWandTip(g);
        drawBubble(g);
        if (!roundLabel) roundLabel = `ROUND ${round}/${ROUNDS}`;
        text(g, roundLabel, 12, L.fs * 1.1, L.fs * 1.05, C.paper, 'left');
      },
    };

    // floating text rises from the cloth, clear of the magician and his speech bubble
    const floatY = () => L.tableY + M3.hw * 0.18 + L.skirt * 0.55;

    function nearest(x) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(x - slotX(i, metrics(n), n));
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return bd < L.sp * 0.75 ? best : -1;
    }

    function drawHat(g, h) {
      const hw = L.hw, lw = Math.max(2, hw * 0.05);
      const hov = phase === 'pick' && hover === h.slot ? 0.12 + Math.sin(elapsed * 10) * 0.03 : 0;
      const wob = h.wob > 0 ? Math.sin(h.wob * 45) * 0.16 * Math.min(1, h.wob * 4) : 0;
      const lift = ease(h.lift);
      g.save();
      g.translate(h.x, h.y - lift * hw * 1.25 - hov * hw - Math.abs(wob) * hw * 0.4);
      g.rotate(wob + lift * 0.22 + h.tilt);
      g.scale(h.sc, h.sc);
      // brim behind, crown, then the brim's front lip over the crown's base
      ellipse(g, 0, -hw * 0.05, hw * 0.7, hw * 0.16, 0, HAT_TOP, lw);
      g.beginPath();
      g.moveTo(-hw * 0.4, -hw * 0.05);
      g.lineTo(-hw * 0.47, -hw * 0.94);
      g.lineTo(hw * 0.47, -hw * 0.94);
      g.lineTo(hw * 0.4, -hw * 0.05);
      g.closePath();
      g.fillStyle = HAT;
      g.fill();
      g.lineWidth = lw;
      g.strokeStyle = C.ink;
      g.stroke();
      g.beginPath();
      g.moveTo(-hw * 0.3, -hw * 0.3);
      g.lineTo(-hw * 0.35, -hw * 0.88);
      g.lineTo(-hw * 0.24, -hw * 0.88);
      g.lineTo(-hw * 0.2, -hw * 0.3);
      g.closePath();
      g.fillStyle = HAT_HI;
      g.fill();
      g.beginPath();
      g.moveTo(-hw * 0.405, -hw * 0.12);
      g.lineTo(-hw * 0.425, -hw * 0.32);
      g.lineTo(hw * 0.425, -hw * 0.32);
      g.lineTo(hw * 0.405, -hw * 0.12);
      g.closePath();
      g.fillStyle = C.red;
      g.fill();
      g.stroke();
      ellipse(g, 0, -hw * 0.94, hw * 0.47, hw * 0.09, 0, HAT_TOP, lw);
      g.beginPath();
      g.ellipse(0, -hw * 0.05, hw * 0.7, hw * 0.16, 0, 0.12, Math.PI - 0.12);
      g.fillStyle = HAT_TOP;
      g.fill();
      g.stroke();
      g.restore();
      // the fake glint peeking out from under a decoy
      if (h.wob > 0) {
        const k = Math.min(1, h.wob * 4);
        star(g, h.x + hw * 0.45, h.y - hw * 0.12, hw * 0.16 * k * (0.8 + 0.3 * Math.sin(elapsed * 30)), C.gold, 2, elapsed * 4);
      }
    }

    function drawCarrot(g, h) {
      const s = L.hw * 0.72, x = h.x, y = L.tableY - s * 0.2;
      const glow = 0.6 + 0.4 * Math.sin(elapsed * 8);
      circle(g, x, y - s * 0.05, s * 0.55 * glow, 'rgba(255,224,102,0.35)', 0);
      carrot(g, x - s * 0.55, y - s * 0.1, s, -1.42, true);
      for (let i = 0; i < 3; i++) {
        const a = elapsed * 3 + (i * Math.PI * 2) / 3;
        star(g, x + Math.cos(a) * s * 0.7, y - s * 0.25 + Math.sin(a) * s * 0.3, s * (0.08 + 0.04 * Math.sin(elapsed * 9 + i)), C.gold, 1.5);
      }
    }

    function drawBomb(g, h) {
      const s = L.hw * 0.34, pop = h.bomb ? clamp((pt - 0.1) * 5, 0, 1) : 1;
      const sooty = h.soot > 0;
      const bounce = h.bomb && !sooty ? Math.sin(elapsed * 20) * 0.06 : 0;
      rabbit(g, h.x, L.tableY - s * 0.9 - (h.bomb ? Math.sin(pop * Math.PI) * s * 0.4 : 0), s, {
        fur: sooty ? '#3a3440' : '#5b5566',
        bomb: !sooty,
        blink: sooty ? 1 : 0,
        mouth: sooty ? 'o' : 'teeth',
        squash: bounce,
      });
      if (sooty && h.soot < 1.5) {
        // a little smoke ring drifting up
        for (let i = 0; i < 3; i++) {
          const k = clamp(h.soot * 1.2 - i * 0.15, 0, 1);
          circle(g, h.x + (i - 1) * s * 0.6, L.tableY - s * (2 + k * 2.5), s * (0.3 + k * 0.3), `rgba(90,85,102,${0.6 * (1 - k)})`, 0);
        }
      }
    }

    function drawTable(g) {
      const W = api.W, ty = L.tableY, hw = M3.hw, x0 = (W - L.tableW) / 2, top = ty - hw * 0.3, front = ty + hw * 0.18;
      // cloth skirt with a gold fringe, then the table top
      rrect(g, x0 + 6, front - 4, L.tableW - 12, L.skirt, 10, CLOTH_DARK, 3);
      for (let x = x0 + 30; x < x0 + L.tableW - 20; x += 64) star(g, x, front + L.skirt * 0.62, Math.min(9, L.skirt * 0.12), 'rgba(255,200,61,0.55)', 0);
      rrect(g, x0, top, L.tableW, front - top, 12, CLOTH, 3);
      g.fillStyle = C.gold;
      g.fillRect(x0 + 6, front - 6, L.tableW - 12, 4);
      if (api.touch || phase === 'grow' || phase === 'reveal') return;
      // number badges on the cloth under each slot, for the keys (they count slots, not hats)
      const on = phase === 'pick', by = front + Math.min(L.skirt * 0.42, L.fs * 1.5);
      g.font = `${Math.round(L.fs * 1.05)}px ${FONT}`;
      for (let i = 0; i < n; i++) {
        const bx = slotX(i, metrics(n), n);
        circle(g, bx, by, L.fs * 0.8, on ? (hover === i ? C.gold : C.paper) : 'rgba(255,253,247,0.45)', on ? 3 : 2);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = C.ink;
        g.fillText(LABELS[i], bx, by + 1);
      }
    }

    function drawMagician(g) {
      const s = L.s, cx = L.cx, y = L.magY, ty = L.tableY - M3.hw * 0.3, lw = Math.max(2, s * 0.08);
      // cape, tux, shirt and bow tie
      g.lineWidth = lw;
      g.strokeStyle = C.ink;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(cx - s * 0.5, y + s * 0.6);
      g.lineTo(cx - s * 1.55, ty + 4);
      g.lineTo(cx + s * 1.55, ty + 4);
      g.lineTo(cx + s * 0.5, y + s * 0.6);
      g.closePath();
      g.fillStyle = C.red;
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(cx - s * 0.55, y + s * 0.6);
      g.lineTo(cx - s * 1.0, ty + 4);
      g.lineTo(cx + s * 1.0, ty + 4);
      g.lineTo(cx + s * 0.55, y + s * 0.6);
      g.closePath();
      g.fillStyle = '#3b3150';
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(cx - s * 0.3, y + s * 0.62);
      g.lineTo(cx, y + s * 1.55);
      g.lineTo(cx + s * 0.3, y + s * 0.62);
      g.closePath();
      g.fillStyle = C.paper;
      g.fill();
      g.stroke();
      // arms: one paw on the table, one waving the wand
      const lp = [cx - s * 1.25, ty + s * 0.05], rp = [cx + s * 1.3, y + s * 1.45];
      for (const [px, py] of [lp, rp]) {
        const sx = px < cx ? cx - s * 0.7 : cx + s * 0.7;
        g.lineCap = 'round';
        g.lineWidth = s * 0.34;
        g.strokeStyle = C.ink;
        g.beginPath();
        g.moveTo(sx, y + s * 0.95);
        g.lineTo(px, py);
        g.stroke();
        g.lineWidth = s * 0.34 - lw * 2;
        g.strokeStyle = '#3b3150';
        g.stroke();
      }
      const dx = Math.cos(wandA), dy = Math.sin(wandA);
      g.lineWidth = s * 0.14;
      g.strokeStyle = C.ink;
      g.beginPath();
      g.moveTo(rp[0] - dx * s * 0.3, rp[1] - dy * s * 0.3);
      g.lineTo(rp[0] + dx * s * 1.3, rp[1] + dy * s * 1.3);
      g.stroke();
      g.lineWidth = s * 0.08;
      g.strokeStyle = C.white;
      g.beginPath();
      g.moveTo(rp[0] + dx * s * 1.0, rp[1] + dy * s * 1.0);
      g.lineTo(rp[0] + dx * s * 1.28, rp[1] + dy * s * 1.28);
      g.stroke();
      g.lineCap = 'butt';
      circle(g, lp[0], lp[1], s * 0.24, C.white, lw);
      circle(g, rp[0], rp[1], s * 0.24, C.white, lw);
      g.beginPath();
      g.moveTo(cx, y + s * 0.82);
      g.lineTo(cx - s * 0.3, y + s * 0.68);
      g.lineTo(cx - s * 0.3, y + s * 0.98);
      g.closePath();
      g.moveTo(cx, y + s * 0.82);
      g.lineTo(cx + s * 0.3, y + s * 0.68);
      g.lineTo(cx + s * 0.3, y + s * 0.98);
      g.closePath();
      g.fillStyle = C.red;
      g.fill();
      g.lineWidth = lw * 0.8;
      g.stroke();
      // the head: smug by default, shocked when you find it, cackling when you don't
      const laugh = mood === 'laugh', faint = mood === 'faint';
      const rot = faint ? 0.45 : laugh ? Math.sin(elapsed * 22) * 0.08 : Math.sin(elapsed * 2) * 0.04;
      rabbit(g, cx, y, s, {
        hat: true,
        rot,
        angry: mood === 'smug' || laugh ? undefined : false,
        blink: laugh || faint ? 1 : 0,
        mouth: mood === 'shock' || faint ? 'o' : 'teeth',
        squash: laugh ? Math.abs(Math.sin(elapsed * 22)) * 0.08 : 0,
      });
      if (!laugh && !faint) {
        // a monocle, because of course
        g.save();
        g.translate(cx, y);
        g.rotate(rot);
        circle(g, s * 0.34, -s * 0.1, s * 0.25, 'rgba(255,255,255,0.25)', lw * 0.8);
        g.strokeStyle = C.gold;
        g.lineWidth = lw * 0.5;
        g.beginPath();
        g.moveTo(s * 0.5, s * 0.08);
        g.quadraticCurveTo(s * 0.7, s * 0.5, s * 0.5, s * 0.75);
        g.stroke();
        g.restore();
      }
      if (faint) {
        for (let i = 0; i < 3; i++) {
          const a = elapsed * 6 + (i * Math.PI * 2) / 3;
          star(g, cx + Math.cos(a) * s * 0.9, y - s * 1.1 + Math.sin(a) * s * 0.25, s * 0.16, C.gold, 2);
        }
      }
    }

    function drawWandTip(g) {
      if (phase !== 'shuffle' && phase !== 'show') return;
      const s = L.s, tx = L.cx + s * 1.3 + Math.cos(wandA) * s * 1.35, ty = L.magY + s * 1.45 + Math.sin(wandA) * s * 1.35;
      star(g, tx, ty, s * (0.14 + 0.06 * Math.sin(elapsed * 25)), C.gold, 1.5, elapsed * 6);
    }

    function drawBubble(g) {
      if (sayT <= 0 || !say) return;
      const fs = L.fs, s = L.s, cx = L.cx, y = L.magY;
      g.font = `${Math.round(fs)}px ${FONT}`;
      const bw = g.measureText(say).width + fs * 1.2, bh = fs * 1.8;
      // beside his head when there's room, otherwise above it
      let bx = cx + s * 1.2, by = y - s * 1.2 - bh / 2, tail = 'left';
      if (bx + bw > api.W - 6) {
        bx = clamp(cx - bw / 2, 6, api.W - bw - 6);
        by = y - s * 2.05 - bh - 8;
        tail = 'down';
      }
      g.save();
      g.globalAlpha = Math.min(1, sayT * 4);
      g.beginPath();
      if (tail === 'left') {
        g.moveTo(bx + 4, by + bh * 0.55);
        g.lineTo(cx + s * 0.85, y - s * 0.55);
        g.lineTo(bx + 4, by + bh * 0.9);
      } else {
        g.moveTo(cx - fs * 0.4, by + bh - 4);
        g.lineTo(cx, y - s * 1.95);
        g.lineTo(cx + fs * 0.4, by + bh - 4);
      }
      g.fillStyle = C.paper;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = C.ink;
      g.stroke();
      rrect(g, bx, by, bw, bh, bh / 2, C.paper, 3);
      // patch over the tail's root so the bubble reads as one shape
      g.beginPath();
      if (tail === 'left') g.rect(bx + 1.5, by + bh * 0.5, 6, bh * 0.45);
      else g.rect(cx - fs * 0.36, by + bh - 6, fs * 0.72, 4.5);
      g.fillStyle = C.paper;
      g.fill();
      g.font = `${Math.round(fs)}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = C.ink;
      g.fillText(say, bx + bw / 2, by + bh / 2 + 1);
      g.restore();
    }

    layout();
    quip('Watch the carrot!', 1.6);
    return game;
  },
};
