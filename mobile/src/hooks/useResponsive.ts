import { useMemo } from 'react';
import { useWindowDimensions, Dimensions } from 'react-native';
import {
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
  getResponsiveValue,
  stackOnSmall,
  getFormMaxWidth,
  getModalMaxHeight,
} from '../utils/responsive';

/**
 * Live window metrics + responsive helpers.
 * Prefer this over StyleSheet-time Dimensions.get / SCREEN_WIDTH for layout.
 */
export function useResponsive() {
  const window = useWindowDimensions();
  const width = window?.width || Dimensions.get('window').width;
  const height = window?.height || Dimensions.get('window').height;

  return useMemo(
    () => ({
      width,
      height,
      isSmall: isSmallDevice(width),
      isTablet: isTablet(width, height),
      isLarge: isLargeDevice(width),
      formMaxWidth: getFormMaxWidth(width),
      modalMaxHeight: (fraction = 0.9) => getModalMaxHeight(fraction, height),
      stackDirection: (threshold = 375) => stackOnSmall(width, threshold),
      scale: (size: number) => scale(size, width),
      verticalScale: (size: number) => verticalScale(size, height),
      moderateScale: (size: number, factor = 0.5) => moderateScale(size, factor, width),
      fontScale: (size: number) => fontScale(size, width),
      getFontSize: (size: number) => getFontSize(size, width),
      getButtonHeight: (size: 'sm' | 'md' | 'lg' = 'md') => getButtonHeight(size, width),
      getResponsivePadding: (base: number) => getResponsivePadding(base, width),
      getResponsiveMargin: (base: number) => getResponsiveMargin(base, width),
      getResponsiveValue: <T,>(values: { small: T; medium: T; large: T }) =>
        getResponsiveValue(values, width),
    }),
    [width, height],
  );
}

export default useResponsive;
