import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Cloud, Wifi, WifiOff, CheckCircle2 } from 'lucide-react-native';
import Badge from './Badge';
import { colors, spacing, typography } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

interface SyncStatusBadgeProps {
  isOnline: boolean;
  pendingCount: number;
  onPress?: () => void;
}

export default function SyncStatusBadge({ isOnline, pendingCount, onPress }: SyncStatusBadgeProps) {
  const theme = useTheme();
  const themeColors = (theme && theme.colors) ? theme.colors : colors;

  if (!isOnline) {
    return (
      <Badge variant="secondary" size="sm">
        <WifiOff size={12} color={themeColors.text.secondary} />
        <Text style={[styles.text, { color: themeColors.text.secondary }]}>Offline</Text>
      </Badge>
    );
  }

  if (pendingCount === 0) {
    return (
      <Badge variant="default" size="sm">
        <CheckCircle2 size={12} color={themeColors.primary.foreground || '#ffffff'} />
        <Text style={[styles.text, { color: themeColors.primary.foreground || '#ffffff' }]}>Synced</Text>
      </Badge>
    );
  }

  const Component = onPress ? TouchableOpacity : View;

  return (
    <Component onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Badge variant="warning" size="sm">
        <Cloud size={12} color={themeColors.warning} />
        <Text style={[styles.text, { color: themeColors.warning }]}>
          {pendingCount} pending
        </Text>
      </Badge>
    </Component>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginLeft: spacing[1],
  },
});

