import { useState, useEffect } from 'react';
import * as Network from 'expo-network';

/**
 * Simple hook to check if device is online
 * Returns false if offline - app requires server connection
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();
        setIsOnline(networkState.isConnected || false);
      } catch (error) {
        console.error('[useOnlineStatus] Error checking network:', error);
        setIsOnline(false);
      }
    };

    checkNetwork();
    const interval = setInterval(checkNetwork, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return isOnline;
}

