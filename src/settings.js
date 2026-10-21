import { G } from './core.js';
import { save, writeSave } from './save.js';
import { setVolumes, setMuted, initAudio, sfx } from './audio.js';
import { resetTips } from './tutorial.js';
import { canFullscreen, isFullscreen, toggleFullscreen } from './pwa.js';

// The settings screen. Every change is saved right away; quality needs a restart to take effect.
const $ = (id) => document.getElementById(id);
export const canVibrate = () => typeof navigator.vibrate === 'function';

const SWITCHES = {
  setMute: { get: () => !save.muted, set: (v) => { save.muted = !v; setMuted(save.muted); } },
  setShake: { get: () => save.settings.shake, set: (v) => (save.settings.shake = v) },
  setNumbers: { get: () => save.settings.numbers, set: (v) => (save.settings.numbers = v) },
  setHaptics: { get: () => save.settings.haptics, set: (v) => { save.settings.haptics = v; if (v) vibrate(30); } },
  setTips: { get: () => !save.tipsOff, set: (v) => (save.tipsOff = !v) },
  setFs: { get: isFullscreen, set: () => toggleFullscreen() },
};

export function vibrate(ms) {
  if (!save.settings.haptics || !canVibrate()) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* some hosts throw instead of ignoring */
  }
}

// Settings that live outside the settings object get mirrored onto the page.
export function applySettings() {
  document.body.classList.toggle('no-numbers', !save.settings.numbers);
  setVolumes(save.settings.music, save.settings.sfx);
}

export function renderSettings() {
  for (const id in SWITCHES) $(id).setAttribute('aria-checked', String(!!SWITCHES[id].get()));
  for (const [id, key] of [['setMusic', 'music'], ['setSfx', 'sfx']]) {
    const v = Math.round(save.settings[key] * 100);
    $(id).value = v;
    $(id + 'Out').textContent = v + '%';
    $(id).style.setProperty('--fill', v + '%');
  }
  $('hapticsRow').hidden = !(canVibrate() && G.touch);
  $('fsRow').hidden = !canFullscreen();
  for (const b of $('setQuality').children) b.setAttribute('aria-checked', String(b.dataset.q === save.settings.quality));
  $('qualityNote').hidden = save.settings.quality === G.bootQuality;
}

export function bindSettings({ onReset, onChange }) {
  const changed = () => {
    writeSave();
    applySettings();
    renderSettings();
    onChange?.();
  };
  for (const id in SWITCHES) {
    $(id).onclick = () => {
      initAudio();
      SWITCHES[id].set(!SWITCHES[id].get());
      changed();
      // fullscreen flips asynchronously
      if (id === 'setFs') setTimeout(renderSettings, 300);
    };
  }
  for (const [id, key] of [['setMusic', 'music'], ['setSfx', 'sfx']]) {
    $(id).oninput = () => {
      initAudio();
      save.settings[key] = $(id).value / 100;
      changed();
    };
    $(id).onchange = () => key === 'sfx' && sfx('pickup');
  }
  for (const b of $('setQuality').children) {
    b.onclick = () => {
      save.settings.quality = b.dataset.q;
      changed();
    };
  }
  $('reloadBtn').onclick = () => location.reload();
  $('replayTips').onclick = () => {
    resetTips();
    renderSettings();
    $('replayTips').textContent = 'they\'re back!';
  };
  $('resetBtn').onclick = onReset;
  document.addEventListener('fullscreenchange', renderSettings);
}
