import { G } from './core.js';

// Keyboard (WASD / arrows) + a floating touch joystick that appears wherever you press.
export const input = { x: 0, z: 0, ult: false, pause: false };

const keys = new Set();
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
let joyEl, knobEl;
// Stick feel, in CSS pixels: the knob travels up to TRAVEL, full speed is reached at FULL,
// and nothing happens inside DEAD so a resting thumb doesn't drift.
const TRAVEL = 50, FULL = 38, DEAD = 7;

export function initInput(canvas) {
  joyEl = document.getElementById('joy');
  knobEl = document.getElementById('joyKnob');

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if ((k === ' ' || k === 'e' || k === 'q') && G.state === 'playing') input.ult = true;
    if (k === 'escape' || k === 'p') input.pause = true;
    // stop arrows and space from scrolling the page mid-run, but leave menus (sliders, buttons) alone
    const menu = G.state === 'menu' || G.state === 'paused' || G.state === 'gameover' || G.state === 'victory';
    if ((k.startsWith('arrow') || k === ' ') && !menu) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  const start = (e) => {
    // during the resume countdown you can already put your thumb down
    if ((G.state !== 'playing' && G.state !== 'countdown') || joy.id !== null) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    joy.id = e.changedTouches ? t.identifier : 'mouse';
    joy.ox = joy.x = t.clientX;
    joy.oy = joy.y = t.clientY;
    joyEl.style.left = joy.ox + 'px';
    joyEl.style.top = joy.oy + 'px';
    joyEl.classList.add('on');
    knobEl.style.transform = '';
    e.preventDefault();
  };
  const move = (e) => {
    if (joy.id === null) return;
    const list = e.changedTouches ? [...e.changedTouches] : [e];
    for (const t of list) {
      if ((e.changedTouches ? t.identifier : 'mouse') !== joy.id) continue;
      joy.x = t.clientX;
      joy.y = t.clientY;
      let dx = joy.x - joy.ox, dy = joy.y - joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > TRAVEL) {
        // drag the base along so the stick never feels stuck
        joy.ox += (dx / d) * (d - TRAVEL);
        joy.oy += (dy / d) * (d - TRAVEL);
        joyEl.style.left = joy.ox + 'px';
        joyEl.style.top = joy.oy + 'px';
        dx = joy.x - joy.ox;
        dy = joy.y - joy.oy;
      }
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    e.preventDefault();
  };
  const end = (e) => {
    if (joy.id === null) return;
    const list = e.changedTouches ? [...e.changedTouches] : [e];
    for (const t of list) {
      if ((e.changedTouches ? t.identifier : 'mouse') === joy.id) {
        joy.id = null;
        joyEl.classList.remove('on');
      }
    }
  };
  canvas.addEventListener('touchstart', start, { passive: false });
  addEventListener('touchmove', move, { passive: false });
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
  // mouse drag works as a joystick too (handy for testing touch controls on a laptop)
  canvas.addEventListener('mousedown', start);
  addEventListener('mousemove', move);
  addEventListener('mouseup', end);
  // a long press shouldn't open a context menu or select anything mid-run
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function resetJoystick() {
  joy.id = null;
  joyEl?.classList.remove('on');
}

export function readInput() {
  let x = 0, z = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) z -= 1;
  if (keys.has('s') || keys.has('arrowdown')) z += 1;
  if (joy.id !== null) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > DEAD) {
      // ramp from zero at the dead zone edge, so slow walking is possible without a jump
      const m = Math.min(1, (d - DEAD) / (FULL - DEAD));
      x += (dx / d) * m;
      z += (dy / d) * m;
    }
  }
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  input.x = x;
  input.z = z;
}
