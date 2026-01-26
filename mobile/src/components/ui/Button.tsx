import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, View } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getButtonHeight, moderateScale, getFontSize } from '../../utils/responsive';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost' | 'primary';
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
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  
  // Ensure disabled and loading are actual booleans (not strings)
  const safeDisabled = typeof disabled === 'boolean' ? disabled : disabled === true || disabled === 'true';
  const safeLoading = typeof loading === 'boolean' ? loading : loading === true || loading === 'true';

  const getVariantStyle = () => {
    switch (variant) {
      case 'primary':
      case 'default':
        return {
          backgroundColor: themeColors.primary.DEFAULT,
          borderColor: themeColors.primary.border,
        };
      case 'secondary':
        return {
          backgroundColor: themeColors.secondary.DEFAULT,
          borderColor: themeColors.secondary.border,
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderColor: themeColors.border.dark || themeColors.border.DEFAULT,
        };
      case 'destructive':
        return {
          backgroundColor: themeColors.destructive.DEFAULT,
          borderColor: themeColors.destructive.border,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        };
      default:
        return {
          backgroundColor: themeColors.primary.DEFAULT,
          borderColor: themeColors.primary.border,
        };
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'primary':
      case 'default':
        return themeColors.primary.foreground || '#ffffff';
      case 'secondary':
        return themeColors.secondary.foreground;
      case 'outline':
        return themeColors.text.primary;
      case 'destructive':
        return themeColors.destructive.foreground;
      case 'ghost':
        return themeColors.text.primary;
      default:
        return themeColors.primary.foreground || '#ffffff';
    }
  };

  const buttonStyle = [
    styles.button,
    {
      ...getVariantStyle(),
      borderWidth: variant === 'ghost' ? 0 : 1.5,
    },
    styles[`size_${size}`],
    safeDisabled && styles.disabled,
    !safeDisabled && variant !== 'ghost' && variant !== 'outline' && shadows.sm,
    style,
  ];

  const buttonTextStyle = [
    styles.text,
    {
      color: getTextColor(),
      fontWeight: variant === 'outline' ? typography.fontWeight.medium : typography.fontWeight.semibold,
    },
    styles[`text_${size}`],
    textStyle,
  ];

  const getIndicatorColor = () => {
    if (variant === 'default' || variant === 'destructive' || variant === 'primary') {
      return themeColors.primary.foreground || '#ffffff';
    }
    return themeColors.primary.DEFAULT;
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

// Create responsive styles function
const createStyles = () => {
  const smHeight = getButtonHeight('sm');
  const mdHeight = getButtonHeight('md');
  const lgHeight = getButtonHeight('lg');
  const iconSize = moderateScale(36, 0.2);

  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: moderateScale(borderRadius.xl, 0.2),
      minHeight: mdHeight, // Default to medium
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: moderateScale(spacing[1], 0.3),
    },
    icon: {
      marginRight: moderateScale(spacing[1], 0.3),
    },
    size_sm: {
      paddingVertical: moderateScale(spacing[2], 0.3),
      paddingHorizontal: moderateScale(spacing[3], 0.3),
      minHeight: smHeight,
    },
    size_md: {
      paddingVertical: moderateScale(spacing[2], 0.3),
      paddingHorizontal: moderateScale(spacing[4], 0.3),
      minHeight: mdHeight,
    },
    size_lg: {
      paddingVertical: moderateScale(spacing[3], 0.3),
      paddingHorizontal: moderateScale(spacing[8], 0.3),
      minHeight: lgHeight,
    },
    size_icon: {
      width: iconSize,
      height: iconSize,
      padding: 0,
      minHeight: iconSize,
    },
    disabled: {
      opacity: 0.5,
    },
    text: {
      fontFamily: typography.fontFamily.sans,
      letterSpacing: moderateScale(0.3, 0.2),
    },
    text_sm: {
      fontSize: getFontSize(typography.fontSize.xs),
    },
    text_md: {
      fontSize: getFontSize(typography.fontSize.sm),
    },
    text_lg: {
      fontSize: getFontSize(typography.fontSize.base),
    },
    text_icon: {
      fontSize: 0,
    },
  });
};

const styles = createStyles();
