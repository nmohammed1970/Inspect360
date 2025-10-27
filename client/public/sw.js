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

// Sync offline inspection queue
async function syncInspections() {
  console.log('[Service Worker] Syncing inspections...');
  
  try {
    // Get all active clients
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    
    if (clients.length === 0) {
      console.log('[Service Worker] No active clients to sync with - sync will retry later');
      // Reject so Background Sync will retry when a client becomes available
      return Promise.reject(new Error('No active clients available for sync'));
    }
    
    // Create a MessageChannel to wait for the client's response
    const messageChannel = new MessageChannel();
    
    // Set up promise to wait for client response
    const syncPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sync timeout - no response from client'));
      }, 30000); // 30 second timeout
      
      messageChannel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        
        if (event.data && event.data.type === 'SYNC_RESULT') {
          console.log(`[Service Worker] Sync complete: ${event.data.success} succeeded, ${event.data.failed} failed`);
          
          if (event.data.failed > 0) {
            // Some items failed - reject so Background Sync will retry
            reject(new Error(`Sync partially failed: ${event.data.failed} items`));
          } else {
            resolve(event.data);
          }
        } else if (event.data && event.data.type === 'SYNC_ERROR') {
          reject(new Error(event.data.error || 'Sync failed'));
        } else {
          reject(new Error('Invalid sync response'));
        }
      };
    });
    
    // Send sync request to client with MessageChannel port
    clients[0].postMessage({
      type: 'REQUEST_SYNC'
    }, [messageChannel.port2]);
    
    console.log('[Service Worker] Sync request sent to client, waiting for completion...');
    
    // Wait for the client to complete the sync
    return await syncPromise;
  } catch (error) {
    console.error('[Service Worker] Sync error:', error);
    return Promise.reject(error);
  }
}

// Message event - for communication with client
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
