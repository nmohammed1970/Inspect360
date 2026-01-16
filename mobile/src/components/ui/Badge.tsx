import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../theme';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success';
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  style,
  textStyle,
}: BadgeProps) {
  const badgeStyle = [
    styles.badge,
    styles[variant],
    styles[`size_${size}`],
    style,
  ];

  const badgeTextStyle = [
    styles.text,
    styles[`${variant}Text`],
    styles[`text_${size}`],
    textStyle,
  ];

  return (
    <View style={badgeStyle}>
      <Text style={badgeTextStyle}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  default: {
    backgroundColor: colors.primary.DEFAULT,
  },
  secondary: {
    backgroundColor: colors.secondary.DEFAULT,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  destructive: {
    backgroundColor: colors.destructive.DEFAULT,
  },
  success: {
    backgroundColor: colors.success,
  },
  size_sm: {
    paddingHorizontal: spacing[1],
    paddingVertical: 2,
  },
  size_md: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  size_lg: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  text: {
    fontWeight: typography.fontWeight.medium,
  },
  defaultText: {
    color: colors.primary.foreground,
  },
  secondaryText: {
    color: colors.secondary.foreground,
  },
  outlineText: {
    color: colors.text.primary,
  },
  destructiveText: {
    color: colors.destructive.foreground,
  },
  successText: {
    color: '#ffffff',
  },
  text_sm: {
    fontSize: typography.fontSize.xs,
  },
  text_md: {
    fontSize: typography.fontSize.sm,
  },
  text_lg: {
    fontSize: typography.fontSize.base,
  },
});

