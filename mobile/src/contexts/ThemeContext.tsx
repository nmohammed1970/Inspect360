import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { useColorScheme, Appearance, AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors as lightColors, darkColors } from '../theme/colors';

export type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: 'light' | 'dark';
  themeMode: ThemeMode;
  colors: typeof lightColors;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'app_theme_mode';

const setStorageItem = async (key: string, value: string) => {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const getStorageItem = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return await AsyncStorage.getItem(key);
  }
  return await SecureStore.getItemAsync(key);
};

function resolveScheme(scheme: string | null | undefined): 'light' | 'dark' {
  return scheme === 'dark' ? 'dark' : 'light';
}

function readOsScheme(): 'light' | 'dark' {
  return resolveScheme(Appearance.getColorScheme());
}

/**
 * App theme is entirely JS-driven.
 *
 * Do NOT call Appearance.setColorScheme():
 * - Forcing light/dark overrides the real OS preference.
 * - Passing null crashes Android (Kotlin non-null style parameter).
 * Light/Dark/System are applied only via our React theme colors.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const hookColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('auto');
  const [osScheme, setOsScheme] = useState<'light' | 'dark'>(readOsScheme);
  const [, setIsInitialized] = useState(false);

  // Track the real device appearance.
  useEffect(() => {
    const syncOsScheme = () => {
      setOsScheme(readOsScheme());
    };

    syncOsScheme();

    const appearanceSub = Appearance.addChangeListener(({ colorScheme }) => {
      setOsScheme(resolveScheme(colorScheme));
    });

    // Android often only refreshes appearance after resume from Settings.
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncOsScheme();
      }
    });

    return () => {
      appearanceSub.remove();
      appStateSub.remove();
    };
  }, []);

  // Keep in sync with useColorScheme when RN reports a concrete value.
  useEffect(() => {
    if (hookColorScheme === 'dark' || hookColorScheme === 'light') {
      setOsScheme(hookColorScheme);
    }
  }, [hookColorScheme]);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedMode = await getStorageItem(THEME_STORAGE_KEY);
        if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'auto') {
          setThemeModeState(savedMode);
        }
      } catch (error) {
        console.error('Error loading theme preference:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    loadTheme();
  }, []);

  const actualTheme: 'light' | 'dark' = useMemo(() => {
    if (themeMode === 'auto') {
      return osScheme;
    }
    return themeMode;
  }, [themeMode, osScheme]);

  const isDark = actualTheme === 'dark';
  const themeColors = (isDark ? darkColors : lightColors) || lightColors;

  const setThemeMode = async (mode: ThemeMode) => {
    try {
      await setStorageItem(THEME_STORAGE_KEY, mode);
      if (mode === 'auto') {
        // Fresh read so System mode matches the device right away.
        setOsScheme(readOsScheme());
      }
      setThemeModeState(mode);
    } catch (error) {
      console.error('Error saving theme preference:', error);
      throw error;
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: actualTheme,
        themeMode,
        colors: themeColors,
        setThemeMode,
        isDark,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    console.warn('useTheme called outside ThemeProvider, using default colors');
    return {
      theme: 'light' as const,
      themeMode: 'auto' as ThemeMode,
      colors: lightColors,
      setThemeMode: async () => {},
      isDark: false,
    };
  }
  if (!context.colors) {
    console.warn('Theme context colors is undefined, using default colors');
    return {
      ...context,
      colors: lightColors,
    };
  }
  return {
    ...context,
    colors: context.colors || lightColors,
  };
}
