// Service Worker: precache + runtime caching + cache versioning + offline fallback
// VERSI FIX: Menggunakan path relatif untuk kompatibilitas Capacitor

const CACHE_VERSION = 'v2';
const PRECACHE_NAME = `nota-precache-${CACHE_VERSION}`;
const RUNTIME_CACHE = `nota-runtime-${CACHE_VERSION}`;

// Gunakan path relatif (tanpa / di depan) untuk Capacitor
const PRECACHE_URLS = [
  './', 
  './index.html',
  './manifest.json',
  './offline.html',
  './www/libs/html2canvas.min.js',
  './www/libs/jspdf.umd.min.js',
  './www/libs/esc-pos-encoder.min.js',
  './www/native-plugins.js'
];

// Install: cache app shell
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE_NAME)
      .then(cache => {
        console.log('[SW] Precaching:', PRECACHE_URLS);
        return cache.addAll(PRECACHE_URLS);
      })
      .catch(err => console.error('[SW] Precache failed:', err))
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== PRECACHE_NAME && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
    )).then(() => {
      console.log('[SW] Activated, claimed clients');
      return self.clients.claim();
    })
  );
});

// Helper: normalize path untuk matching
function normalizePath(url) {
  const pathname = new URL(url).pathname;
  // Hapus leading slash untuk konsistensi
  return pathname.replace(/^\/+/, '');
}

// Fetch handler
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip chrome-extension dan protocol lain
  if (!url.protocol.startsWith('http')) return;

  const normalizedPath = normalizePath(url.href);

  // 1. Navigation requests - network first, fallback ke cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(resp => {
        if (resp.ok) {
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, resp.clone()));
        }
        return resp;
      }).catch(() => {
        console.log('[SW] Navigation failed, serving from cache');
        return caches.match('./index.html') || caches.match('index.html');
      })
    );
    return;
  }

  // 2. Precached assets - cache first
  const isPrecached = PRECACHE_URLS.some(p => {
    const precachePath = p.replace(/^\.\//, '');
    return normalizedPath === precachePath || 
           normalizedPath.endsWith(precachePath);
  });

  if (isPrecached) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) {
          console.log('[SW] Serving from cache:', normalizedPath);
          return cached;
        }
        return fetch(request).then(fetchResp => {
          if (fetchResp.ok) {
            caches.open(PRECACHE_NAME).then(cache => cache.put(request, fetchResp.clone()));
          }
          return fetchResp;
        });
      })
    );
    return;
  }

  // 3. Library files (www/libs) - stale-while-revalidate
  if (normalizedPath.includes('www/libs/') || normalizedPath.includes('libs/')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache => {
        return cache.match(request).then(cached => {
          const networkFetch = fetch(request).then(response => {
            if (response && response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(err => {
            console.log('[SW] Network failed for lib:', normalizedPath);
            return null;
          });
          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // 4. Images - cache first dengan fallback
  if (request.destination === 'image' || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache => {
        return cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(resp => {
            if (resp && resp.ok) cache.put(request, resp.clone());
            return resp;
          }).catch(() => {
            // Return 1x1 transparent pixel sebagai fallback
            return new Response(
              new Blob([new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82])], { type: 'image/png' }),
              { status: 200, headers: { 'Content-Type': 'image/png' } }
            );
          });
        });
      })
    );
    return;
  }

  // 5. Default: network first, fallback ke cache
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && request.url.startsWith('http')) {
        const respClone = response.clone();
        caches.open(RUNTIME_CACHE).then(cache => cache.put(request, respClone));
      }
      return response;
    }).catch(() => {
      console.log('[SW] Network failed, trying cache:', normalizedPath);
      return caches.match(request);
    })
  );
});
