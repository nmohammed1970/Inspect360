/**
 * Spacing scale matching web application
 * Base unit: 4px (0.25rem)
 */

export const spacing = {
  // Base spacing units (4px increments)
  0: 0,
  1: 4,   // 0.25rem
  2: 8,   // 0.5rem
  3: 12,  // 0.75rem
  4: 16,  // 1rem
  5: 20,  // 1.25rem
  6: 24,  // 1.5rem
  8: 32,  // 2rem
  10: 40, // 2.5rem
  12: 48, // 3rem
  16: 64, // 4rem
  20: 80, // 5rem
  24: 96, // 6rem
  
  // Common spacing patterns
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
};

// Padding presets
export const padding = {
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  card: spacing.md, // 16px
  screen: spacing.md, // 16px
  button: {
    sm: { vertical: 8, horizontal: 12 },
    md: { vertical: 10, horizontal: 16 },
    lg: { vertical: 12, horizontal: 24 },
  },
};

// Margin presets
export const margin = {
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
};

// Gap presets (for flex layouts)
export const gap = {
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
};

export default spacing;

