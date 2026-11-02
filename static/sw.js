const CACHE_NAME = 'trili-cache-v21';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './favicon.ico'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
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

// Cache-First with Network Revalidation for assets, Offline Fallback for Navigation
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // CRITICAL: NEVER intercept API calls with fake responses!
  // Let network naturally fail so client LocalDB maintains 100% data integrity!
  if (url.pathname.includes('/api/')) {
    return;
  }

  // Navigation requests (HTML page): Cache first, then Network
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then((cached) => {
        if (cached) {
          fetch(e.request).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              caches.open(CACHE_NAME).then((c) => c.put(e.request, networkRes));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(e.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return networkRes;
        }).catch(async () => {
          return (await caches.match('./', { ignoreSearch: true })) ||
                 (await caches.match('./index.html', { ignoreSearch: true })) ||
                 new Response('Offline Page Not Available', {
                   status: 503,
                   headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                 });
        });
      })
    );
    return;
  }

  // Static Assets (CSS, JS, Icons): Cache First with background revalidation
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        fetch(e.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((c) => c.put(e.request, networkRes));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(e.request).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return networkRes;
      });
    })
  );
});
