import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface LogoProps {
  /** Logo height; width follows the wordmark aspect ratio (~3.2:1) unless overridden. */
  size?: number;
  width?: number;
  height?: number;
  color?: string; // Kept for backward compatibility but not used
  /** Force a variant; defaults to white in dark mode, default wordmark in light mode. */
  variant?: 'auto' | 'light' | 'dark';
}

export default function Logo({ size = 48, width, height, variant = 'auto' }: LogoProps) {
  const theme = useTheme();
  const h = height ?? size;
  const w = width ?? Math.round(h * 3.2);

  const useWhite =
    variant === 'light' || (variant === 'auto' && theme?.theme === 'dark');

  return (
    <View style={[styles.container, { width: w, height: h }]}>
      <Image
        source={
          useWhite
            ? require('../../../assets/LogoWhite.png')
            : require('../../../assets/logo.png')
        }
        style={[styles.logo, { width: w, height: h }]}
        resizeMode="contain"
        accessibilityLabel="Inspect360"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});
