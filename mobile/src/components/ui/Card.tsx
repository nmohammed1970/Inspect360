import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';

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
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const { getResponsivePadding } = useResponsive();

  const paddingMap = {
    none: 0,
    sm: getResponsivePadding(spacing[2]),
    md: getResponsivePadding(spacing[4]),
    lg: getResponsivePadding(spacing[6]),
  };

  const baseStyle: ViewStyle = {
    backgroundColor: themeColors.card.DEFAULT,
    borderRadius: borderRadius.xl,
    borderWidth: variant === 'outlined' ? 1 : 0.5,
    borderColor: variant === 'outlined' ? themeColors.card.border : themeColors.border.light,
    padding: paddingMap[padding],
    minWidth: 0,
    alignSelf: 'stretch',
  };

  return <View style={[baseStyle, styles[variant], style]}>{children}</View>;
}

const styles = StyleSheet.create({
  default: {
    ...(shadows?.sm ?? {}),
  },
  outlined: {
    borderWidth: 1,
  },
  elevated: {
    ...(shadows?.md ?? {}),
  },
});
