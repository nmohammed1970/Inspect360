import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import {
  initializeBackgroundSync,
  syncOnForeground,
  cleanup,
  type BackgroundSyncCallbacks,
} from '../services/offline/backgroundSync';
import { syncService, type SyncProgress } from '../services/offline/syncService';
import { useAuth, isTenantRole } from './AuthContext';

interface SyncContextType {
  /** Staff offline sync only — always false for tenants / logged-out users. */
  offlineSyncEnabled: boolean;
  isSyncing: boolean;
  syncProgress: SyncProgress | null;
  showSyncModal: boolean;
  setShowSyncModal: (show: boolean) => void;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

/**
 * Offline inspection sync for staff roles only.
 * Tenant portal is online-only — no SQLite sync, background jobs, or sync modal.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const offlineSyncEnabled =
    !authLoading && isAuthenticated && !isTenantRole(user?.role);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!offlineSyncEnabled) {
      cleanup();
      setIsSyncing(false);
      setSyncProgress(null);
      setShowSyncModal(false);
      return;
    }

    let cancelled = false;

    Network.getNetworkStateAsync().then((state) => {
      if (!cancelled) wasOfflineRef.current = !state.isConnected;
    });

    const unsubscribe = syncService.addProgressListener((progress) => {
      setSyncProgress(progress);
      setIsSyncing(progress.total > 0 && progress.completed + progress.failed < progress.total);

      if (progress.total > 0 && progress.completed === 0 && progress.failed === 0) {
        setShowSyncModal(true);
      }

      if (progress.total > 0 && progress.completed + progress.failed >= progress.total) {
        setTimeout(() => setShowSyncModal(false), 2000);
      }
    });

    const callbacks: BackgroundSyncCallbacks = {
      onSyncStart: () => {
        setIsSyncing(true);
        setShowSyncModal(true);
      },
      onSyncProgress: (progress) => {
        setSyncProgress(progress);
        setIsSyncing(progress.total > 0 && progress.completed + progress.failed < progress.total);
      },
      onSyncComplete: () => {
        setIsSyncing(false);
        setTimeout(() => setShowSyncModal(false), 2000);
      },
      onSyncError: (error) => {
        console.error('[SyncContext] Sync error:', error);
        setIsSyncing(false);
      },
      onNetworkChange: (isOnline) => {
        if (isOnline && wasOfflineRef.current) {
          wasOfflineRef.current = false;
          setShowSyncModal(true);
        } else if (!isOnline) {
          wasOfflineRef.current = true;
          setShowSyncModal(false);
        }
      },
    };

    initializeBackgroundSync(callbacks);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        syncOnForeground();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      subscription.remove();
      cleanup();
    };
  }, [offlineSyncEnabled]);

  const triggerSync = useCallback(async () => {
    if (!offlineSyncEnabled) return;

    try {
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected) {
        throw new Error('Not online');
      }
      setShowSyncModal(true);
      setIsSyncing(true);
      await syncService.syncAll();
    } catch (error: any) {
      console.error('[SyncContext] Error triggering sync:', error);
      setIsSyncing(false);
      throw error;
    }
  }, [offlineSyncEnabled]);

  return (
    <SyncContext.Provider
      value={{
        offlineSyncEnabled,
        isSyncing: offlineSyncEnabled && isSyncing,
        syncProgress: offlineSyncEnabled ? syncProgress : null,
        showSyncModal: offlineSyncEnabled && showSyncModal,
        setShowSyncModal,
        triggerSync,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
