import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, borderRadius } from '../../theme';

interface ProgressProps {
  value: number; // 0-100
  style?: ViewStyle;
  height?: number;
  showValue?: boolean;
}

export default function Progress({
  value,
  style,
  height = 8,
  showValue = false,
}: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const percentage = `${clampedValue}%`;

  return (
    <View style={[styles.container, { height }, style]}>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: percentage, height },
            showValue && styles.fillWithValue,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  track: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.muted.DEFAULT,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: colors.primary.DEFAULT,
    borderRadius: borderRadius.full,
    height: '100%',
  },
  fillWithValue: {
    // Additional styling if showing value
  },
});

