// Permanent progress lives in localStorage. Storage can be unavailable (private mode), so every access is guarded.
const KEY = 'one-million-rabbits-v1';

const defaults = () => ({
  gold: 0,
  unlocked: ['gardener'],
  char: 'gardener',
  upgrades: {},
  muted: false,
  best: { kills: 0, wave: 0, time: 0, born: 0 },
  runs: 0,
  victories: 0,
  winsBy: {}, // survivor id -> wins
  ach: {}, // achievement id -> unlock time
  tips: {}, // tutorial tip id -> true once shown
  tipsOff: false,
  life: { kills: 0, bosses: 0, goldens: 0, fusions: [], mods: [] }, // lifetime tallies for achievements
  settings: defaultSettings(),
});
export const defaultSettings = () => ({ music: 0.7, sfx: 0.8, shake: true, numbers: true, quality: 'auto', haptics: true });

export let save = defaults();

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const loaded = JSON.parse(raw);
      const d = defaults();
      save = {
        ...d,
        ...loaded,
        best: { ...d.best, ...(loaded.best || {}) },
        life: { ...d.life, ...(loaded.life || {}) },
        settings: { ...defaultSettings(), ...(loaded.settings || {}) },
      };
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

// Wipes progress but keeps the player's settings (nobody wants their volume reset too).
export function resetSave() {
  const settings = save.settings;
  const fresh = defaults();
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, fresh, { settings });
  writeSave();
}

export const upgradeLevel = (id) => save.upgrades[id] || 0;
