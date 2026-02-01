// App entry point
import React, { useEffect } from 'react';
import { View, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { queryClient } from './src/services/queryClient';
import { ErrorBoundary } from './src/components/ui/ErrorBoundary';
import { initializeBackgroundSync, syncOnForeground, cleanup } from './src/services/offline/backgroundSync';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function AppContent() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      // Initialize background sync when authenticated
      initializeBackgroundSync({
        onSyncStart: () => {
          console.log('[App] Sync started');
        },
        onSyncComplete: (result) => {
          console.log('[App] Sync completed:', result);
        },
        onSyncError: (error) => {
          console.error('[App] Sync error:', error);
        },
        onNetworkChange: (isOnline) => {
          console.log('[App] Network changed:', isOnline);
        },
      });
    }

    // Handle app state changes
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && isAuthenticated) {
        syncOnForeground();
      }
    });

    return () => {
      subscription.remove();
      if (isAuthenticated) {
        cleanup();
      }
    };
  }, [isAuthenticated]);

  return (
    <View style={styles.container}>
      <AppNavigator />
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
