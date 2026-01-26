import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/auth';
import { getAPI_URL } from '../services/api';
import { localDatabase } from '../services/localDatabase';
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

  // Fetch current user - use the same API_URL from api.ts
  const { data: currentUser, isLoading, refetch } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      try {
        const apiUrl = getAPI_URL();
        console.log('[AuthContext] Fetching user from:', apiUrl);
        // Try /api/auth/user first, fallback to /api/user
        try {
          const res = await fetch(`${apiUrl}/api/auth/user`, {
            credentials: 'include',
          });
          if (res.ok) {
            const user = await res.json();
            console.log('[AuthContext] User fetched successfully');
            return user;
          }
          // Fallback to /api/user
          console.log('[AuthContext] /api/auth/user failed, trying /api/user');
          const fallbackRes = await fetch(`${apiUrl}/api/user`, {
            credentials: 'include',
          });
          if (fallbackRes.ok) {
            const user = await fallbackRes.json();
            console.log('[AuthContext] User fetched from fallback endpoint');
            return user;
          }
          throw new Error('Failed to fetch user');
        } catch (error: any) {
          console.error('[AuthContext] Error fetching user:', error);
          console.error('[AuthContext] API_URL used:', apiUrl);
          throw error;
        }
      } catch (error: any) {
        // If getAPI_URL() throws, catch it and return null (user not logged in)
        console.error('[AuthContext] Error getting API URL:', error);
        return null;
      }
    },
    enabled: false, // Don't auto-fetch, we'll trigger manually
    retry: false,
  });

  useEffect(() => {
    // Check for stored session on mount
    // Only check if we don't already have a user (to avoid race conditions)
    if (!user) {
    checkStoredSession();
    }
  }, []); // Only run once on mount

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
      console.log('[AuthContext] Current user updated:', currentUser.email, 'role:', currentUser.role);
      // Verify the user from server is still a clerk
      if (currentUser.role !== 'clerk') {
        console.warn('[AuthContext] User from server is not a clerk, clearing session');
        // Clear invalid session if role changed
        setUser(null);
        deleteStorageItem(USER_STORAGE_KEY);
        queryClient.clear();
        return;
      }
      
      setUser(currentUser);
      setStorageItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
      console.log('[AuthContext] User state updated, isAuthenticated should be true');
    }
  }, [currentUser]);

  const checkStoredSession = async () => {
    try {
      console.log('[AuthContext] Checking stored session...');
      const storedUser = await getStorageItem(USER_STORAGE_KEY);
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        console.log('[AuthContext] Found stored user:', parsedUser.email, 'role:', parsedUser.role);
        
        // Verify the stored user is still a clerk
        if (parsedUser.role !== 'clerk') {
          console.warn('[AuthContext] Stored user is not a clerk, clearing session');
          // Clear invalid session
          await deleteStorageItem(USER_STORAGE_KEY);
          setUser(null);
          return;
        }
        
        // Set user immediately for faster UI
        setUser(parsedUser);
        // Verify session is still valid in background
        refetch().catch((error) => {
          console.error('[AuthContext] Failed to verify stored session:', error);
          // If verification fails, clear the stored session
          setUser(null);
          deleteStorageItem(USER_STORAGE_KEY);
        });
      } else {
        console.log('[AuthContext] No stored session found');
      }
    } catch (error) {
      console.error('[AuthContext] Error checking stored session:', error);
    }
  };

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      try {
        const response = await authService.login({ email, password });
        // Backend returns user directly, but authService wraps it in { user }
        const userData = response.user;
      
        // Check if user is a clerk (inspector)
        if (userData.role !== 'clerk') {
          // Clear any stored data
          await deleteStorageItem(USER_STORAGE_KEY);
          queryClient.clear();
          throw new Error('Access denied. This app is only for inspectors (clerks).');
        }
      
        return userData;
      } catch (error: any) {
        // Transform authentication errors to user-friendly messages
        if (error?.status === 401 || error?.status === 403) {
          throw new Error('Email or password is incorrect. Please try again.');
        }
        // Re-throw other errors as-is (they should already have user-friendly messages)
        throw error;
      }
    },
    onSuccess: async (userData) => {
      console.log('[AuthContext] Login success, setting user:', userData.email);
      console.log('[AuthContext] User data:', JSON.stringify(userData, null, 2));
      setUser(userData);
      await setStorageItem(USER_STORAGE_KEY, JSON.stringify(userData));
      queryClient.setQueryData(['/api/auth/user'], userData);
      // On shared devices, ensure offline inspections are scoped to this user only
      try {
        await localDatabase.initialize();
        await localDatabase.purgeInspectionsNotOwned(userData.id);
        queryClient.invalidateQueries({ queryKey: ['local-inspections', userData.id] });
      } catch (e) {
        console.warn('[AuthContext] Failed to purge other users inspections:', e);
      }
      console.log('[AuthContext] User state set, isAuthenticated should now be:', !!userData);
    },
    onError: (error: Error) => {
      // Error will propagate to LoginScreen - no need to log here
      // LoginScreen will handle displaying the error to the user
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
      await authService.logout();
      } catch (error) {
        // Even if logout API call fails, we should still clear local state
        console.warn('[AuthContext] Logout API call failed, but clearing local state anyway:', error);
      }
    },
    onSuccess: async () => {
      // Clear user state first
      setUser(null);
      await deleteStorageItem(USER_STORAGE_KEY);
      
      // Cancel all pending queries to prevent 401 errors
      queryClient.cancelQueries();
      
      // Clear all query cache
      queryClient.clear();
      
      // Reset all queries to prevent refetching
      queryClient.resetQueries();
      
      console.log('[AuthContext] Logout successful - all queries cleared');
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

