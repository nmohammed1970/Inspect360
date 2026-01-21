/**
 * Theme index - exports all theme tokens
 */

import colors from './colors';
import spacing from './spacing';
import typography from './typography';

// Border radius - enhanced for modern, rounded UI
export const borderRadius = {
  none: 0,
  sm: 4,   // Slightly larger for modern look
  md: 8,   // More rounded
  lg: 12,  // More rounded
  xl: 16,  // More rounded
  '2xl': 20, // More rounded
  '3xl': 24, // Extra rounded
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
    shadowOpacity: 0.08, // Slightly lighter
    shadowRadius: 4, // Softer
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, // Softer
    shadowRadius: 8, // Softer, more modern
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16, // Softer, more modern
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

