import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'outlined' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export default function Card({
  children,
  style,
  variant = 'default',
  padding = 'md',
}: CardProps) {
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;

  const baseStyle = {
    backgroundColor: themeColors.card.DEFAULT,
    borderRadius: borderRadius.xl, // More rounded for modern look
    borderWidth: variant === 'outlined' ? 1 : 0.5, // Thicker border for outlined variant
    borderColor: variant === 'outlined' ? themeColors.card.border : themeColors.border.light,
  };

  const cardStyle = [
    baseStyle,
    styles[variant],
    styles[`padding_${padding}`],
    style,
  ];

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    // Colors are now set dynamically via theme
  },
  default: {
    ...(shadows?.sm ?? {}),
  },
  outlined: {
    borderWidth: 1,
    // borderColor will be set dynamically via theme
  },
  elevated: {
    ...(shadows?.md ?? {}),
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

