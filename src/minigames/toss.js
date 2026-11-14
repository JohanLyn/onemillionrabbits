// Toaster Toss: hold to heat the toaster, let go to launch a slice of flaming toast at rabbits perched
// on hills and fence posts. Far, airborne and golden rabbits pay more, two with one slice is a trick
// shot, and toast that lands near a rabbit sends it hopping, which makes it a moving target.
import { C, ellipse, circle, rrect, rabbit, text, star, rand, pick, clamp } from './kit.js';

const KINDS = {
  bunny: { w: 70, pts: 1, fur: C.fur, sit: [2.6, 5.5] },
  hare: { w: 20, pts: 1, fur: C.hare, sit: [1.2, 2.6] },
  golden: { w: 10, pts: 5, golden: true, sit: [0.9, 1.8], stay: 6 },
};
const BALLOON_PTS = 2; // plus the moving bonus, so 3
const RELOAD = 0.38; // seconds before the toaster pops the next slice
const SWEEP = 1.05; // seconds for the power meter to fill (then it drains, then fills again)
const PREVIEW = 0.34; // seconds of flight the dotted aim preview shows
const CROUCH = 0.26; // a rabbit's wind-up before it hops, so you can see it coming
const BREAD = '#f2c46d', CRUST = '#b8743a', CHROME = '#d7deea', SLOT = '#3a2b44';
const TOASTED = '#9c8577';
const LABELS = ['TOASTED!', 'CRISPY!', 'BONK!', 'BUTTERED!', 'WARM!'];

function pickKind(noGold) {
  let total = 0;
  for (const k in KINDS) if (!(noGold && KINDS[k].golden)) total += KINDS[k].w;
  let r = Math.random() * total;
  for (const k in KINDS) if (!(noGold && KINDS[k].golden) && (r -= KINDS[k].w) <= 0) return k;
  return 'bunny';
}

// The slice's outline: a square with the two bumps a bread slice has on top. sz is its half-width.
function breadPath(g, sz) {
  g.beginPath();
  g.moveTo(-0.85 * sz, 0.9 * sz);
  g.lineTo(-0.85 * sz, -0.3 * sz);
  g.bezierCurveTo(-1.25 * sz, -1.15 * sz, -0.12 * sz, -1.25 * sz, 0, -0.78 * sz);
  g.bezierCurveTo(0.12 * sz, -1.25 * sz, 1.25 * sz, -1.15 * sz, 0.85 * sz, -0.3 * sz);
  g.lineTo(0.85 * sz, 0.9 * sz);
  g.closePath();
}

function slice(g, x, y, sz, rot, burnt = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  breadPath(g, sz);
  g.fillStyle = burnt ? '#5a3c2a' : CRUST;
  g.fill();
  g.lineWidth = Math.max(2, sz * 0.16);
  g.strokeStyle = C.ink;
  g.stroke();
  g.scale(0.74, 0.74);
  breadPath(g, sz);
  g.fillStyle = burnt ? '#7d5638' : BREAD;
  g.fill();
  // grill marks
  g.lineWidth = sz * 0.12;
  g.strokeStyle = burnt ? '#4a2f20' : CRUST;
  g.beginPath();
  g.moveTo(-0.45 * sz, 0.45 * sz);
  g.lineTo(0.35 * sz, -0.35 * sz);
  g.moveTo(-0.1 * sz, 0.6 * sz);
  g.lineTo(0.55 * sz, -0.05 * sz);
  g.stroke();
  g.restore();
}

// Three licking flames trailing behind a flying slice, pointing away from where it is heading.
function flames(g, x, y, vx, vy, sz, tm) {
  g.save();
  g.translate(x, y);
  g.rotate(Math.atan2(vy, vx) + Math.PI);
  g.lineJoin = 'round';
  for (let j = 0; j < 3; j++) {
    const len = sz * (j === 1 ? 2.1 : 1.5) * (1 + 0.18 * Math.sin(tm * 33 + j * 2.1));
    const off = (j - 1) * sz * 0.5;
    for (let k = 0; k < 2; k++) {
      const w = sz * (k ? 0.24 : 0.42), l = len * (k ? 0.6 : 1);
      g.beginPath();
      g.moveTo(0, off - w);
      g.quadraticCurveTo(l * 0.55, off - w * 1.1, l, off + (j - 1) * sz * 0.2);
      g.quadraticCurveTo(l * 0.55, off + w * 1.1, 0, off + w);
      g.closePath();
      g.fillStyle = k ? '#ffe14d' : C.carrot;
      g.fill();
      if (!k) {
        g.lineWidth = 2;
        g.strokeStyle = C.ink;
        g.stroke();
      }
    }
  }
  g.restore();
}

export default {
  id: 'toss',
  name: 'Toaster Toss',
  emoji: '🍞',
  blurb: 'Breakfast is served. At great speed. On fire.',
  how: {
    touch: 'Hold to heat the toaster, let go to launch flaming toast at the rabbits (on a tall screen, hold on the side you aim at).',
    keys: 'Hold Space (or the mouse) to heat the toaster, let go to launch flaming toast at the rabbits.',
  },
  duration: 25,
  stars: [10, 22, 34],
  unit: 'points',
  create(api) {
    const lvl = api.level;
    // L: everything measured from the canvas size, recomputed on resize
    const L = { W: 1, H: 1, portrait: false, gy: 0, u: 0, s: 0, tw: 0, th: 0, tx: 0, lx: 0, ly: 0, top: 0, rfar: 0, rmin: 0, rmax: 0, cos: 0, sin: 0, tan: 0, sin2: 0, g: 0 };
    // perch looks are rolled once so a resize keeps the same hills and posts
    const looks = Array.from({ length: 8 }, (_, i) => ({ j: rand(-1, 1), hf: Math.random(), post: (i + (Math.random() < 0.5 ? 0 : 1)) % 2 === 0 || Math.random() < 0.2 }));
    const perches = [];
    const rabbits = Array.from({ length: 12 }, () => ({ on: false, kind: 'bunny', st: 'sit', pi: -1, to: -1, x: 0, y: 0, x0: 0, y0: 0, ex: 0, ey: 0, t: 0, dur: 1, arc: 0, next: 0, age: 0, blink: 2, scared: 0, vx: 0, vy: 0, rot: 0, vr: 0, bounce: 0, hb: 0 }));
    const toasts = Array.from({ length: 6 }, () => ({ on: false, st: 'fly', x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, hits: 0, t: 0, puffT: 0 }));
    const puffs = Array.from({ length: 48 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, r: 0, life: 0, max: 1, ember: false }));
    const clouds = [[0.18, 0.2, 1.1], [0.55, 0.12, 0.8], [0.82, 0.3, 1]];
    const tst = { reload: 0, held: false, src: '', charging: false, chargeT: 0, p: 0, popT: 1, dir: 1, shots: 0 };
    let elapsed = 0, want = 4, spawnT = 0, balloonT = rand(4, 6), streak = 0, puffI = 0;

    function layout() {
      const W = api.W, H = api.H;
      L.W = W;
      L.H = H;
      L.portrait = W < H * 0.8;
      L.gy = H * (L.portrait ? 0.9 : 0.86);
      L.u = clamp(Math.min(W, H) * 0.055, 13, 30);
      L.s = clamp(Math.min(W * 0.036, H * 0.05), 11, 21);
      L.tw = L.u * 2.3;
      L.th = L.u * 1.55;
      L.tx = L.portrait ? W / 2 : Math.max(14 + L.tw * 0.65, W * 0.07);
      L.lx = L.tx;
      L.ly = L.gy - L.th - L.u * 0.2;
      L.top = H * 0.07 + L.s;
      if (!L.portrait) tst.dir = 1;
      // ballistics: a fixed launch angle, the power picks the range. A full-power shot slightly
      // overshoots the far edge and peaks just under the top; on a tall screen the arcs are fountains.
      L.rfar = L.portrait ? W / 2 - 10 : W - L.tx - 14;
      L.rmin = L.rfar * 0.1;
      L.rmax = L.rfar * 1.15;
      const A = L.ly - L.top;
      L.tan = clamp((4 * 0.85 * A) / L.rmax, 1, 7.5);
      const ang = Math.atan(L.tan);
      L.cos = Math.cos(ang);
      L.sin = Math.sin(ang);
      L.sin2 = Math.sin(2 * ang);
      const T = L.portrait ? 1.4 : 1.2; // seconds a full-power slice is in the air
      L.g = (8 * ((L.rmax * L.tan) / 4)) / (T * T);
      // the hills and fence posts the rabbits stand on
      const s = L.s;
      const slots = [];
      if (L.portrait) {
        const a = L.tw * 0.75 + s * 1.4, b = W / 2 - s * 1.6;
        const k = clamp(Math.floor((b - a) / (s * 3.4)) + 1, 2, 3);
        for (const side of [1, -1]) for (let i = 0; i < k; i++) slots.push([side, a + ((b - a) * i) / (k - 1), (b - a) / (k - 1)]);
      } else {
        const a = L.rfar * 0.26, b = L.rfar - s * 1.5;
        const k = clamp(Math.round(L.rfar / (s * 6.5)), 4, 6), w = (b - a) / k;
        for (let i = 0; i < k; i++) slots.push([1, a + w * (i + 0.5), w]);
      }
      perches.length = slots.length;
      for (let i = 0; i < slots.length; i++) {
        const [side, d, w] = slots[i], lk = looks[i];
        const dx = d + lk.j * w * (L.portrait ? 0.08 : 0.16);
        const p = perches[i] || (perches[i] = { x: 0, top: 0, w: 0, h: 0, post: false, dx: 0 });
        p.post = lk.post;
        p.dx = dx;
        p.x = L.lx + side * dx;
        p.h = p.post ? A * (L.portrait ? 0.1 + lk.hf * 0.4 : 0.12 + lk.hf * 0.26) : s * (0.9 + lk.hf * 1.6);
        // keep every rabbit reachable: no higher than the full-power arc passes over it, with room to spare
        const reach = dx * L.tan * (1 - dx / L.rmax);
        p.h = Math.max(s * 0.8, Math.min(p.h, L.gy - L.ly + reach * 0.78 - s * 1.45));
        p.top = L.gy - p.h;
        p.w = p.post ? s * 1.5 : Math.min(w * 0.8, s * 5);
      }
      want = 3;
      for (const r of rabbits) if (r.on && (r.pi >= perches.length || r.to >= perches.length)) r.on = false;
    }

    // ---------- rabbits ----------
    function taken(i) {
      for (const r of rabbits) if (r.on && r.st !== 'fly' && r.st !== 'balloon' && (r.pi === i || r.to === i)) return true;
      return false;
    }
    // a free perch: near x (with some randomness), or as far from x as possible
    function freePerch(x, far) {
      let best = -1, bs = -Infinity;
      for (let i = 0; i < perches.length; i++) {
        if (taken(i)) continue;
        const d = Math.abs(perches[i].x - x);
        const sc = far ? d + rand(0, L.W * 0.15) : -d + rand(0, L.W * 0.35);
        if (sc > bs) {
          bs = sc;
          best = i;
        }
      }
      return best;
    }
    function free() {
      for (const r of rabbits) if (!r.on) return r;
      return null;
    }
    function sitTime(r) {
      const k = KINDS[r.kind].sit;
      return rand(k[0], k[1]) / lvl;
    }
    function hop(r, pi, dur, arc) {
      r.x0 = r.x;
      r.y0 = r.y;
      r.pi = pi;
      r.to = -1;
      r.st = 'hop';
      r.t = 0;
      r.dur = dur;
      r.arc = arc;
    }
    function hopBetween(r, pi) {
      const d = Math.hypot(perches[pi].x - r.x, perches[pi].top - r.y);
      hop(r, pi, (0.5 + d / (L.W + L.H) * 0.7) / Math.sqrt(lvl), L.s * 2 + d * 0.3);
    }
    function onStage() {
      let n = 0;
      for (const r of rabbits) if (r.on && r.st !== 'fly' && r.st !== 'balloon' && !(r.st === 'hop' && r.pi < 0)) n++;
      return n;
    }
    function spawn(instant) {
      const r = free();
      if (!r) return;
      const pi = freePerch(rand(0, L.W), false);
      if (pi < 0) return;
      let gold = false;
      for (const o of rabbits) if (o.on && o.kind === 'golden') gold = true;
      Object.assign(r, { on: true, kind: pickKind(gold || elapsed < 2), scared: 0, age: 0, rot: 0, to: -1, bounce: 0, blink: rand(1, 3) });
      r.next = sitTime(r);
      const p = perches[pi];
      if (instant) {
        r.st = 'sit';
        r.pi = pi;
        r.x = p.x;
        r.y = p.top;
        return;
      }
      // bound in from the edge of the screen on the perch's side
      r.x = p.x > L.lx || !L.portrait ? L.W + L.s * 2 : -L.s * 2;
      r.y = L.gy;
      hop(r, pi, 0.85 / Math.sqrt(lvl), L.s * 3 + Math.abs(r.x - p.x) * 0.25);
      if (r.kind === 'golden') {
        api.sfx('sparkle');
        api.pops.float('GOLDEN RABBIT!', clamp(p.x, L.W * 0.25, L.W * 0.75), L.top + L.s, C.gold, Math.max(18, L.s * 1.2));
      }
    }
    function spawnBalloon() {
      const r = free();
      if (!r) return;
      const from = Math.random() < 0.5 ? -1 : 1;
      Object.assign(r, { on: true, kind: 'bunny', st: 'balloon', pi: -1, to: -1, scared: 0, age: 0, rot: 0, bounce: 0, blink: 2 });
      r.x = from < 0 ? -L.s * 3 : L.W + L.s * 3;
      r.vx = -from * (L.W / rand(6, 8)) * lvl;
      // a height the toast can reach around the middle of its drift
      r.hb = rand(0.62, 0.88) * ((L.rmax * L.tan) / 4);
      r.y = L.ly - r.hb + L.s * 1.45;
      api.sfx('pipes');
    }
    // toast landed near these rabbits: EEP, everybody jump
    function scare(x, y) {
      let any = false;
      for (const r of rabbits) {
        if (!r.on || (r.st !== 'sit' && r.st !== 'crouch')) continue;
        if (Math.abs(r.x - x) > L.s * 4.2 || Math.abs(r.y - y) > L.s * 6) continue;
        any = true;
        r.scared = 0.9;
        r.to = -1;
        const pi = freePerch(x, true);
        if (pi >= 0) hopBetween(r, pi);
        else hop(r, r.pi, 0.75 / Math.sqrt(lvl), L.s * 4); // nowhere to go: jump on the spot
        api.pops.float('EEP!', r.x, r.y - L.s * 4.2, C.white, Math.max(15, L.s));
      }
      if (any) api.sfx('eep');
    }

    // ---------- toast ----------
    function speedFor(p) {
      return Math.sqrt(((L.rmin + p * (L.rmax - L.rmin)) * L.g) / L.sin2);
    }
    function puff(x, y, ember) {
      const q = puffs[puffI];
      puffI = (puffI + 1) % puffs.length;
      q.on = true;
      q.x = x;
      q.y = y;
      q.vx = rand(-12, 12);
      q.vy = ember ? rand(-40, 10) : rand(-30, -14);
      q.r = L.s * (ember ? rand(0.12, 0.2) : rand(0.25, 0.45));
      q.life = q.max = ember ? rand(0.25, 0.45) : rand(0.5, 0.9);
      q.ember = ember;
    }
    function fire() {
      let t = null;
      for (const o of toasts) if (!o.on) t = o;
      if (!t) for (const o of toasts) if (o.st === 'down') t = o; // recycle a slice already on the grass
      if (!t) return;
      const v = speedFor(tst.p);
      Object.assign(t, { on: true, st: 'fly', x: L.lx, y: L.ly, vx: tst.dir * v * L.cos, vy: -v * L.sin, rot: 0, vr: tst.dir * rand(7, 11), hits: 0, t: 0, puffT: 0 });
      tst.reload = RELOAD / Math.sqrt(lvl);
      tst.popT = 0;
      tst.shots++;
      api.sfx('toast');
      api.pops.burst(L.lx, L.ly, [BREAD, CRUST, C.gold], 6, 160);
    }
    function release() {
      if (tst.charging) fire();
      tst.held = tst.charging = false;
      tst.src = '';
    }
    function press(src) {
      if (tst.held) return;
      tst.held = true;
      tst.src = src;
      tst.charging = false;
    }

    function knock(r, t) {
      const moving = r.st === 'hop' || r.st === 'balloon';
      const far = Math.abs(r.x - L.lx) > L.rfar * 0.6;
      const K = KINDS[r.kind];
      let pts = r.st === 'balloon' ? BALLOON_PTS : K.pts;
      if (far) pts++;
      if (moving) pts++;
      const trick = t.hits > 0;
      if (trick) pts += 2 * t.hits;
      else streak++;
      t.hits++;
      game.score += pts;
      const cx = r.x, cy = r.y - L.s * 1.45;
      const label = trick ? (t.hits > 2 ? 'TOAST-TACULAR!' : 'TRICK SHOT!') : K.golden && r.st !== 'balloon' ? 'GOLDEN!' : r.st === 'balloon' ? 'POP!' : moving ? 'MID-AIR!' : far ? 'LONG SHOT!' : pick(LABELS);
      const sz = Math.max(18, L.s * 1.35);
      api.pops.float(`+${pts}`, cx, cy - L.s * 2.4, K.golden || trick ? C.gold : C.white, sz * 1.25);
      api.pops.float(label, cx, cy - L.s * 3.9, trick ? C.pink : C.gold, sz * 0.8);
      api.pops.burst(cx, cy, K.golden ? [C.gold, C.white, '#fff3a0'] : [C.white, C.pink, BREAD, C.carrot], K.golden || trick ? 22 : 12, 300);
      if (r.st === 'balloon') {
        api.pops.burst(cx, r.y - L.s * 4.7, [C.red, C.white], 10, 240);
        api.sfx('pop');
      }
      api.sfx('hit');
      if (streak > 1) api.sfx('pickup', 1 + Math.min(streak, 8) * 0.12);
      if (trick) {
        api.sfx('kazoo');
        api.shake(7);
      } else if (K.golden) {
        api.sfx('gold');
        api.shake(4);
      } else api.sfx('squeak');
      // off it goes, spinning and slightly toasted
      const side = t.vx >= 0 ? 1 : -1;
      r.st = 'fly';
      r.pi = r.to = -1;
      r.vx = t.vx * 0.35 + side * L.u * rand(5, 9);
      r.vy = -L.u * rand(13, 19);
      r.vr = side * rand(9, 15);
      r.bounce = 0;
      // the slice keeps going, a little slower, for a chance at a second rabbit
      t.vx *= 0.7;
    }

    function insidePerch(x, y) {
      for (const p of perches) {
        if (p.post) {
          if (Math.abs(x - p.x) < p.w * 0.5 && y > p.top) return p;
        } else {
          const nx = (x - p.x) / (p.w * 0.5), ny = (y - L.gy) / p.h;
          if (y < L.gy && nx * nx + ny * ny < 1) return p;
        }
      }
      return null;
    }

    const near = (t, x, y, r) => (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y) < r * r;

    function stepToast(t, h) {
      t.vy += L.g * h;
      t.x += t.vx * h;
      t.y += t.vy * h;
      t.rot += t.vr * h;
      const s = L.s, tr = s * 0.7;
      for (const r of rabbits) {
        if (!r.on || r.st === 'fly') continue;
        // the rabbit's body and head (a touch generous), or its balloon
        if (near(t, r.x, r.y - s * 0.8, s * 1.2) || near(t, r.x, r.y - s * 2.1, s * 1.25) || (r.st === 'balloon' && near(t, r.x, r.y - s * 4.7, s * 1.4))) knock(r, t);
      }
      if (t.x < -L.s * 4 || t.x > L.W + L.s * 4 || t.y > L.H + L.s * 2) {
        // sailed off the edge
        t.on = false;
        if (!t.hits) streak = 0;
        return false;
      }
      if (t.vy > 0 && (t.y > L.gy - tr * 0.3 || insidePerch(t.x, t.y + tr * 0.5))) {
        t.st = 'down';
        t.t = 0;
        t.y = Math.min(t.y, L.gy - tr * 0.3);
        if (!t.hits) {
          streak = 0;
          api.sfx('dig');
        }
        api.pops.burst(t.x, t.y, [C.dirt, C.grass, C.carrot], 6, 140);
        scare(t.x, t.y);
        return false;
      }
      return true;
    }

    const game = {
      score: 0,
      finished: false,
      resize: layout,
      update(dt) {
        elapsed += dt;
        const s = L.s;
        // ---- the toaster ----
        if (tst.held && tst.src === 'key' && !api.keys.has(' ') && !api.keys.has('enter')) release();
        tst.popT += dt;
        if (tst.reload > 0) {
          tst.reload -= dt;
          if (tst.reload <= 0) api.sfx('tick');
        }
        if (tst.held && tst.reload <= 0) {
          if (!tst.charging) {
            tst.charging = true;
            tst.chargeT = 0;
          }
          tst.chargeT += dt;
          // fills, drains, fills: a triangle wave, so holding too long is never fatal
          const ph = (tst.chargeT / (SWEEP / Math.pow(lvl, 0.6))) % 2;
          tst.p = ph < 1 ? ph : 2 - ph;
        } else if (!tst.held) tst.p = 0;
        // ---- toast ----
        for (const t of toasts) {
          if (!t.on) continue;
          t.t += dt;
          if (t.st === 'fly') {
            const n = Math.ceil(dt * 120);
            for (let i = 0; i < n && t.on && t.st === 'fly'; i++) stepToast(t, dt / n);
            if ((t.puffT -= dt) <= 0) {
              t.puffT = 0.03;
              puff(t.x - t.vx * 0.02, t.y - t.vy * 0.02, Math.random() < 0.5);
            }
          } else {
            if ((t.puffT -= dt) <= 0) {
              t.puffT = 0.22;
              puff(t.x + rand(-s * 0.3, s * 0.3), t.y - s * 0.4, false);
            }
            if (t.t > 1.6) t.on = false;
          }
        }
        // ---- rabbits ----
        for (const r of rabbits) {
          if (!r.on) continue;
          r.t += dt;
          r.age += dt;
          r.scared = Math.max(0, r.scared - dt);
          if ((r.blink -= dt) < -0.12) r.blink = rand(1.5, 4);
          if (r.st === 'sit') {
            const p = perches[r.pi];
            r.x = p.x;
            r.y = p.top;
            if (KINDS[r.kind].stay && r.age > KINDS[r.kind].stay) {
              // the golden one gets bored and bounds away
              r.ex = r.x > L.lx || !L.portrait ? L.W + s * 3 : -s * 3;
              r.ey = L.gy;
              hop(r, -1, 0.7, s * 4);
              api.pops.float('BYE!', r.x, r.y - s * 4.2, C.gold, Math.max(15, s));
            } else if ((r.next -= dt) <= 0) {
              const pi = freePerch(r.x, false);
              if (pi >= 0) {
                r.st = 'crouch';
                r.t = 0;
                r.to = pi;
              } else r.next = sitTime(r);
            }
          } else if (r.st === 'crouch') {
            if (r.t > CROUCH / Math.sqrt(lvl)) {
              hopBetween(r, r.to);
              r.next = sitTime(r);
            }
          } else if (r.st === 'hop') {
            const k = Math.min(1, r.t / r.dur);
            const p = r.pi >= 0 ? perches[r.pi] : null;
            const ex = p ? p.x : r.ex, ey = p ? p.top : r.ey;
            r.x = r.x0 + (ex - r.x0) * k;
            r.y = r.y0 + (ey - r.y0) * k - 4 * r.arc * k * (1 - k);
            if (k >= 1) {
              if (!p) r.on = false;
              else {
                r.st = 'sit';
                r.t = 0;
                r.next = sitTime(r);
              }
            }
          } else if (r.st === 'balloon') {
            r.x += r.vx * dt;
            r.y = L.ly - r.hb + s * 1.45 + Math.sin(r.age * 2.2) * s * 0.3;
            if (r.x < -s * 4 || r.x > L.W + s * 4) r.on = false;
          } else if (r.st === 'fly') {
            r.vy += L.g * 0.9 * dt;
            r.x += r.vx * dt;
            r.y += r.vy * dt;
            r.rot += r.vr * dt;
            if (r.vy > 0 && r.y > L.gy) {
              // one comedic bounce, then off into the hedge
              if (r.bounce++ < 1) {
                r.y = L.gy;
                r.vy *= -0.5;
                r.vr *= -0.6;
                api.sfx('squeak');
                api.pops.burst(r.x, L.gy, [C.dirt, C.grass], 5, 120);
              } else r.on = false;
            }
            if (r.x < -s * 5 || r.x > L.W + s * 5) r.on = false;
          }
        }
        // keep the stage stocked
        if (onStage() < want) {
          if ((spawnT -= dt) <= 0) {
            spawn(false);
            spawnT = rand(0.45, 0.8) / lvl;
          }
        } else spawnT = Math.max(spawnT, 0.35);
        if ((balloonT -= dt) <= 0) {
          spawnBalloon();
          balloonT = rand(7, 10) / lvl;
        }
        for (const q of puffs) {
          if (!q.on) continue;
          q.life -= dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          if (q.life <= 0) q.on = false;
        }
      },
      down(x) {
        if (L.portrait) tst.dir = x < L.W / 2 ? -1 : 1;
        press('ptr');
      },
      move(x) {
        if (L.portrait && tst.held && tst.src === 'ptr') tst.dir = x < L.W / 2 ? -1 : 1;
      },
      up() {
        if (tst.held && tst.src === 'ptr') release();
      },
      key(k) {
        if (k === ' ' || k === 'enter') press('key');
        else if (L.portrait && (k === 'arrowleft' || k === 'a')) tst.dir = -1;
        else if (L.portrait && (k === 'arrowright' || k === 'd')) tst.dir = 1;
      },
      draw(g) {
        const { W, H, s, gy } = L;
        const tm = elapsed;
        // ---- the meadow, side on ----
        g.fillStyle = C.sky;
        g.fillRect(0, 0, W, gy);
        const sunX = L.portrait ? W * 0.82 : W * 0.12, sunY = H * 0.13;
        g.save();
        g.translate(sunX, sunY);
        g.rotate(tm * 0.3);
        star(g, 0, 0, L.u * 1.55, '#ffe14d', 3);
        g.restore();
        circle(g, sunX, sunY, L.u * 0.85, C.gold, 3);
        for (const cl of clouds) {
          const cs = cl[2], x = ((cl[0] * W + tm * 9 * cs) % (W + L.u * 6)) - L.u * 2, y = cl[1] * gy, r = L.u * cs;
          ellipse(g, x, y, r * 1.6, r * 0.7, 0, C.white, 3);
          ellipse(g, x - r * 0.6, y - r * 0.35, r * 0.75, r * 0.6, 0, C.white, 3);
          ellipse(g, x + r * 0.45, y - r * 0.45, r * 0.85, r * 0.7, 0, C.white, 3);
          ellipse(g, x, y + r * 0.05, r * 1.5, r * 0.55, 0, C.white, 0);
          ellipse(g, x - r * 0.2, y - r * 0.2, r * 0.9, r * 0.5, 0, C.white, 0);
        }
        // far hills on the horizon
        for (let i = 0; i < 4; i++) ellipse(g, W * (i / 3), gy + L.u * 0.5, W * 0.3, L.u * (2.2 + (i % 2) * 1.2), 0, '#a6e486', 3);
        g.fillStyle = C.grass;
        g.fillRect(0, gy, W, H - gy);
        g.fillStyle = C.grassDark;
        g.fillRect(0, gy + (H - gy) * 0.45, W, (H - gy) * 0.25);
        g.lineWidth = 3;
        g.strokeStyle = C.ink;
        g.beginPath();
        g.moveTo(0, gy);
        g.lineTo(W, gy);
        g.stroke();
        // ---- perches ----
        for (const p of perches) {
          if (p.post) {
            rrect(g, p.x - p.w / 2, p.top, p.w, gy - p.top + 3, 3, C.dirt, 3);
            g.lineWidth = 2;
            g.strokeStyle = C.dirtDark;
            g.beginPath();
            g.moveTo(p.x - p.w * 0.15, p.top + s * 0.6);
            g.lineTo(p.x - p.w * 0.15, gy - s * 0.3);
            g.moveTo(p.x + p.w * 0.2, p.top + s * 1.2);
            g.lineTo(p.x + p.w * 0.2, Math.max(p.top + s * 1.3, gy - s * 1.2));
            g.stroke();
            rrect(g, p.x - p.w * 0.7, p.top - s * 0.15, p.w * 1.4, s * 0.4, 3, C.dirtDark, 3);
          } else {
            g.beginPath();
            g.ellipse(p.x, gy, p.w / 2, p.h, 0, Math.PI, 0);
            g.closePath();
            g.fillStyle = '#8fdc68';
            g.fill();
            g.lineWidth = 3;
            g.strokeStyle = C.ink;
            g.stroke();
            ellipse(g, p.x - p.w * 0.12, gy - p.h * 0.55, p.w * 0.12, p.h * 0.12, 0, '#b4ec93', 0);
          }
        }
        // ---- toast lying in the grass, smouldering ----
        for (const t of toasts) {
          if (!t.on || t.st !== 'down') continue;
          g.globalAlpha = clamp((1.6 - t.t) * 3, 0, 1);
          slice(g, t.x, t.y, s * 0.78, t.rot, 1);
          g.globalAlpha = 1;
        }
        // ---- rabbits ----
        for (const r of rabbits) if (r.on && r.st !== 'fly') drawRabbit(g, r, tm);
        drawToaster(g, tm);
        for (const q of puffs) {
          if (!q.on) continue;
          const k = q.life / q.max;
          g.globalAlpha = q.ember ? k : k * 0.55;
          circle(g, q.x, q.y, q.r * (q.ember ? 1 : 2 - k), q.ember ? '#ffb43d' : '#d9d3e0', 0);
        }
        g.globalAlpha = 1;
        for (const t of toasts) {
          if (!t.on || t.st !== 'fly') continue;
          flames(g, t.x, t.y, t.vx, t.vy, s * 0.75, tm + t.rot);
          slice(g, t.x, t.y, s * 0.78, t.rot);
        }
        for (const r of rabbits) if (r.on && r.st === 'fly') drawRabbit(g, r, tm);
        // ---- aim preview and the power meter ----
        if (tst.charging) {
          const v = speedFor(tst.p), vx = tst.dir * v * L.cos, vy = -v * L.sin;
          for (let i = 1; i <= 9; i++) {
            const t = (PREVIEW * i) / 9;
            g.globalAlpha = 1 - i / 14;
            circle(g, L.lx + vx * t, L.ly + vy * t + 0.5 * L.g * t * t, Math.max(3.5, s * 0.3) * (1 - i / 18), C.white, 2.5);
          }
          g.globalAlpha = 1;
        }
        const mw = Math.max(L.tw * 1.5, 64), mh = clamp((H - gy) * 0.3, 8, 15);
        const mx = clamp(L.tx - mw / 2, 8, W - mw - 8), my = gy + (H - gy) * 0.55 - mh / 2;
        rrect(g, mx, my, mw, mh, mh / 2, C.paper, 3);
        if (tst.p > 0.01) rrect(g, mx + 2, my + 2, Math.max(mh - 4, (mw - 4) * tst.p), mh - 4, (mh - 4) / 2, tst.p > 0.8 ? C.red : tst.p > 0.45 ? C.carrot : C.gold, 0);
        // ---- hints ----
        const hs = Math.max(14, Math.min(W, H) * 0.035);
        if (!tst.shots) {
          const msg = L.portrait ? (api.touch ? 'HOLD LEFT OR RIGHT, LET GO TO TOSS' : 'HOLD SPACE · ← → TO TURN') : api.touch ? 'HOLD, THEN LET GO TO TOSS!' : 'HOLD SPACE, LET GO TO TOSS!';
          g.globalAlpha = 0.75 + 0.25 * Math.sin(tm * 6);
          text(g, msg, W / 2, H * 0.06 + hs, Math.min(hs, (W * 0.9) / (msg.length * 0.55)), C.paper);
          g.globalAlpha = 1;
        } else if (streak >= 3) text(g, `ON FIRE ×${streak}`, W / 2, H * 0.06 + hs * 0.6, hs * 1.15, C.carrot);
      },
    };

    function drawRabbit(g, r, tm) {
      const s = L.s, K = KINDS[r.kind];
      const flying = r.st === 'fly';
      let sq = 0;
      if (r.st === 'sit') sq = Math.sin(r.age * 3 + r.x) * 0.03;
      else if (r.st === 'crouch') sq = 0.2;
      else if (r.st === 'hop') sq = r.t < 0.08 ? 0.15 : -0.12;
      if (r.st === 'balloon') {
        // the balloon and its string
        const bx = r.x + Math.sin(r.age * 1.7) * s * 0.3, by = r.y - s * 4.7;
        g.lineWidth = 2;
        g.strokeStyle = C.ink;
        g.beginPath();
        g.moveTo(r.x, r.y - s * 2.6);
        g.quadraticCurveTo(r.x + s * 0.4, r.y - s * 3.2, bx, by + s * 1.25);
        g.stroke();
        ellipse(g, bx, by, s * 1.1, s * 1.3, 0, C.red, 3);
        ellipse(g, bx - s * 0.35, by - s * 0.45, s * 0.22, s * 0.35, -0.4, 'rgba(255,255,255,0.7)', 0);
      }
      g.save();
      g.translate(r.x, r.y - s * 1.45);
      g.rotate(flying ? r.rot : r.st === 'balloon' ? Math.sin(r.age * 1.7) * 0.12 : 0);
      g.translate(0, s * 1.45);
      g.scale(1 + sq * 0.5, 1 - sq);
      const fur = flying && !K.golden ? TOASTED : K.golden ? C.gold : K.fur;
      const lw = Math.max(2, s * 0.11);
      if (r.st === 'balloon' || flying) {
        // dangling legs
        ellipse(g, -s * 0.35, -s * 0.12, s * 0.2, s * 0.32, 0.2, fur, lw);
        ellipse(g, s * 0.35, -s * 0.12, s * 0.2, s * 0.32, -0.2, fur, lw);
      } else {
        ellipse(g, -s * 0.42, -s * 0.12, s * 0.36, s * 0.17, 0, fur, lw);
        ellipse(g, s * 0.42, -s * 0.12, s * 0.36, s * 0.17, 0, fur, lw);
      }
      ellipse(g, 0, -s * 0.8, s * 0.72, s * 0.78, 0, fur, lw);
      ellipse(g, 0, -s * 0.68, s * 0.4, s * 0.48, 0, K.golden ? '#fff3a0' : C.white, 0);
      // paws: up in the air when scared, flying or holding the balloon
      const up = r.scared > 0 || flying || r.st === 'balloon' || r.st === 'hop';
      ellipse(g, -s * 0.62, up ? -s * 1.45 : -s * 0.85, s * 0.17, s * 0.25, up ? 0.5 : 0, fur, lw);
      ellipse(g, s * 0.62, up ? -s * 1.45 : -s * 0.85, s * 0.17, s * 0.25, up ? -0.5 : 0, fur, lw);
      const alarmed = flying || r.scared > 0 || r.st === 'hop' || r.st === 'balloon';
      rabbit(g, 0, -s * 2.0, s, {
        fur,
        golden: K.golden && !flying,
        angry: !alarmed,
        blink: flying ? 1 : r.blink < 0 ? 1 : 0,
        mouth: alarmed ? 'o' : 'teeth',
      });
      g.restore();
      if (flying) {
        for (let i = 0; i < 3; i++) {
          const a = tm * 9 + (i * Math.PI * 2) / 3;
          star(g, r.x + Math.cos(a) * s, r.y - s * 3.4 + Math.sin(a) * s * 0.3, s * 0.2, C.gold, 2);
        }
      } else if (K.golden && Math.sin(tm * 5 + r.x) > 0.6) star(g, r.x + s * 0.9, r.y - s * 3.2, s * 0.3, C.white, 2);
      if (r.st === 'crouch') text(g, '!', r.x + s * 1.1, r.y - s * 3.2, s * 1.1, C.gold);
    }

    function drawToaster(g, tm) {
      const { tw, th, u } = L;
      const ready = tst.reload <= 0;
      // squash as it pops, sink a little as it heats
      let sq = tst.popT < 0.18 ? -Math.sin((tst.popT / 0.18) * Math.PI) * 0.18 : 0;
      if (tst.charging) sq += tst.p * 0.06 + Math.sin(tm * 50) * 0.01 * tst.p;
      g.save();
      g.translate(L.tx, L.gy);
      g.scale(tst.dir, 1);
      g.rotate(tst.charging ? tst.p * 0.12 : 0);
      g.scale(1 + sq * 0.5, 1 - sq);
      // the slice waiting in the slot: pops up when reloaded, sinks while heating
      if (ready) {
        const k = clamp((tst.popT - RELOAD / Math.sqrt(lvl)) / 0.12, 0, 1);
        const rise = tst.held ? 0.05 : 0.4 * k + Math.sin(k * Math.PI) * 0.12;
        slice(g, 0, -th - L.s * 0.2 - th * rise + L.s * 0.5, L.s * 0.62, 0);
      }
      // feet
      rrect(g, -tw * 0.42, -u * 0.25, tw * 0.2, u * 0.3, 4, '#5b5566', 3);
      rrect(g, tw * 0.22, -u * 0.25, tw * 0.2, u * 0.3, 4, '#5b5566', 3);
      rrect(g, -tw / 2, -th - u * 0.12, tw, th, th * 0.32, CHROME, 3);
      rrect(g, -tw * 0.38, -th * 0.92, tw * 0.1, th * 0.6, tw * 0.05, 'rgba(255,255,255,0.8)', 0);
      // the slot glows hotter as the power climbs
      const heat = tst.charging ? tst.p : 0;
      rrect(g, -tw * 0.34, -th - u * 0.2, tw * 0.68, u * 0.32, u * 0.14, heat > 0.66 ? C.red : heat > 0.33 ? C.carrot : heat > 0 ? '#c0503a' : SLOT, 3);
      // lever at the back, pressed down while heating
      const ly = tst.held && ready ? -th * 0.32 : -th * 0.78;
      rrect(g, -tw / 2 - u * 0.3, ly - u * 0.14, u * 0.42, u * 0.28, u * 0.1, C.red, 3);
      // a little face, straining with effort
      const ey = -th * 0.5 - u * 0.12, lw = Math.max(2, u * 0.1);
      if (tst.charging && tst.p > 0.5) {
        g.lineWidth = lw;
        g.strokeStyle = C.ink;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-tw * 0.02, ey - u * 0.14);
        g.lineTo(tw * 0.1, ey);
        g.lineTo(-tw * 0.02, ey + u * 0.14);
        g.moveTo(tw * 0.34, ey - u * 0.14);
        g.lineTo(tw * 0.22, ey);
        g.lineTo(tw * 0.34, ey + u * 0.14);
        g.stroke();
      } else {
        ellipse(g, tw * 0.05, ey, u * 0.1, u * 0.15, 0, C.ink, 0);
        ellipse(g, tw * 0.3, ey, u * 0.1, u * 0.15, 0, C.ink, 0);
      }
      g.lineWidth = lw;
      g.strokeStyle = C.ink;
      g.beginPath();
      if (tst.charging) ellipse(g, tw * 0.18, ey + u * 0.42, u * 0.14, u * 0.1 + tst.p * u * 0.1, 0, C.ink, 0);
      else {
        g.arc(tw * 0.18, ey + u * 0.25, u * 0.2, 0.2, Math.PI - 0.2);
        g.stroke();
      }
      ellipse(g, -tw * 0.03, ey + u * 0.3, u * 0.1, u * 0.06, 0, 'rgba(255,111,168,0.5)', 0);
      ellipse(g, tw * 0.4, ey + u * 0.3, u * 0.1, u * 0.06, 0, 'rgba(255,111,168,0.5)', 0);
      g.restore();
    }

    layout();
    for (let i = 0; i < want; i++) spawn(true);
    return game;
  },
};
