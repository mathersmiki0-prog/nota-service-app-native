// Service Worker: precache + runtime caching + cache versioning + offline fallback
const CACHE_VERSION = 'v2';
const PRECACHE_NAME = `nota-precache-${CACHE_VERSION}`;
const RUNTIME_CACHE = `nota-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/', 
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/service-worker.js',
  '/www/libs/html2canvas.min.js',
  '/www/libs/jspdf.umd.min.js',
  '/www/libs/esc-pos-encoder.min.js'
];

// Install: cache app shell
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(err => console.error('Precache failed:', err))
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== PRECACHE_NAME && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Fetch handler: cache-first for precached files, network-first for navigations, stale-while-revalidate for libs, runtime caching for images
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(resp => {
        caches.open(RUNTIME_CACHE).then(cache => cache.put(request, resp.clone()));
        return resp;
      }).catch(() => caches.match('/index.html').then(r => r || caches.match('/offline.html')))
    );
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname) || PRECACHE_URLS.includes(url.pathname + '/')) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(fetchResp => {
        caches.open(PRECACHE_NAME).then(cache => cache.put(request, fetchResp.clone()));
        return fetchResp;
      }))
    );
    return;
  }

  if (url.pathname.startsWith('/www/libs/') || url.pathname.includes('/libs/')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache => cache.match(request).then(cached => {
        const networkFetch = fetch(request).then(response => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => null);
        return cached || networkFetch;
      }))
    );
    return;
  }

  if (request.destination === 'image' || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache => cache.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(resp => {
          if (resp && resp.ok) cache.put(request, resp.clone());
          return resp;
        }).catch(() => caches.match('/offline.html'));
      }))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => response)
      .catch(() => caches.match(request))
  );
});
