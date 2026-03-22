const CACHE_NAME = 'leverage-reading-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
