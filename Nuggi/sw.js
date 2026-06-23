const CACHE_NAME = 'nuggi-cache-v8';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Cache-first for large CDN resources and model files only!
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // CRITICAL: Skip intercepting non-HTTP protocols like blob: or data:
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }
  
  const isCdnOrModel = 
    url.origin.includes('cdn.jsdelivr.net') ||
    url.origin.includes('storage.googleapis.com') ||
    url.origin.includes('esm.sh') ||
    url.origin.includes('fonts.googleapis.com') ||
    url.origin.includes('fonts.gstatic.com') ||
    url.origin.includes('unpkg.com');

  if (isCdnOrModel) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(e.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
        }).catch(() => {
          return new Response('Offline: Resource not cached', { status: 503 });
        });
      })
    );
  } else {
    // Local assets (HTML, CSS, JS) always bypass cache for real-time updates!
    e.respondWith(fetch(e.request));
  }
});
