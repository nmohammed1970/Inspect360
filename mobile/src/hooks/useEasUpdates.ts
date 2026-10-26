import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Checks EAS Update on launch and when the app returns to foreground.
 * No-ops in __DEV__ / Expo Go (Updates.isEnabled is false there).
 */
export function useEasUpdates() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    let cancelled = false;

    const checkAndApply = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (cancelled || !result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        await Updates.reloadAsync();
      } catch (error) {
        console.warn('[EAS Update] check/fetch failed:', error);
      }
    };

    void checkAndApply();

    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void checkAndApply();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
}
