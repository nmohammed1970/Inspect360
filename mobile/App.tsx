// App entry point
import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import OfflineIndicator from './src/components/OfflineIndicator';
import { queryClient } from './src/services/queryClient';
import { ErrorBoundary } from './src/components/ui/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
        <ThemeProvider>
      <AuthProvider>
        <View style={styles.container}>
          <AppNavigator />
          <OfflineIndicator />
        </View>
      </AuthProvider>
        </ThemeProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
