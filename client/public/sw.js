const CACHE_NAME = 'inspect360-v2';
const RUNTIME_CACHE = 'inspect360-runtime-v2';

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
        // Use addAll but catch errors gracefully
        return Promise.allSettled(
          APP_SHELL.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[Service Worker] Failed to cache ${url}:`, err);
              return null;
            })
          )
        ).then(() => self.skipWaiting());
      })
      .catch((err) => {
        console.warn('[Service Worker] Install failed (non-critical):', err);
        // Still skip waiting even if caching fails
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete all old caches (including old versions)
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Clear any API responses that might have been cached in the runtime cache
      return caches.open(RUNTIME_CACHE).then((cache) => {
        return cache.keys().then((keys) => {
          const apiKeys = keys.filter((request) => {
            try {
              const url = new URL(request.url);
              return url.pathname.startsWith('/api/');
            } catch {
              return false;
            }
          });
          return Promise.all(
            apiKeys.map((key) => {
              console.log('[Service Worker] Removing cached API response:', key.url);
              return cache.delete(key);
            })
          );
        });
      }).catch((err) => {
        console.warn('[Service Worker] Error cleaning API cache:', err);
      });
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

  const url = new URL(event.request.url);
  
  // CRITICAL: Never cache API requests - always fetch fresh from network
  // This ensures credit balance, subscriptions, and other dynamic data are always up-to-date
  if (url.pathname.startsWith('/api/')) {
    // For API requests, use network-first strategy (always fetch from network)
    // Add cache-busting query parameter to ensure fresh data
    const cacheBustUrl = new URL(event.request.url);
    cacheBustUrl.searchParams.set('_t', Date.now().toString());
    
    event.respondWith(
      fetch(cacheBustUrl.toString(), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      })
        .then((networkResponse) => {
          // Don't cache API responses - they need to be fresh
          // Create a new response with no-cache headers
          const headers = new Headers(networkResponse.headers);
          headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
          headers.set('Pragma', 'no-cache');
          headers.set('Expires', '0');
          
          return new Response(networkResponse.body, {
            status: networkResponse.status,
            statusText: networkResponse.statusText,
            headers: headers,
          });
        })
        .catch((error) => {
          console.warn('[Service Worker] API fetch failed:', event.request.url, error);
          throw error;
        })
    );
    return;
  }

  // For static assets (HTML, CSS, JS, images), use cache-first strategy
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version and update cache in background (stale-while-revalidate)
        event.waitUntil(
          fetch(event.request).then((networkResponse) => {
            // Only cache static assets, not API responses
            if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'error') {
              return caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          }).catch(() => {
            // Network failed, but we have cache - that's fine
          })
        );
        return cachedResponse;
      }

      // Not in cache - fetch from network
      return fetch(event.request).then((networkResponse) => {
        // Only cache static assets (not API responses)
        if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'error') {
          const responseClone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            // Only cache if response is valid and not a stream
            if (responseClone.body) {
              cache.put(event.request, responseClone).catch((err) => {
                console.warn('[Service Worker] Failed to cache response:', err);
              });
            }
          }).catch((err) => {
            console.warn('[Service Worker] Failed to open cache:', err);
          });
        }
        return networkResponse;
      }).catch((error) => {
        console.warn('[Service Worker] Fetch failed:', event.request.url, error);
        throw error;
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
