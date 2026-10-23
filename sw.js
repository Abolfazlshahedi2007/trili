const CACHE_NAME = 'trili-cache-v1';
const ASSETS = [
  '/',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Network first, falling back to cache for API or offline
  if (e.request.url.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => {
        return new Response(JSON.stringify({ offline: true, message: 'آفلاین هستید' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
  } else {
    e.respondWith(
      caches.match(e.request).then((res) => {
        return res || fetch(e.request);
      })
    );
  }
});
