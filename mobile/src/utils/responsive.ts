import { Dimensions, PixelRatio, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base dimensions (iPhone 14 Pro - 393x852)
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

// Scale factor based on screen width
const scale = (size: number): number => {
  const scaleFactor = SCREEN_WIDTH / BASE_WIDTH;
  return Math.round(size * scaleFactor);
};

// Scale factor based on screen height
const verticalScale = (size: number): number => {
  const scaleFactor = SCREEN_HEIGHT / BASE_HEIGHT;
  return Math.round(size * scaleFactor);
};

// Moderate scale - combines width and height scaling
const moderateScale = (size: number, factor: number = 0.5): number => {
  const scaleFactor = SCREEN_WIDTH / BASE_WIDTH;
  return Math.round(size + (scaleFactor - 1) * size * factor);
};

// Font scaling with pixel ratio
const fontScale = (size: number): number => {
  const scaleFactor = SCREEN_WIDTH / BASE_WIDTH;
  const pixelRatio = PixelRatio.getFontScale();
  return Math.round(size * scaleFactor * pixelRatio);
};

// Get responsive padding
const getResponsivePadding = (base: number): number => {
  return moderateScale(base, 0.3);
};

// Get responsive margin
const getResponsiveMargin = (base: number): number => {
  return moderateScale(base, 0.3);
};

// Get responsive button height
const getButtonHeight = (size: 'sm' | 'md' | 'lg' = 'md'): number => {
  const baseHeights = {
    sm: 32,
    md: 44,
    lg: 52,
  };
  return moderateScale(baseHeights[size], 0.2);
};

// Get responsive font size
const getFontSize = (size: number): number => {
  return fontScale(size);
};

// Check if device is tablet or foldable
const isTablet = (): boolean => {
  const aspectRatio = SCREEN_HEIGHT / SCREEN_WIDTH;
  return (
    (SCREEN_WIDTH >= 600 && SCREEN_HEIGHT >= 600) ||
    (Platform.OS === 'android' && SCREEN_WIDTH >= 600) ||
    aspectRatio < 1.6
  );
};

// Check if device is small
const isSmallDevice = (): boolean => {
  return SCREEN_WIDTH < 360;
};

// Check if device is large (tablet/foldable unfolded)
const isLargeDevice = (): boolean => {
  return SCREEN_WIDTH >= 768;
};

export {
  scale,
  verticalScale,
  moderateScale,
  fontScale,
  getResponsivePadding,
  getResponsiveMargin,
  getButtonHeight,
  getFontSize,
  isTablet,
  isSmallDevice,
  isLargeDevice,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
};

