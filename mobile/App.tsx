// App entry point
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SystemUI from 'expo-system-ui';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { SyncProvider } from './src/contexts/SyncContext';
import AppNavigator from './src/navigation/AppNavigator';
import { queryClient } from './src/services/queryClient';
import { ErrorBoundary } from './src/components/ui/ErrorBoundary';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import GlobalSyncModal from './src/components/ui/GlobalSyncModal';
import { SystemBarsThemeSync } from './src/hooks/useSystemBarsTheme';

// Paint root window white ASAP so edge-to-edge status bar isn't black before theme mounts.
void SystemUI.setBackgroundColorAsync('#ffffff').catch(() => {});

function AppContent() {
  return (
    <SystemBarsThemeSync>
      <AppNavigator />
      <GlobalSyncModal />
    </SystemBarsThemeSync>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <SyncProvider>
                <AppContent />
              </SyncProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
