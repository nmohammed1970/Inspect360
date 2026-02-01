import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import Card from './Card';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

interface OfflineIndicatorProps {
  message?: string;
}

export default function OfflineIndicator({ 
  message = 'You are offline. Changes will be synced when you reconnect.' 
}: OfflineIndicatorProps) {
  const theme = useTheme();
  const themeColors = (theme && theme.colors) ? theme.colors : colors;

  return (
    <Card style={[
      styles.container,
      {
        backgroundColor: `${themeColors.warning}15`,
        borderColor: `${themeColors.warning}40`,
      }
    ]}>
      <View style={styles.content}>
        <WifiOff size={16} color={themeColors.warning} />
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: themeColors.warning }]}>
            Working Offline
          </Text>
          <Text style={[styles.message, { color: themeColors.text.secondary }]}>
            {message}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[1],
  },
  message: {
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.xs,
  },
});

