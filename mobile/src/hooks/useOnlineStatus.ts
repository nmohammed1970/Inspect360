import { useOfflineSync } from './useOfflineSync';

/**
 * Simple hook to get online status
 * Wraps useOfflineSync for convenience
 */
export function useOnlineStatus(): boolean {
  const { isOnline } = useOfflineSync();
  return isOnline;
}

