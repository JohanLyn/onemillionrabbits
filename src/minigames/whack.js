// Whack-a-Rabbit: rabbits pop out of nine holes; bonk them before they duck back down.
// Golden ones are worth more, chonks take two bonks, and bomb bunnies cost you.
import { C, lawn, ellipse, rabbit, text, star, rand, pick, clamp } from './kit.js';

const KINDS = {
  bunny: { w: 66, pts: 1, hits: 1, fur: C.fur },
  hare: { w: 12, pts: 1, hits: 1, fur: C.hare, quick: 0.7 },
  golden: { w: 7, pts: 3, hits: 1, golden: true, quick: 0.6 },
  chonk: { w: 7, pts: 2, hits: 2, fur: C.grey, big: 1.18 },
  bomb: { w: 14, pts: -3, hits: 1, fur: '#5b5566', bomb: true },
};
// keys laid out like the holes: top row Q W E / 7 8 9, and so on
const KEYMAP = { q: 0, w: 1, e: 2, a: 3, s: 4, d: 5, z: 6, x: 7, c: 8, 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

function pickKind() {
  let total = 0;
  for (const k in KINDS) total += KINDS[k].w;
  let r = Math.random() * total;
  for (const k in KINDS) if ((r -= KINDS[k].w) <= 0) return k;
  return 'bunny';
}

export default {
  id: 'whack',
  name: 'Whack-a-Rabbit',
  emoji: '🔨',
  blurb: 'Bonk them back into the ground. Not the bomb bunnies.',
  how: {
    touch: 'Tap rabbits as they pop up. Golden ones are worth 3, chonky ones take two taps, bombs cost you.',
    keys: 'Click the rabbits, or hit the key that matches the hole: Q W E / A S D / Z X C (or the number pad).',
  },
  duration: 20,
  stars: [10, 20, 30],
  unit: 'bonks',
  create(api) {
    const holes = Array.from({ length: 9 }, (_, i) => ({ i, x: 0, y: 0, r: 0, kind: null, state: 'empty', t: 0, up: 0, hits: 0 }));
    const mallet = { x: 0, y: 0, t: 1 };
    let spawnT = 0.3, elapsed = 0, streak = 0;

    function layout() {
      const top = api.H * 0.12, gw = api.W, gh = api.H - top;
      const cell = Math.min(gw / 3, gh / 3);
      const ox = (gw - cell * 3) / 2, oy = top + (gh - cell * 3) / 2;
      for (const h of holes) {
        const c = h.i % 3, r = Math.floor(h.i / 3);
        h.x = ox + cell * (c + 0.5);
        h.y = oy + cell * (r + 0.62);
        h.r = cell * 0.32;
      }
    }
    layout();

    function bonk(h) {
      mallet.x = h.x + h.r * 0.6;
      mallet.y = h.y - h.r * 1.2;
      mallet.t = 0;
      if (h.state !== 'up' && h.state !== 'rising') {
        api.sfx('hit');
        return;
      }
      const K = KINDS[h.kind];
      h.hits++;
      if (h.hits < K.hits) {
        api.sfx('squeak');
        api.pops.float('ONE MORE!', h.x, h.y - h.r * 2.4, C.white, 20);
        h.t = Math.min(h.t, 0.05);
        return;
      }
      h.state = 'bonked';
      h.t = 0;
      if (K.pts < 0) {
        game.score = Math.max(0, game.score + K.pts);
        streak = 0;
        api.shake(12);
        api.sfx('boom');
        api.pops.burst(h.x, h.y - h.r, ['#ff8a1f', '#ffe14d', '#3a3440'], 18, 300);
        api.pops.float(`${K.pts}`, h.x, h.y - h.r * 2.2, '#ff8a8a', 30);
        return;
      }
      streak++;
      // every 5 clean bonks in a row pays a bonus point
      const bonus = streak % 5 === 0 ? 1 : 0;
      game.score += K.pts + bonus;
      api.sfx(K.golden ? 'gold' : 'pop');
      api.pops.burst(h.x, h.y - h.r, K.golden ? [C.gold, C.white] : [C.white, C.pink, C.gold], K.golden ? 22 : 10);
      api.pops.float(`+${K.pts + bonus}${bonus ? ' STREAK!' : ''}`, h.x, h.y - h.r * 2.2, K.golden ? C.gold : C.white, bonus ? 24 : 28);
    }

    const game = {
      score: 0,
      finished: false,
      resize: layout,
      update(dt) {
        elapsed += dt;
        const lvl = api.level;
        const prog = clamp(elapsed / 20, 0, 1);
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = (0.78 - prog * 0.36) / lvl * rand(0.75, 1.25);
          const empty = holes.filter((h) => h.state === 'empty');
          if (empty.length) {
            const h = pick(empty);
            h.kind = pickKind();
            h.state = 'rising';
            h.t = 0;
            h.hits = 0;
            h.up = (1.15 - prog * 0.4) / lvl * (KINDS[h.kind].quick || 1);
          }
        }
        for (const h of holes) {
          h.t += dt;
          if (h.state === 'rising' && h.t > 0.12) {
            h.state = 'up';
            h.t = 0;
          } else if (h.state === 'up' && h.t > h.up) {
            h.state = 'hiding';
            h.t = 0;
            if (h.kind !== 'bomb') streak = 0;
          } else if ((h.state === 'hiding' && h.t > 0.12) || (h.state === 'bonked' && h.t > 0.45)) {
            h.state = 'empty';
          }
        }
        mallet.t += dt;
      },
      down(x, y) {
        // the nearest hole within reach of the tap, generous for fingers
        let best = null, bd = Infinity;
        for (const h of holes) {
          const d = Math.hypot(x - h.x, (y - (h.y - h.r * 0.9)) * 0.8);
          if (d < bd) {
            bd = d;
            best = h;
          }
        }
        if (best && bd < best.r * 1.9) bonk(best);
        else {
          mallet.x = x;
          mallet.y = y;
          mallet.t = 0;
        }
      },
      key(k) {
        if (k in KEYMAP) bonk(holes[KEYMAP[k]]);
      },
      draw(g) {
        lawn(g, api.W, api.H);
        for (const h of holes) {
          const R = h.r;
          // the dark hole and its back rim
          ellipse(g, h.x, h.y, R * 1.25, R * 0.48, 0, C.dirtDark, 3);
          ellipse(g, h.x, h.y - R * 0.05, R * 1.05, R * 0.34, 0, '#3a2618', 0);
          if (h.state !== 'empty' && h.kind) {
            const K = KINDS[h.kind];
            let rise = 1;
            if (h.state === 'rising') rise = h.t / 0.12;
            else if (h.state === 'hiding') rise = 1 - h.t / 0.12;
            else if (h.state === 'bonked') rise = 1 - Math.max(0, h.t - 0.15) / 0.3;
            rise = clamp(rise, 0, 1);
            const s = R * 0.8 * (K.big || 1);
            const y = h.y + R * 1.6 - rise * R * 2.2;
            g.save();
            g.beginPath();
            g.rect(h.x - R * 2, h.y - R * 6, R * 4, R * 6);
            g.clip();
            const warn = h.state === 'up' && h.t > h.up * 0.7;
            rabbit(g, h.x, y, s, {
              fur: K.fur,
              golden: K.golden,
              bomb: K.bomb,
              blink: h.state === 'bonked' ? 1 : 0,
              squash: h.state === 'bonked' ? 0.25 : warn ? Math.sin(h.t * 40) * 0.05 : 0,
              mouth: h.state === 'bonked' ? 'o' : 'teeth',
              hat: h.kind === 'chonk' && h.hits > 0,
            });
            g.restore();
            if (h.state === 'bonked') {
              for (let i = 0; i < 3; i++) {
                const a = h.t * 8 + (i * Math.PI * 2) / 3;
                star(g, h.x + Math.cos(a) * s * 0.9, y - s * 1.3 + Math.sin(a) * s * 0.25, s * 0.18, C.gold, 2);
              }
            }
          }
          // the front lip of the hole hides the rabbit's body
          g.beginPath();
          g.ellipse(h.x, h.y, R * 1.25, R * 0.48, 0, 0, Math.PI);
          g.lineTo(h.x - R * 1.25, h.y);
          g.fillStyle = C.dirt;
          g.fill();
          g.lineWidth = 3;
          g.strokeStyle = C.ink;
          g.stroke();
          if (!api.touch) text(g, 'QWEASDZXC'[h.i], h.x + R * 1.1, h.y + R * 0.45, Math.max(12, R * 0.32), C.paper);
        }
        // the mallet swings down where you tapped
        if (mallet.t < 0.25) {
          const a = mallet.t < 0.08 ? -0.9 + (mallet.t / 0.08) * 0.9 : 0;
          g.save();
          g.translate(mallet.x, mallet.y);
          g.rotate(a);
          g.fillStyle = '#b07a3c';
          g.strokeStyle = C.ink;
          g.lineWidth = 3;
          g.fillRect(-4, -4, 46, 9);
          g.strokeRect(-4, -4, 46, 9);
          g.fillStyle = C.red;
          g.fillRect(-22, -18, 22, 36);
          g.strokeRect(-22, -18, 22, 36);
          g.restore();
        }
        if (streak >= 3) text(g, `STREAK ×${streak}`, api.W / 2, api.H * 0.06, Math.max(16, api.H * 0.04), C.gold);
      },
    };
    return game;
  },
};
