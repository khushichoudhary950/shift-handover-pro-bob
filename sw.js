// Shift Handover Pro — service worker
// Network-first for the app shell (HTML/JS/CSS all live in index.html) so every
// deploy is picked up immediately. Falls back to cache only when offline.
// Live data (handovers, flights, briefing, etc.) always comes from Supabase.

const CACHE_NAME = 'handover-pro-v2'; // bump this string on every future release to force-refresh clients

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting(); // activate the new SW immediately, don't wait for old tabs to close
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim(); // take control of open tabs immediately
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never touch Supabase API calls — always go straight to the network.
  if (url.hostname.includes('supabase.co')) return;

  // Network-first for navigation (the HTML page itself) so a new deploy is
  // always picked up on the next load. Falls back to cache only if offline.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest) — fine for these since
  // they rarely change and it's ok to serve instantly from cache.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          if (event.request.method === 'GET' && response && response.status === 200 && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
      );
    })
  );
});

