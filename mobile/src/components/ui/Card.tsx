import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius, shadows } from '../../theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'outlined' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export default function Card({
  children,
  style,
  variant = 'default',
  padding = 'md',
}: CardProps) {
  const cardStyle = [
    styles.card,
    styles[variant],
    styles[`padding_${padding}`],
    style,
  ];

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card.DEFAULT,
    borderRadius: borderRadius.xl, // More rounded for modern look
    borderWidth: 0.5, // Subtle border
    borderColor: colors.border.light,
  },
  default: {
    ...shadows.sm,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.card.border,
  },
  elevated: {
    ...shadows.md,
  },
  padding_none: {
    padding: 0,
  },
  padding_sm: {
    padding: spacing[2],
  },
  padding_md: {
    padding: spacing[4],
  },
  padding_lg: {
    padding: spacing[6],
  },
});

