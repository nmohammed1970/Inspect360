/**
 * Color system matching web application's HSL-based design tokens
 * Based on Tailwind CSS variables from web app
 */

// Primary colors - matching web app's primary color scheme
export const colors = {
  // Base colors
  background: '#ffffff',
  foreground: '#0a0a0a',
  border: '#e5e5e5',
  input: '#e5e5e5',
  
  // Card colors
  card: {
    DEFAULT: '#ffffff',
    foreground: '#0a0a0a',
    border: '#e5e5e5',
  },
  
  // Primary colors (teal-blue theme)
  primary: {
    DEFAULT: '#00CED1', // Teal-blue (cyan/darkturquoise)
    foreground: '#ffffff',
    border: '#00A8B0',
    light: '#E0F7FA',
    dark: '#008B8D',
  },
  
  // Secondary colors
  secondary: {
    DEFAULT: '#f5f5f5',
    foreground: '#0a0a0a',
    border: '#e5e5e5',
  },
  
  // Muted colors
  muted: {
    DEFAULT: '#f5f5f5',
    foreground: '#737373',
    border: '#e5e5e5',
  },
  
  // Accent colors
  accent: {
    DEFAULT: '#f5f5f5',
    foreground: '#0a0a0a',
    border: '#e5e5e5',
  },
  
  // Destructive (error) colors
  destructive: {
    DEFAULT: '#ef4444',
    foreground: '#ffffff',
    border: '#dc2626',
  },
  
  // Status colors
  status: {
    online: '#22c55e', // green-500
    away: '#fbbf24', // lighter amber-400
    busy: '#ef4444', // red-500
    offline: '#9ca3af', // gray-400
  },
  
  // Success color
  success: '#22c55e',
  
  // Warning color - lighter orange/amber for better UI
  warning: '#fbbf24', // Lighter amber-400 instead of amber-500
  
  // Text colors
  text: {
    primary: '#0a0a0a',
    secondary: '#737373',
    muted: '#a3a3a3',
    inverse: '#ffffff',
  },
  
  // Border colors
  border: {
    DEFAULT: '#e5e5e5',
    light: '#f5f5f5',
    dark: '#d4d4d4',
  },
};

// Dark mode colors (for future support)
export const darkColors = {
  background: '#0a0a0a',
  foreground: '#fafafa',
  border: '#262626',
  input: '#262626',
  
  card: {
    DEFAULT: '#171717',
    foreground: '#fafafa',
    border: '#262626',
  },
  
  primary: {
    DEFAULT: '#3b82f6',
    foreground: '#ffffff',
    border: '#2563eb',
  },
  
  secondary: {
    DEFAULT: '#262626',
    foreground: '#fafafa',
    border: '#404040',
  },
  
  muted: {
    DEFAULT: '#262626',
    foreground: '#a3a3a3',
    border: '#404040',
  },
};

export default colors;

