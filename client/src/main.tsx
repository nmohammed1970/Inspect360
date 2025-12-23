import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { offlineQueue } from "./lib/offlineQueue";
import { apiRequest } from "./lib/queryClient";
import { fileUploadSync } from "./lib/fileUploadSync";

// Listen for messages from service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'REQUEST_SYNC') {
      console.log('[Client] Received sync request from service worker');
      
      // Get the MessageChannel port from the event
      const port = event.ports[0];
      
      try {
        // Trigger offline queue sync
        const result = await offlineQueue.syncAll(apiRequest);
        console.log('[Client] Sync complete:', result);
        
        // Send result back to service worker via MessageChannel
        if (port) {
          port.postMessage({
            type: 'SYNC_RESULT',
            success: result.success,
            failed: result.failed
          });
        }
      } catch (error) {
        console.error('[Client] Sync failed:', error);
        
        // Send error back to service worker via MessageChannel
        if (port) {
          port.postMessage({
            type: 'SYNC_ERROR',
            error: error instanceof Error ? error.message : 'Unknown sync error'
          });
        }
      }
    } else if (event.data && event.data.type === 'REQUEST_FILE_SYNC') {
      console.log('[Client] Received file sync request from service worker');
      
      const port = event.ports[0];
      
      try {
        // Trigger file upload sync
        const result = await fileUploadSync.syncAll();
        console.log('[Client] File sync complete:', result);
        
        if (port) {
          port.postMessage({
            type: 'FILE_SYNC_RESULT',
            success: result.success,
            failed: result.failed
          });
        }
      } catch (error) {
        console.error('[Client] File sync failed:', error);
        
        if (port) {
          port.postMessage({
            type: 'FILE_SYNC_ERROR',
            error: error instanceof Error ? error.message : 'Unknown file sync error'
          });
        }
      }
    }
  });
}

// Auto-sync when coming online
window.addEventListener('online', async () => {
  console.log('[Client] Connection restored - syncing offline data...');
  
  try {
    // Sync offline queue
    const queueResult = await offlineQueue.syncAll(apiRequest);
    console.log('[Client] Queue sync result:', queueResult);
    
    // Sync file uploads
    const fileResult = await fileUploadSync.syncAll();
    console.log('[Client] File sync result:', fileResult);
    
    // Register background sync for future offline periods
    if ('serviceWorker' in navigator && 'sync' in (self as any).registration) {
      try {
        await (self as any).registration.sync.register('sync-inspections');
        await (self as any).registration.sync.register('sync-files');
      } catch (err) {
        console.warn('[Client] Background sync registration failed:', err);
      }
    }
  } catch (error) {
    console.error('[Client] Auto-sync failed:', error);
  }
});

createRoot(document.getElementById("root")!).render(<App />);
