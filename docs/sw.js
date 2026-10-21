// Offline support: keeps a copy of the game so an installed beta still runs on a plane.
// The game page is fetched network-first (testers always get the newest build when online),
// everything else cache-first. scripts/postbuild.js stamps BUILD with a hash of the build.
const BUILD = '40574a99a5';
const CACHE = 'omr-' + BUILD;
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('omr-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put('./index.html', res.clone());
    return res;
  } catch {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // fonts come back opaque (status 0) from another origin; they're still fine to keep
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') e.respondWith(networkFirst(req));
  else if (url.origin === location.origin || FONTS.test(req.url)) e.respondWith(cacheFirst(req));
});
