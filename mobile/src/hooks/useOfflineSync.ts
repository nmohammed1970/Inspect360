import { useEffect, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { offlineQueue, OfflineQueueItem } from '../services/offlineQueue';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkNetworkStatus = useCallback(async () => {
    const online = await offlineQueue.isOnline();
    setIsOnline(online);

    if (online) {
      const size = await offlineQueue.getQueueSize();
      setQueueSize(size);
    }
  }, []);

  const sync = useCallback(async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    try {
      const result = await offlineQueue.syncQueue();
      await checkNetworkStatus();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, checkNetworkStatus]);

  useEffect(() => {
    checkNetworkStatus();

    // Check network status periodically
    const interval = setInterval(checkNetworkStatus, 5000);

    // Initial sync
    sync();

    // Sync when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkNetworkStatus();
        sync();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run setup once on mount

  // Sync automatically when coming back online
  useEffect(() => {
    if (isOnline) {
      sync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return {
    isOnline,
    queueSize,
    isSyncing,
    sync,
    checkNetworkStatus,
  };
}

