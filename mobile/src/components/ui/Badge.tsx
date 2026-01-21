import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../theme';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'primary';
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
    styles[variant === 'default' || variant === 'primary' ? 'variantDefault' : variant] || styles.variantDefault,
    styles[`size_${size}`],
    style,
  ];

  const badgeTextStyle = [
    styles.text,
    styles[`${variant}Text`] || styles.defaultText,
    styles[`text_${size}`],
    textStyle,
  ];

  const renderChildren = () => {
    return React.Children.map(children, child => {
      if (typeof child === 'string' || typeof child === 'number') {
        return <Text style={badgeTextStyle}>{child}</Text>;
      }
      return child;
    });
  };

  return (
    <View style={badgeStyle}>
      {renderChildren()}
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
  variantDefault: {
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
  warning: {
    backgroundColor: colors.warning,
    opacity: 0.9, // Slightly lighter appearance
  },
  primary: {
    backgroundColor: colors.primary.DEFAULT,
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
    fontWeight: typography.fontWeight.semibold, // Bolder for better visibility
    fontFamily: typography.fontFamily.sans,
    letterSpacing: 0.2,
  },
  defaultText: {
    color: colors.primary.foreground || '#ffffff',
  },
  primaryText: {
    color: colors.primary.foreground || '#ffffff',
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
  warningText: {
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
