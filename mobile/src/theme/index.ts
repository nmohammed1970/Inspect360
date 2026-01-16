/**
 * Theme index - exports all theme tokens
 */

import colors from './colors';
import spacing from './spacing';
import typography from './typography';

// Border radius matching web app (lg: 9px, md: 6px, sm: 3px)
export const borderRadius = {
  none: 0,
  sm: 3,   // 0.1875rem
  md: 6,   // 0.375rem
  lg: 9,   // 0.5625rem
  xl: 12,  // 0.75rem
  '2xl': 16, // 1rem
  full: 9999,
};

// Shadow/elevation system matching web app's hover-elevate and active-elevate-2
export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  // Hover elevation (slightly raised)
  hover: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  // Active elevation (pressed state)
  active: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
};

export { colors, spacing, typography };

export default {
  colors,
  spacing,
  typography,
  borderRadius,
  shadows,
};

