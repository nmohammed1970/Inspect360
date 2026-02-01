import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, View, StyleProp, useWindowDimensions, Dimensions } from 'react-native';
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
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
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
  const windowDimensions = useWindowDimensions();
  const screenWidth = windowDimensions?.width || Dimensions.get('window').width;
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

  // Calculate responsive styles dynamically based on current screen width
  const smHeight = getButtonHeight('sm', screenWidth);
  const mdHeight = getButtonHeight('md', screenWidth);
  const lgHeight = getButtonHeight('lg', screenWidth);
  const iconSize = moderateScale(36, 0.2, screenWidth);

  const getSizeStyle = () => {
    switch (size) {
      case 'sm':
        return {
          paddingVertical: moderateScale(spacing[2], 0.3, screenWidth),
          paddingHorizontal: moderateScale(spacing[3], 0.3, screenWidth),
          minHeight: smHeight,
        };
      case 'lg':
        return {
          paddingVertical: moderateScale(spacing[3], 0.3, screenWidth),
          paddingHorizontal: moderateScale(spacing[8], 0.3, screenWidth),
          minHeight: lgHeight,
        };
      case 'icon':
        return {
          width: iconSize,
          height: iconSize,
          padding: 0,
          minHeight: iconSize,
        };
      default: // 'md'
        return {
          paddingVertical: moderateScale(spacing[2], 0.3, screenWidth),
          paddingHorizontal: moderateScale(spacing[4], 0.3, screenWidth),
          minHeight: mdHeight,
        };
    }
  };

  const getTextSizeStyle = () => {
    switch (size) {
      case 'sm':
        return { fontSize: getFontSize(typography.fontSize.xs, screenWidth) };
      case 'lg':
        return { fontSize: getFontSize(typography.fontSize.base, screenWidth) };
      case 'icon':
        return { fontSize: 0 };
      default: // 'md'
        return { fontSize: getFontSize(typography.fontSize.sm, screenWidth) };
    }
  };

  const buttonStyle = [
    styles.button,
    {
      ...getVariantStyle(),
      borderWidth: variant === 'ghost' ? 0 : 1.5,
      borderRadius: moderateScale(borderRadius.xl, 0.2, screenWidth),
    },
    getSizeStyle(),
    safeDisabled && styles.disabled,
    !safeDisabled && variant !== 'ghost' && variant !== 'outline' && shadows.sm,
    style,
  ];

  const buttonTextStyle = [
    styles.text,
    {
      color: getTextColor(),
      fontWeight: variant === 'outline' ? typography.fontWeight.medium : typography.fontWeight.semibold,
      letterSpacing: moderateScale(0.3, 0.2, screenWidth),
    },
    getTextSizeStyle(),
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
        <View style={[styles.content, { gap: moderateScale(spacing[1], 0.3, screenWidth) }]}>
          {icon && <View style={[styles.icon, { marginRight: moderateScale(spacing[1], 0.3, screenWidth) }]}>{icon}</View>}
          {size !== 'icon' && <Text style={buttonTextStyle}>{title}</Text>}
        </View>
      )}
    </TouchableOpacity>
  );
}

// Static styles that don't need responsive scaling
const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    // Margin will be applied dynamically
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontFamily: typography.fontFamily.sans,
  },
});
