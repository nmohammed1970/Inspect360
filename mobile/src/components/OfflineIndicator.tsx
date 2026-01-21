import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOfflineSync } from '../hooks/useOfflineSync';

export default function OfflineIndicator() {
  const { isOnline, queueSize, isSyncing } = useOfflineSync();

  if (isOnline && queueSize === 0) {
    return null;
  }

  return (
    <View style={[styles.container, !isOnline && styles.offline]}>
      <Text style={styles.text}>
        {!isOnline
          ? 'Offline - Changes will sync when online'
          : isSyncing
          ? 'Syncing...'
          : `${queueSize} item${queueSize !== 1 ? 's' : ''} pending sync`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fbbf24', // Lighter amber-400
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  offline: {
    backgroundColor: '#FF3B30',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

