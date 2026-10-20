// Permanent progress lives in localStorage. Storage can be unavailable (private mode), so every access is guarded.
const KEY = 'one-million-rabbits-v1';

const defaults = () => ({
  gold: 0,
  unlocked: ['gardener'],
  char: 'gardener',
  upgrades: {},
  muted: false,
  best: { kills: 0, wave: 0, time: 0 },
  runs: 0,
  settings: defaultSettings(),
});
export const defaultSettings = () => ({ music: 0.7, sfx: 0.8, shake: true, numbers: true, quality: 'auto', haptics: true });

export let save = defaults();

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const loaded = JSON.parse(raw);
      save = { ...defaults(), ...loaded, settings: { ...defaultSettings(), ...(loaded.settings || {}) } };
    }
  } catch {
    save = defaults();
  }
  return save;
}

export function writeSave() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage blocked: progress lasts for this session only */
  }
}

export const upgradeLevel = (id) => save.upgrades[id] || 0;
