import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { offlineQueue } from "./lib/offlineQueue";
import { apiRequest } from "./lib/queryClient";

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
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
