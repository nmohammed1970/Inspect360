/**
 * Typography system matching web application
 */

export const typography = {
  // Font families - using system fonts for modern look
  // iOS: SF Pro (automatically used), Android: Roboto (automatically used)
  fontFamily: {
    sans: 'System', // Modern system fonts - SF Pro on iOS, Roboto on Android
    serif: 'System',
    mono: 'Courier',
  },
  
  // Font sizes (matching web app's text scale)
  fontSize: {
    xs: 12,    // 0.75rem
    sm: 14,    // 0.875rem
    base: 16,  // 1rem
    lg: 18,    // 1.125rem
    xl: 20,    // 1.25rem
    '2xl': 24, // 1.5rem
    '3xl': 30, // 1.875rem
    '4xl': 36, // 2.25rem
  },
  
  // Font weights - refined for modern look
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    // Additional weights for flexibility
    light: '300' as const,
    extrabold: '800' as const,
  },
  
  // Line heights
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
  
};

// Text styles (predefined combinations)
export const textStyles = {
  h1: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.tight,
  },
  h2: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.tight,
  },
  h3: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.normal,
  },
  h4: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.normal,
  },
  body: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.normal,
    lineHeight: typography.lineHeight.normal,
  },
  bodySmall: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.normal,
    lineHeight: typography.lineHeight.normal,
  },
  caption: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.normal,
    lineHeight: typography.lineHeight.normal,
  },
  button: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.normal,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.normal,
  },
};

export default typography;

