import * as Network from 'expo-network';
import { syncService, type SyncProgress } from './syncService';
import { getSyncStats } from './database';

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
let syncInterval: NodeJS.Timeout | null = null;
let lastSyncTime: number = 0;
let isInitialized = false;

export interface BackgroundSyncCallbacks {
  onSyncStart?: () => void;
  onSyncProgress?: (progress: SyncProgress) => void;
  onSyncComplete?: (result: { success: boolean; uploaded: number; downloaded: number }) => void;
  onSyncError?: (error: Error) => void;
  onNetworkChange?: (isOnline: boolean) => void;
}

let callbacks: BackgroundSyncCallbacks = {};

/**
 * Initialize background sync
 */
export function initializeBackgroundSync(cbs: BackgroundSyncCallbacks = {}) {
  if (isInitialized) {
    return;
  }

  callbacks = cbs;
  isInitialized = true;

  // Set up progress callback
  syncService.setProgressCallback((progress) => {
    callbacks.onSyncProgress?.(progress);
  });

  // Listen to network state changes
  Network.addNetworkStateListener((state) => {
    const isOnline = state.isConnected || false;
    callbacks.onNetworkChange?.(isOnline);

    if (isOnline && !syncService.isSyncInProgress()) {
      // Network reconnected - sync immediately
      performSync();
    }
  });

  // Start periodic sync
  startPeriodicSync();
}

/**
 * Start periodic sync
 */
function startPeriodicSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  syncInterval = setInterval(async () => {
    const networkState = await Network.getNetworkStateAsync();
    if (networkState.isConnected && !syncService.isSyncInProgress()) {
      performSync();
    }
  }, SYNC_INTERVAL);
}

/**
 * Stop periodic sync
 */
export function stopPeriodicSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Perform sync (with throttling)
 */
async function performSync() {
  const now = Date.now();
  // Throttle: don't sync more than once per minute
  if (now - lastSyncTime < 60 * 1000) {
    return;
  }

  lastSyncTime = now;

  try {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) {
      return;
    }

    callbacks.onSyncStart?.();

    const result = await syncService.syncAll(true);

    callbacks.onSyncComplete?.({
      success: result.success,
      uploaded: result.uploaded,
      downloaded: result.downloaded,
    });
  } catch (error: any) {
    console.error('[BackgroundSync] Sync error:', error);
    callbacks.onSyncError?.(error);
  }
}

/**
 * Manual sync trigger
 */
export async function triggerSync(): Promise<{
  success: boolean;
  uploaded: number;
  downloaded: number;
}> {
  const networkState = await Network.getNetworkStateAsync();
  if (!networkState.isConnected) {
    throw new Error('Not online');
  }

  if (syncService.isSyncInProgress()) {
    throw new Error('Sync already in progress');
  }

  callbacks.onSyncStart?.();

  try {
    const result = await syncService.syncAll(true);
    callbacks.onSyncComplete?.({
      success: result.success,
      uploaded: result.uploaded,
      downloaded: result.downloaded,
    });
    return {
      success: result.success,
      uploaded: result.uploaded,
      downloaded: result.downloaded,
    };
  } catch (error: any) {
    callbacks.onSyncError?.(error);
    throw error;
  }
}

/**
 * Sync when app comes to foreground
 */
export async function syncOnForeground() {
  const networkState = await Network.getNetworkStateAsync();
  if (networkState.isConnected && !syncService.isSyncInProgress()) {
    performSync();
  }
}

/**
 * Get sync statistics
 */
export async function getSyncStatistics() {
  return await getSyncStats();
}

/**
 * Cleanup
 */
export function cleanup() {
  stopPeriodicSync();
  syncService.setProgressCallback(null);
  isInitialized = false;
}

