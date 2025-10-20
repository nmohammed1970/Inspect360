const CACHE_NAME = 'inspect360-v1';
const RUNTIME_CACHE = 'inspect360-runtime';

// App shell - essential files for offline functionality
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version and update cache in background
        event.waitUntil(
          fetch(event.request).then((networkResponse) => {
            return caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            });
          }).catch(() => cachedResponse)
        );
        return cachedResponse;
      }

      // Not in cache - fetch from network
      return fetch(event.request).then((networkResponse) => {
        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch((error) => {
        console.error('[Service Worker] Fetch failed:', error);
        // Return offline page if available
        return caches.match('/offline.html') || new Response('Offline');
      });
    })
  );
});

// Background sync event - for future implementation
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
  if (event.tag === 'sync-inspections') {
    event.waitUntil(syncInspections());
  }
});

// Placeholder for inspection sync
async function syncInspections() {
  console.log('[Service Worker] Syncing inspections...');
  // Future implementation: sync offline inspection data
  return Promise.resolve();
}

// Message event - for communication with client
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
