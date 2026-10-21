// Install-to-home-screen, offline play and fullscreen. Everything here is optional:
// on file://, in sandboxed iframes or old browsers it quietly does nothing.
const web = /^https?:$/.test(location.protocol);
let installEvt = null;
let onInstallable = () => {};

export function initPwa() {
  if (!web) return;
  // added from script so a double-clicked file:// copy doesn't log failed fetches
  for (const [rel, href] of [['manifest', './manifest.webmanifest'], ['apple-touch-icon', './icons/icon-180.png']]) {
    const l = document.createElement('link');
    l.rel = rel;
    l.href = href;
    document.head.appendChild(l);
  }
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvt = e;
    onInstallable(true);
  });
  addEventListener('appinstalled', () => {
    installEvt = null;
    onInstallable(false);
  });
  if (!import.meta.env.PROD) return;
  try {
    if ('serviceWorker' in navigator) {
      const reg = () => navigator.serviceWorker.register('./sw.js').catch(() => {});
      if (document.readyState === 'complete') reg();
      else addEventListener('load', reg);
    }
  } catch {
    /* service workers blocked here (sandboxed frame, privacy mode) */
  }
}

export const whenInstallable = (fn) => {
  onInstallable = fn;
  if (installEvt) fn(true);
};
export async function promptInstall() {
  if (!installEvt) return;
  installEvt.prompt();
  try {
    await installEvt.userChoice;
  } catch {
    /* dismissed */
  }
  installEvt = null;
  onInstallable(false);
}

// iPhones have no fullscreen API for pages; there the button stays hidden.
export const canFullscreen = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
export const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
export async function toggleFullscreen() {
  try {
    if (isFullscreen()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const el = document.documentElement;
      await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    }
  } catch {
    /* refused (no user gesture, or the host forbids it) */
  }
}
