import { useEffect, type ReactNode } from 'react';
import { Platform, StatusBar as RNStatusBar, View } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Keep system bars readable against the app chrome.
 * Light mode → dark status icons (clock / wifi / battery).
 * Dark mode → light status icons.
 * iOS: expo-status-bar only (RN setBarStyle / stack statusBarStyle crash Expo Go).
 */
export function useSystemBarsTheme() {
  const { isDark, colors } = useTheme();
  const bg = colors?.background ?? (isDark ? '#0a0a0a' : '#ffffff');

  // 'dark' = dark glyphs (for light backgrounds); 'light' = light glyphs (for dark backgrounds)
  const statusStyle: 'light' | 'dark' = isDark ? 'light' : 'dark';

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(bg).catch(() => {});

    if (Platform.OS !== 'android') return;

    try {
      RNStatusBar.setBarStyle(
        statusStyle === 'light' ? 'light-content' : 'dark-content',
        true,
      );
      // Paint a real white/dark bar so icons have contrast (don't leave transparent black).
      RNStatusBar.setTranslucent(false);
      RNStatusBar.setBackgroundColor(bg, true);
    } catch {
      // ignored when edge-to-edge forbids setBackgroundColor
    }

    try {
      NavigationBar.setStyle(isDark ? 'light' : 'dark');
    } catch {
      // older / web no-ops
    }
  }, [isDark, bg, statusStyle]);

  return { isDark, bg, statusStyle };
}

/** Fallback fill under the status bar when the system bar is translucent. */
function StatusBarBackground({ color }: { color: string }) {
  const insets = useSafeAreaInsets();
  if (insets.top <= 0) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: insets.top,
        backgroundColor: color,
        zIndex: 9999,
        elevation: 9999,
      }}
    />
  );
}

/** Syncs system bars + paints the root so light-mode icons stay visible. */
export function SystemBarsThemeSync({ children }: { children?: ReactNode }) {
  const { bg, statusStyle } = useSystemBarsTheme();

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={statusStyle} />
      {Platform.OS === 'android' ? <StatusBarBackground color={bg} /> : null}
      {children}
    </View>
  );
}
