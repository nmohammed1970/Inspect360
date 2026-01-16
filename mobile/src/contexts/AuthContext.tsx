import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/auth';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'user_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const queryClient = useQueryClient();

  // Fetch current user
  const { data: currentUser, isLoading, refetch } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      // Try /api/auth/user first, fallback to /api/user
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5005'}/api/auth/user`, {
          credentials: 'include',
        });
        if (res.ok) {
          return await res.json();
        }
        // Fallback to /api/user
        const fallbackRes = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5005'}/api/user`, {
          credentials: 'include',
        });
        if (fallbackRes.ok) {
          return await fallbackRes.json();
        }
        throw new Error('Failed to fetch user');
      } catch (error) {
        throw error;
      }
    },
    enabled: false, // Don't auto-fetch, we'll trigger manually
    retry: false,
  });

  useEffect(() => {
    // Check for stored session on mount
    checkStoredSession();
  }, []);

  // Storage helper functions that work on both native and web
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
    } else {
      return await SecureStore.getItemAsync(key);
    }
  };

  const deleteStorageItem = async (key: string) => {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  };

  useEffect(() => {
    if (currentUser) {
      setUser(currentUser);
      setStorageItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
    }
  }, [currentUser]);

  const checkStoredSession = async () => {
    try {
      const storedUser = await getStorageItem(USER_STORAGE_KEY);
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        // Verify session is still valid
        refetch();
      }
    } catch (error) {
      console.error('Error checking stored session:', error);
    }
  };

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await authService.login({ email, password });
      // Backend returns user directly, but authService wraps it in { user }
      return response.user;
    },
    onSuccess: async (userData) => {
      setUser(userData);
      await setStorageItem(USER_STORAGE_KEY, JSON.stringify(userData));
      queryClient.setQueryData(['/api/auth/user'], userData);
    },
    onError: (error: Error) => {
      console.error('Login error:', error);
      throw error;
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await authService.logout();
    },
    onSuccess: async () => {
      setUser(null);
      await deleteStorageItem(USER_STORAGE_KEY);
      queryClient.clear();
    },
  });

  const login = async (email: string, password: string) => {
    await loginMutation.mutateAsync({ email, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const refetchUser = () => {
    refetch();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isLoading || loginMutation.isPending || logoutMutation.isPending,
        isAuthenticated: !!user,
        login,
        logout,
        refetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

