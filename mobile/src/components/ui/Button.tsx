import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, View } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export default function Button({
  title,
  onPress,
  variant = 'default',
  size = 'md',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  // Ensure disabled and loading are actual booleans (not strings)
  const safeDisabled = typeof disabled === 'boolean' ? disabled : disabled === true || disabled === 'true';
  const safeLoading = typeof loading === 'boolean' ? loading : loading === true || loading === 'true';
  const buttonStyle = [
    styles.button,
    styles[variant],
    styles[`size_${size}`],
    safeDisabled && styles.disabled,
    !safeDisabled && variant !== 'ghost' && shadows.sm,
    style,
  ];

  const buttonTextStyle = [
    styles.text,
    styles[`${variant}Text`],
    styles[`text_${size}`],
    textStyle,
  ];

  const getIndicatorColor = () => {
    if (variant === 'default' || variant === 'destructive') {
      return colors.primary.foreground;
    }
    return colors.primary.DEFAULT;
  };

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={safeDisabled || safeLoading}
      activeOpacity={0.7}
    >
      {safeLoading ? (
        <ActivityIndicator color={getIndicatorColor()} size="small" />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.icon}>{icon}</View>}
          {size !== 'icon' && <Text style={buttonTextStyle}>{title}</Text>}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    minHeight: 36,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  icon: {
    marginRight: spacing[1],
  },
  default: {
    backgroundColor: colors.primary.DEFAULT,
    borderColor: colors.primary.border,
  },
  secondary: {
    backgroundColor: colors.secondary.DEFAULT,
    borderColor: colors.secondary.border,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: colors.border.DEFAULT,
  },
  destructive: {
    backgroundColor: colors.destructive.DEFAULT,
    borderColor: colors.destructive.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  size_sm: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    minHeight: 32,
  },
  size_md: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    minHeight: 36,
  },
  size_lg: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[8],
    minHeight: 40,
  },
  size_icon: {
    width: 36,
    height: 36,
    padding: 0,
    minHeight: 36,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: typography.fontWeight.semibold,
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
  ghostText: {
    color: colors.text.primary,
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
  text_icon: {
    fontSize: 0,
  },
});

