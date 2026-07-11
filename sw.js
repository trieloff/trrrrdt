/* eslint-disable no-restricted-globals */
/*
 * TRRRRDT service worker — the site's "offline mode" shell.
 *
 * Scope is the whole origin, but the footprint is deliberately small: it only
 * caches the assets the TP1 offline player needs (its page, the player + three.js
 * code, the model, shared styles/fonts/icons) and passes everything else straight
 * to the network. Song audio is NOT handled here — that lives in IndexedDB and is
 * played from blob URLs, so playback never touches this worker.
 *
 * Bump CACHE when the shell changes to retire the old cache.
 */
const CACHE = 'trrrrdt-shell-v1';

// Best-effort precache: the offline home + its critical code. Missing entries
// (e.g. before the /tp1 page is authored) don't fail the install.
const CORE = [
  '/tp1',
  '/scripts/aem.js',
  '/scripts/scripts.js',
  '/scripts/player/offline.js',
  '/scripts/player/audio.js',
  '/scripts/player/visualizer.js',
  '/scripts/vendor/three.module.min.js',
  '/scripts/vendor/GLTFLoader.js',
  '/scripts/vendor/RoomEnvironment.js',
  '/blocks/tp1/tp1.js',
  '/blocks/tp1/tp1.css',
  '/models/tp1.glb',
  '/styles/styles.css',
  '/styles/lazy-styles.css',
  '/styles/fonts.css',
  '/manifest.webmanifest',
];

// same-origin paths whose successful GETs we cache (and serve offline)
const CACHEABLE = [
  '/scripts/',
  '/blocks/tp1/',
  '/blocks/turntable/patterns/',
  '/models/',
  '/styles/',
  '/fonts/',
  '/icons/',
  '/manifest.webmanifest',
  '/favicon',
];

function isCacheable(url) {
  return CACHEABLE.some((p) => url.pathname.startsWith(p) || url.pathname === p);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE.map((u) => cache.add(u).catch(() => null)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || network || fetch(request);
}

// navigations: network-first so online users always get fresh content, with the
// cached shell as the offline fallback (only for the TP1 area)
async function handleNavigation(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const url = new URL(request.url);
      if (url.pathname === '/tp1' || url.pathname.startsWith('/tp1')) {
        const cache = await caches.open(CACHE);
        cache.put(request, res.clone());
      }
    }
    return res;
  } catch (e) {
    const cache = await caches.open(CACHE);
    return (await cache.match(request)) || (await cache.match('/tp1')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (Suno CDN etc.)

  if (request.mode === 'navigate') {
    // only intervene for the offline player's own pages; leave the rest of the
    // site to the network entirely
    if (url.pathname === '/tp1' || url.pathname.startsWith('/tp1/')) {
      event.respondWith(handleNavigation(request));
    }
    return;
  }

  if (isCacheable(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
