// Carrot Catch: a grumpy gardener wearing a basket as a hat catches what falls out of the sky.
// Carrots are 1, golden ones 5 (they fall fast and wiggle), bomb bunnies cost 3 and stun him,
// and a masked carrot thief hops over, clings to the basket and munches your haul until you shake him off.
// Catches in a row build a combo that doubles, then triples, every carrot.
import { C, ellipse, circle, rrect, rabbit, carrot, star, text, rand, clamp } from './kit.js';

const PTS = { carrot: 1, golden: 5, bomb: -3 };
const COMBO2 = 8, COMBO3 = 20; // catches in a row for x2 and x3
const STUN = 0.9; // seconds the gardener sees stars after catching a bomb
const SHAKES = 3; // back-and-forth wiggles that throw the thief off
const MUNCH = 0.6, MUNCHES = 5; // the thief eats a carrot this often, this many times, then burps off
const SKIN = '#ffcf9e', WICKER = '#d99a4e', WICKER_DARK = '#a8692c', BOMB_FUR = '#5b5566';
const PILE = [[-0.26, 0.1, -0.35], [0.22, 0.05, 0.3], [-0.02, 0.12, 0.05], [0.33, 0.13, 0.5], [-0.36, 0.16, -0.55], [0.1, 0.2, 0.2], [-0.16, 0.22, -0.15]];

export default {
  id: 'catch',
  name: 'Carrot Catch',
  emoji: '🧺',
  blurb: 'It is raining carrots. Also bombs. Mostly carrots.',
  how: {
    touch: 'Drag anywhere to steer the basket, dodge bomb bunnies and wiggle off carrot thieves.',
    keys: '← → or A D (or the mouse) steer the basket; dodge bombs and wiggle off carrot thieves.',
  },
  duration: 25,
  stars: [15, 40, 70],
  unit: 'carrots',
  create(api) {
    // L is the layout, all in CSS pixels from api.W / api.H. Falling things store their x as a 0..1
    // fraction of the drop zone and their height as fall progress (1 = at the basket rim), so a resize
    // mid-game keeps everything where it was and the fall always takes the same time on any screen.
    const L = { bw: 0, bh: 0, s: 0, ts: 0, gh: 0, ground: 0, feet: 0, rim: 0, top: 0, landP: 0, minX: 0, maxX: 0, dropMin: 0, dropMax: 0, speed: 0, fs: 0 };
    const items = Array.from({ length: 28 }, () => ({ on: false, kind: 'carrot', u: 0, p: 0, rate: 0, t: 0, ph: 0, landed: false }));
    const basket = { x: 0, vx: 0, target: null, stun: 0, bounce: 1, pile: 0, gold: [false, false, false, false, false, false, false] };
    const thief = { st: 'off', x: 0, y: 0, t: 0, side: 1, vx: 0, vy: 0, rot: 0, munchT: 0, munches: 0, shakes: 0, lx: 0, ly: 0 };
    const clouds = [[0.12, 0.14, 1], [0.48, 0.08, 0.8], [0.8, 0.18, 1.15], [1.1, 0.1, 0.9]];
    const boom = { t: 1, x: 0, y: 0 };
    const lvl = api.level;
    let elapsed = 0, spawnT = 0.35, goldT = rand(3, 4), lastU = 0.5, combo = 0, dragging = false, dragged = false;
    let prevX = 0, segDir = 0, seg = 0, sky = null, skyH = 0;
    // thieves come twice a game, three times late in a run
    const thiefAt = [rand(6, 7.5), rand(14, 16)];
    if (lvl >= 1.5) thiefAt.push(rand(19.5, 20.5));

    function layout() {
      const W = api.W, H = api.H, fx = basket.x && L.maxX > L.minX ? (basket.x - L.minX) / (L.maxX - L.minX) : 0.5;
      L.bw = clamp(Math.min(W * 0.23, H * 0.28), 60, 140);
      L.bh = L.bw * 0.42;
      L.s = L.bw * 0.44;
      L.ts = L.bw * 0.2;
      L.gh = Math.min(L.bw * 0.72, H * 0.2);
      // the strip of lawn at the bottom is where a thumb can drag without hiding anything
      L.ground = H - clamp(H * 0.13, 30, 80);
      L.feet = L.ground + (H - L.ground) * 0.3;
      L.rim = L.feet - L.gh - L.bh;
      L.top = -L.s;
      L.landP = (L.ground + L.s * 0.2 - L.top) / (L.rim - L.top);
      L.minX = L.bw * 0.5;
      L.maxX = W - L.bw * 0.5;
      L.dropMin = L.bw * 0.4;
      L.dropMax = W - L.bw * 0.4;
      L.speed = Math.max(W * 0.95, L.bw * 5);
      L.fs = clamp(Math.min(W, H) * 0.055, 16, 30);
      basket.x = prevX = L.minX + clamp(fx, 0, 1) * (L.maxX - L.minX);
      if (basket.target !== null) basket.target = clamp(basket.target, L.minX, L.maxX);
    }
    layout();

    const itemX = (it) => {
      const x = L.dropMin + it.u * (L.dropMax - L.dropMin);
      return it.kind === 'golden' ? clamp(x + Math.sin(it.t * 7 + it.ph) * L.bw * 0.32, L.dropMin, L.dropMax) : x;
    };
    const itemY = (it) => L.top + it.p * (L.rim - L.top);

    function spawn(kind, fallTime) {
      const it = items.find((i) => !i.on);
      if (!it) return;
      it.on = true;
      it.kind = kind;
      it.p = 0;
      it.t = 0;
      it.ph = rand(0, 6.28);
      it.landed = false;
      it.rate = 1 / (kind === 'golden' ? fallTime * 0.66 : fallTime);
      if (kind === 'carrot') {
        // the next carrot is never further than a quick dash from the last one (on a wide screen, too)
        const jump = Math.min(0.45, (L.bw * 3.2) / (L.dropMax - L.dropMin));
        // bounce off the edges rather than piling up against them
        let u = lastU + rand(-jump, jump);
        if (u < 0 || u > 1) u = lastU - (u - lastU);
        it.u = lastU = clamp(u, 0, 1);
      } else if (kind === 'bomb') {
        // bombs like to fall right where the carrots are
        it.u = Math.random() < 0.45 ? clamp(lastU + rand(-0.18, 0.18), 0, 1) : rand(0, 1);
      } else {
        it.u = rand(0.1, 0.9);
      }
    }

    function float(str, x, y, color = C.white, k = 1) {
      api.pops.float(str, clamp(x, L.fs * 1.6, api.W - L.fs * 1.6), y, color, L.fs * k);
    }

    function catchIt(it, x) {
      it.on = false;
      basket.bounce = 0;
      if (it.kind === 'bomb') {
        game.score = Math.max(0, game.score + PTS.bomb);
        if (combo >= 5) float('COMBO LOST', x, L.rim - L.bw * 1.3, '#ff8a8a', 0.7);
        combo = 0;
        basket.stun = STUN;
        boom.t = 0;
        boom.x = x;
        boom.y = L.rim;
        api.shake(10);
        api.sfx('boom');
        api.pops.burst(x, L.rim, [C.carrot, '#ffe14d', '#3a3440'], 22, 340);
        float(`${PTS.bomb}`, x, L.rim - L.bw * 0.9, '#ff8a8a', 1.15);
        if (thief.st === 'cling') throwThief(false);
        return;
      }
      combo++;
      const mult = combo >= COMBO3 ? 3 : combo >= COMBO2 ? 2 : 1;
      const pts = PTS[it.kind] * mult;
      game.score += pts;
      if (basket.pile < 7) basket.gold[basket.pile] = it.kind === 'golden';
      basket.pile++;
      const gold = it.kind === 'golden';
      api.sfx(gold ? 'gold' : 'pickup', 1 + Math.min(combo, 25) * 0.025);
      api.pops.burst(x, L.rim, gold ? [C.gold, C.white, '#fff3a0'] : [C.carrot, C.white, C.leaf], gold ? 18 : 6, gold ? 300 : 180);
      float(`+${pts}`, x, L.rim - L.bw * 0.5, gold ? C.gold : mult > 1 ? '#ffe9a8' : C.white, gold ? 1.3 : 1);
      if (combo === COMBO2 || combo === COMBO3) {
        float(`×${mult} COMBO!`, api.W / 2, api.H * 0.3, C.gold, 1.4);
        api.sfx('sparkle');
      }
    }

    function land(it, x) {
      it.landed = true;
      it.t = 0;
      if (it.kind === 'bomb') {
        // a bomb that misses just fizzles in the grass
        it.on = false;
        api.sfx('pop');
        api.pops.burst(x, L.ground, ['#8a8496', '#c9c4d3', C.white], 8, 160);
        return;
      }
      api.sfx('dig');
      if (combo >= 5) float('COMBO LOST', x, L.ground - L.bw * 0.4, '#ff8a8a', 0.7);
      combo = 0;
    }

    function throwThief(earned) {
      thief.st = 'fly';
      thief.t = 0;
      thief.vx = thief.side * L.bw * 5;
      thief.vy = -L.bw * 6;
      api.sfx('wind');
      api.sfx('squeak');
      api.pops.burst(thief.x, thief.y, [C.hare, C.white], 8, 220);
      if (earned) {
        game.score += 2;
        float('SHOO! +2', thief.x, thief.y - L.bw * 0.6, C.white, 1);
      }
    }

    function updateThief(dt) {
      const T = thief;
      T.t += dt;
      const hopH = L.bw * 0.22, sp = Math.max(api.W * 0.32, L.bw * 2.4);
      if (T.st === 'hop' || T.st === 'leave') {
        const dir = T.st === 'leave' ? T.side : Math.sign(basket.x - T.x) || 1;
        T.side = dir;
        T.x += dir * sp * (T.st === 'leave' ? 1.3 : 1) * dt;
        const y = L.feet - L.ts * 1.2 - Math.abs(Math.sin(T.t * 7)) * hopH;
        // dropping down off the basket first, when he leaves from it
        T.y = T.st === 'leave' && T.t < 0.3 ? T.ly + (y - T.ly) * (T.t / 0.3) : y;
        if (T.st === 'leave' && (T.x < -L.bw || T.x > api.W + L.bw)) T.st = 'off';
        else if (T.st === 'hop' && T.t > 7) {
          // gave up chasing you
          T.st = 'leave';
          T.t = 0;
          T.ly = T.y;
          T.side = T.x < api.W / 2 ? -1 : 1;
          float('PFFT', T.x, T.y - L.bw * 0.5, C.white, 0.8);
        } else if (T.st === 'hop' && Math.abs(basket.x - T.x) < L.bw * 0.45) {
          T.st = 'leap';
          T.t = 0;
          T.side = T.x < basket.x ? -1 : 1;
          T.lx = T.x;
          T.ly = T.y;
          api.sfx('squeak');
        }
      } else if (T.st === 'leap' || T.st === 'cling') {
        // he hangs off whichever side of the basket is still on screen
        if (basket.x + T.side * L.bw * 0.55 < L.ts || basket.x + T.side * L.bw * 0.55 > api.W - L.ts) T.side = -T.side;
        const cx = basket.x + T.side * L.bw * 0.55, cy = L.rim + L.bh * 0.1;
        if (T.st === 'leap') {
          const k = clamp(T.t / 0.25, 0, 1);
          T.x = T.lx + (cx - T.lx) * k;
          T.y = T.ly + (cy - T.ly) * k - Math.sin(k * Math.PI) * L.bw * 0.5;
          if (k >= 1) {
            T.st = 'cling';
            T.t = T.munchT = 0;
            T.munches = T.shakes = 0;
            segDir = seg = 0;
          }
        } else {
          T.x = cx;
          T.y = cy;
          T.munchT += dt;
          if (T.munchT >= MUNCH) {
            T.munchT = 0;
            T.munches++;
            if (game.score > 0) {
              game.score--;
              basket.pile = Math.max(0, basket.pile - 1);
              float('-1 NOM', T.x, T.y - L.bw * 0.55, '#ff8a8a', 0.8);
              api.sfx('eep');
            }
            if (T.munches >= MUNCHES) {
              T.st = 'leave';
              T.t = 0;
              T.ly = T.y;
              T.side = T.x < api.W / 2 ? -1 : 1;
              float('BURP', T.x, T.y - L.bw * 0.6, C.white, 1);
              api.sfx('kazoo');
            }
          }
        }
      } else if (T.st === 'fly') {
        T.x += T.vx * dt;
        T.vy += api.H * 3.5 * dt;
        T.y += T.vy * dt;
        T.rot += T.side * 12 * dt;
        if (T.y > api.H + L.bw || T.x < -L.bw * 2 || T.x > api.W + L.bw * 2) T.st = 'off';
      }
    }

    const game = {
      score: 0,
      finished: false,
      resize: layout,
      update(dt) {
        elapsed += dt;
        const prog = clamp(elapsed / 25, 0, 1), speedUp = 1 + (lvl - 1) * 0.35;
        const fallTime = (2.05 - prog * 0.5) / speedUp;
        // spawning
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = ((0.62 - prog * 0.18) / speedUp) * rand(0.8, 1.2);
          spawn(Math.random() < 0.16 + prog * 0.12 ? 'bomb' : 'carrot', fallTime);
        }
        goldT -= dt;
        if (goldT <= 0) {
          goldT = rand(4.2, 5.6);
          spawn('golden', fallTime);
        }
        if (thiefAt.length && elapsed >= thiefAt[0] && thief.st === 'off') {
          thiefAt.shift();
          thief.st = 'hop';
          thief.t = 0;
          thief.rot = 0;
          // from the far side, so you see him coming
          thief.x = basket.x > api.W / 2 ? -L.bw * 0.5 : api.W + L.bw * 0.5;
          float('THIEF!', thief.x < 0 ? api.W * 0.2 : api.W * 0.8, L.ground - L.bw * 1.6, '#ff8a8a', 1.1);
          api.sfx('kazoo');
        }

        // moving: held keys win, then the finger / mouse target
        const k = api.keys;
        const dir = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
        basket.stun = Math.max(0, basket.stun - dt);
        if (basket.stun > 0) basket.vx = 0;
        else if (dir) {
          basket.target = null;
          basket.vx += (dir * L.speed - basket.vx) * Math.min(1, dt * 16);
          basket.x += basket.vx * dt;
        } else if (basket.target !== null) {
          const nx = basket.x + (basket.target - basket.x) * Math.min(1, dt * 22);
          basket.vx = (nx - basket.x) / Math.max(dt, 1e-3);
          basket.x = nx;
        } else {
          basket.vx *= Math.max(0, 1 - dt * 14);
          basket.x += basket.vx * dt;
        }
        basket.x = clamp(basket.x, L.minX, L.maxX);
        basket.bounce = Math.min(1, basket.bounce + dt * 5);

        // shaking off a clinging thief: count direction changes of a decent swing
        const dx = basket.x - prevX;
        prevX = basket.x;
        if (thief.st === 'cling' && Math.abs(dx) > 0.3) {
          const d = Math.sign(dx);
          if (d === segDir) seg += Math.abs(dx);
          else {
            if (segDir && seg >= L.bw * 0.16) {
              thief.shakes++;
              api.sfx('squeak');
              if (thief.shakes >= SHAKES) throwThief(true);
            }
            segDir = d;
            seg = Math.abs(dx);
          }
        }

        // falling things
        for (const it of items) {
          if (!it.on) continue;
          it.t += dt;
          if (it.landed) {
            if (it.t > 1.2) it.on = false;
            continue;
          }
          const before = it.p;
          it.p += it.rate * dt;
          const x = itemX(it);
          if (before < 1 && it.p >= 1 && Math.abs(x - basket.x) < L.bw * 0.5 + L.s * 0.18) catchIt(it, x);
          else if (it.p >= L.landP) land(it, x);
        }
        updateThief(dt);
        boom.t += dt;
      },
      down(x) {
        dragging = dragged = true;
        basket.target = clamp(x, L.minX, L.maxX);
      },
      move(x) {
        // a finger steers while it's down; a mouse steers just by hovering
        if (dragging || !api.touch) basket.target = clamp(x, L.minX, L.maxX);
      },
      up() {
        dragging = false;
      },
      draw(g) {
        const W = api.W, H = api.H, t = elapsed;
        // sky, clouds and far hills
        if (!sky || skyH !== H) {
          sky = g.createLinearGradient(0, 0, 0, L.ground);
          sky.addColorStop(0, '#6cc4ff');
          sky.addColorStop(1, '#c8ecff');
          skyH = H;
        }
        g.fillStyle = sky;
        g.fillRect(0, 0, W, H);
        for (const [cx, cy, k] of clouds) {
          const r = Math.min(W, H) * 0.06 * k, x = ((cx * W + t * 12 * k) % (W + r * 6)) - r * 2, y = cy * H;
          ellipse(g, x, y, r * 1.6, r * 0.8, 0, C.white, 0);
          circle(g, x - r * 0.6, y - r * 0.35, r * 0.7, C.white, 0);
          circle(g, x + r * 0.4, y - r * 0.5, r * 0.85, C.white, 0);
        }
        ellipse(g, W * 0.2, L.ground + H * 0.02, W * 0.45, H * 0.16, 0, '#9fe07a', 3);
        ellipse(g, W * 0.85, L.ground + H * 0.03, W * 0.4, H * 0.12, 0, '#9fe07a', 3);
        // the lawn strip
        g.fillStyle = C.grass;
        g.fillRect(0, L.ground, W, H - L.ground);
        g.fillStyle = C.grassDark;
        const sw = Math.max(30, W / 14);
        for (let x = 0; x < W; x += sw * 2) g.fillRect(x, L.ground, sw, H - L.ground);
        g.lineWidth = 3;
        g.strokeStyle = C.ink;
        g.beginPath();
        g.moveTo(0, L.ground);
        g.lineTo(W, L.ground);
        g.stroke();
        if (api.touch && !dragged) {
          g.globalAlpha = 0.55 + 0.25 * Math.sin(t * 5);
          text(g, '◀  DRAG HERE  ▶', W / 2, (L.ground + H) / 2 + (H - L.ground) * 0.1, Math.max(13, L.fs * 0.7), C.paper);
          g.globalAlpha = 1;
        }

        // missed carrots lying in the lawn, fading
        for (const it of items) {
          if (!it.on || !it.landed) continue;
          g.globalAlpha = clamp((1.2 - it.t) * 2, 0, 1);
          // lying on its side in the grass where it landed
          carrot(g, itemX(it) - L.s * 0.5, L.ground + (api.H - L.ground) * 0.3, L.s, -Math.PI / 2 + (it.ph - 3) * 0.08, it.kind === 'golden');
          g.globalAlpha = 1;
        }

        drawGardener(g);
        drawThief(g);

        // falling things
        for (const it of items) {
          if (!it.on || it.landed) continue;
          const x = itemX(it), y = itemY(it);
          if (it.kind === 'bomb') {
            rabbit(g, x, y, L.s * 0.5, { fur: BOMB_FUR, bomb: true, rot: Math.sin(it.t * 4 + it.ph) * 0.5, mouth: 'o' });
          } else if (it.kind === 'golden') {
            circle(g, x, y, L.s * 0.75, 'rgba(255,232,120,0.4)', 0);
            carrot(g, x, y - L.s * 0.55, L.s * 1.1, Math.sin(it.t * 7 + it.ph) * 0.4, true);
            for (let i = 0; i < 3; i++) {
              const a = it.t * 5 + (i * Math.PI * 2) / 3;
              star(g, x + Math.cos(a) * L.s * 0.7, y + Math.sin(a) * L.s * 0.5, L.s * (0.12 + 0.05 * Math.sin(it.t * 12 + i)), C.white, 1.5);
            }
          } else {
            carrot(g, x, y - L.s * 0.5, L.s, Math.sin(it.t * 3 + it.ph) * 0.3);
          }
        }

        // the bomb's cartoon explosion
        if (boom.t < 0.4) {
          const k = boom.t / 0.4, r = L.bw * (0.5 + k * 0.5);
          g.globalAlpha = 1 - k * k;
          burst(g, boom.x, boom.y - L.bh * 0.3, r, C.carrot);
          burst(g, boom.x, boom.y - L.bh * 0.3, r * 0.6, '#ffe14d');
          text(g, 'BOOM!', boom.x, boom.y - L.bh * 0.3, r * 0.45, C.white);
          g.globalAlpha = 1;
        }

        // combo meter and the shake prompt
        if (combo >= 3) {
          const mult = combo >= COMBO3 ? 3 : combo >= COMBO2 ? 2 : 1;
          const next = combo >= COMBO3 ? '' : ` (${(combo >= COMBO2 ? COMBO3 : COMBO2) - combo} to ×${mult + 1})`;
          text(g, `COMBO ${combo}${mult > 1 ? ` ×${mult}` : ''}`, W / 2, L.fs * 1.1, L.fs * (mult > 1 ? 1.05 : 0.9), mult > 2 ? C.pink : mult > 1 ? C.gold : C.white);
          if (next) text(g, next.trim(), W / 2, L.fs * 2.05, L.fs * 0.55, C.paper);
        }
        if (thief.st === 'cling') {
          const y = L.rim - L.bw * 0.95, wob = Math.sin(t * 18) * L.bw * 0.08;
          text(g, 'SHAKE IT!', clamp(basket.x + wob, L.fs * 3, W - L.fs * 3), y, L.fs * 0.95, '#ff8a8a');
          for (let i = 0; i < SHAKES; i++) circle(g, clamp(basket.x, L.fs * 3, W - L.fs * 3) + (i - 1) * L.fs * 0.8, y + L.fs * 0.85, L.fs * 0.22, i < thief.shakes ? C.gold : C.paper, 2);
        }
      },
    };

    // A jagged cartoon explosion.
    function burst(g, x, y, r, fill) {
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8 + boom.t * 2, rr = i % 2 ? r * 0.62 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = C.ink;
      g.stroke();
    }

    // The gardener: boots, overalls, a grumpy moustache and a basket worn as a hat, held up with both hands.
    function drawGardener(g) {
      const x = basket.x, bw = L.bw, bh = L.bh, gh = L.gh, feet = L.feet;
      const stun = basket.stun > 0, sooty = stun ? '#4a4048' : null;
      const sq = 1 - (1 - basket.bounce) * 0.12; // the basket dips when something lands in it
      const lean = clamp(basket.vx / L.speed, -1, 1) * 0.08 + (stun ? Math.sin(elapsed * 30) * 0.05 : 0);
      const lw = Math.max(2, bw * 0.03);
      g.save();
      g.translate(x, feet);
      g.rotate(lean);
      // shadow, boots, legs
      ellipse(g, 0, 0, bw * 0.42, bw * 0.08, 0, 'rgba(43,29,58,0.25)', 0);
      const step = Math.sin(elapsed * 18) * clamp(Math.abs(basket.vx) / L.speed, 0, 1) * gh * 0.05;
      rrect(g, -gh * 0.2, -gh * 0.3 - step, gh * 0.16, gh * 0.3, 3, '#3d74c4', lw);
      rrect(g, gh * 0.04, -gh * 0.3 + step, gh * 0.16, gh * 0.3, 3, '#3d74c4', lw);
      ellipse(g, -gh * 0.14, -step, gh * 0.15, gh * 0.07, 0, '#5a3a22', lw);
      ellipse(g, gh * 0.14, step, gh * 0.15, gh * 0.07, 0, '#5a3a22', lw);
      // overalls over a red shirt
      const bodyTop = -gh * 0.62, headR = gh * 0.2, headY = -gh + headR * 0.95;
      rrect(g, -gh * 0.27, bodyTop, gh * 0.54, gh * 0.36, gh * 0.1, sooty || C.red, lw);
      rrect(g, -gh * 0.22, bodyTop + gh * 0.08, gh * 0.44, gh * 0.3, gh * 0.06, sooty || C.blue, lw);
      // a carrot in the bib pocket, naturally
      carrot(g, gh * 0.09, bodyTop + gh * 0.1, gh * 0.16, 0.2);
      // arms up holding the basket
      g.lineCap = 'round';
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * gh * 0.22, bodyTop + gh * 0.06);
        g.quadraticCurveTo(sx * bw * 0.48, bodyTop - gh * 0.05, sx * bw * 0.4, -gh - bh * 0.25);
        g.strokeStyle = C.ink;
        g.lineWidth = gh * 0.11 + lw * 2;
        g.stroke();
        g.strokeStyle = sooty || C.red;
        g.lineWidth = gh * 0.11;
        g.stroke();
        circle(g, sx * bw * 0.4, -gh - bh * 0.25, gh * 0.07, sooty || SKIN, lw);
      }
      // the grumpy head
      const face = stun ? '#6b5a55' : thief.st === 'cling' ? '#ff9f8a' : SKIN;
      circle(g, 0, headY, headR, face, lw);
      ellipse(g, 0, headY + headR * 0.15, headR * 0.22, headR * 0.18, 0, '#ff9f80', lw * 0.7);
      ellipse(g, -headR * 0.28, headY + headR * 0.45, headR * 0.32, headR * 0.14, -0.3, '#7a4a2a', lw * 0.7);
      ellipse(g, headR * 0.28, headY + headR * 0.45, headR * 0.32, headR * 0.14, 0.3, '#7a4a2a', lw * 0.7);
      g.strokeStyle = C.ink;
      g.lineWidth = lw * 1.1;
      g.beginPath();
      if (stun) {
        // x_x
        for (const sx of [-1, 1]) {
          const ex = sx * headR * 0.38, ey = headY - headR * 0.2, e = headR * 0.13;
          g.moveTo(ex - e, ey - e);
          g.lineTo(ex + e, ey + e);
          g.moveTo(ex + e, ey - e);
          g.lineTo(ex - e, ey + e);
        }
      } else {
        g.moveTo(-headR * 0.62, -headR * 0.5 + headY);
        g.lineTo(-headR * 0.18, -headR * 0.32 + headY);
        g.moveTo(headR * 0.62, -headR * 0.5 + headY);
        g.lineTo(headR * 0.18, -headR * 0.32 + headY);
      }
      g.stroke();
      if (!stun) {
        circle(g, -headR * 0.36, headY - headR * 0.12, headR * 0.1, C.ink, 0);
        circle(g, headR * 0.36, headY - headR * 0.12, headR * 0.1, C.ink, 0);
      }
      g.restore();

      // the basket rides on his head (not rotated, so the catch zone is always level)
      g.save();
      g.translate(x, L.rim + bh);
      g.scale(1 + (1 - sq), sq);
      const top = -bh;
      ellipse(g, 0, top, bw * 0.5, bw * 0.12, 0, '#5c3a1c', lw);
      // the haul pokes out of the top
      for (let i = 0; i < Math.min(7, basket.pile); i++) {
        const [px, py, rot] = PILE[i];
        carrot(g, px * bw, top - py * bw * 0.7 - bw * 0.02, L.s * 0.85, rot * 0.5, basket.gold[i]);
      }
      g.beginPath();
      g.moveTo(-bw * 0.5, top);
      g.lineTo(bw * 0.5, top);
      g.lineTo(bw * 0.38, 0);
      g.quadraticCurveTo(0, bh * 0.12, -bw * 0.38, 0);
      g.closePath();
      g.fillStyle = sooty || WICKER;
      g.fill();
      // weave
      g.save();
      g.clip();
      g.strokeStyle = stun ? '#2e272c' : WICKER_DARK;
      g.lineWidth = lw;
      g.beginPath();
      for (let i = 1; i < 3; i++) {
        g.moveTo(-bw * 0.5, top + (bh * i) / 3);
        g.lineTo(bw * 0.5, top + (bh * i) / 3);
      }
      for (let i = -4; i <= 4; i++) {
        g.moveTo((i * bw) / 9, top);
        g.lineTo((i * bw) / 11, 0);
      }
      g.stroke();
      g.restore();
      g.lineWidth = lw;
      g.strokeStyle = C.ink;
      g.stroke();
      // the front of the rim
      g.beginPath();
      g.ellipse(0, top, bw * 0.5, bw * 0.12, 0, 0, Math.PI);
      g.lineWidth = bw * 0.07;
      g.strokeStyle = C.ink;
      g.stroke();
      g.lineWidth = bw * 0.045;
      g.strokeStyle = sooty || '#e9b56b';
      g.stroke();
      g.restore();

      // seeing stars
      if (stun) {
        for (let i = 0; i < 3; i++) {
          const a = elapsed * 7 + (i * Math.PI * 2) / 3;
          star(g, x + Math.cos(a) * bw * 0.45, L.rim - bw * 0.25 + Math.sin(a) * bw * 0.1, bw * 0.08, C.gold, 2);
        }
      }
    }

    // The carrot thief: a hare in a bandit mask.
    function drawThief(g) {
      const T = thief;
      if (T.st === 'off') return;
      const s = L.ts, x = T.x, y = T.y;
      const wob = T.st === 'cling' ? Math.sin(elapsed * 25) * (0.08 + T.shakes * 0.08) : 0;
      const face = T.st === 'leap' || T.st === 'fly' ? 0 : T.side;
      g.save();
      g.translate(x, y);
      g.rotate(T.rot + wob + (T.st === 'cling' ? -T.side * 0.35 : 0));
      // body and feet
      ellipse(g, 0, s * 1.05, s * 0.75, s * 0.7, 0, C.hare, Math.max(2, s * 0.11));
      ellipse(g, -s * 0.4, s * 1.7, s * 0.32, s * 0.16, 0, C.hare, Math.max(2, s * 0.1));
      ellipse(g, s * 0.4, s * 1.7, s * 0.32, s * 0.16, 0, C.hare, Math.max(2, s * 0.1));
      rabbit(g, 0, 0, s, { fur: C.hare, squash: T.st === 'cling' ? Math.abs(Math.sin(elapsed * 14)) * 0.1 : 0, mouth: T.st === 'fly' ? 'o' : 'teeth' });
      // the bandit mask, tied at the back
      rrect(g, -s * 0.72, -s * 0.28, s * 1.44, s * 0.36, s * 0.16, C.ink, 0);
      circle(g, -s * 0.34 + face * s * 0.06, -s * 0.1, s * 0.1, C.white, 0);
      circle(g, s * 0.34 + face * s * 0.06, -s * 0.1, s * 0.1, C.white, 0);
      // munching (or making off with) a carrot
      if (T.st === 'cling' || T.st === 'leave') carrot(g, s * 0.1, s * 0.35, s * 0.9, -1.2 + Math.sin(elapsed * 16) * 0.15);
      g.restore();
      if (T.st === 'hop' && (x < 0 || x > api.W)) text(g, '!', clamp(x, L.fs, api.W - L.fs), y, L.fs * 1.4, '#ff8a8a');
    }

    return game;
  },
};
