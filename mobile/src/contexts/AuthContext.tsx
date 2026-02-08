import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/auth';
import { getAPI_URL } from '../services/api';
import { biometricService } from '../services/biometric';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => void;
  // Biometric credential storage
  storeBiometricCredentials: (email: string, password: string, skipAuth?: boolean) => Promise<void>;
  getBiometricCredentials: () => Promise<{ email: string; password: string } | null>;
  clearBiometricCredentials: () => Promise<void>;
  getStoredEmail: () => Promise<string | null>;
  hasBiometricCredentials: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'user_session';
const BIOMETRIC_EMAIL_KEY = 'biometric_email';
const BIOMETRIC_PASSWORD_KEY = 'biometric_password';
const LAST_LOGIN_EMAIL_KEY = 'last_login_email';

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
      if (__DEV__) {
        console.log('[AuthContext] Current user updated, role:', currentUser.role);
      }
      // Verify the user from server is still a clerk
      if (currentUser.role !== 'clerk') {
        if (__DEV__) {
          console.warn('[AuthContext] User from server is not a clerk, clearing session');
        }
        // Clear invalid session if role changed
        setUser(null);
        deleteStorageItem(USER_STORAGE_KEY);
        queryClient.clear();
        return;
      }
      
      setUser(currentUser);
      setStorageItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
      if (__DEV__) {
        console.log('[AuthContext] User state updated, isAuthenticated should be true');
      }
    }
  }, [currentUser]);

  const checkStoredSession = async () => {
    try {
      if (__DEV__) {
        console.log('[AuthContext] Checking stored session...');
      }
      const storedUser = await getStorageItem(USER_STORAGE_KEY);
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        if (__DEV__) {
          console.log('[AuthContext] Found stored user, role:', parsedUser.role);
        }
        
        // Verify the stored user is still a clerk
        if (parsedUser.role !== 'clerk') {
          if (__DEV__) {
            console.warn('[AuthContext] Stored user is not a clerk, clearing session');
          }
          // Clear invalid session
          await deleteStorageItem(USER_STORAGE_KEY);
          setUser(null);
          return;
        }
        
        // Set user immediately for faster UI
        setUser(parsedUser);
        // Verify session is still valid in background
        refetch().catch((error) => {
          if (__DEV__) {
            console.error('[AuthContext] Failed to verify stored session:', error);
          }
          // If verification fails, clear the stored session
          setUser(null);
          deleteStorageItem(USER_STORAGE_KEY);
        });
      } else {
        if (__DEV__) {
          console.log('[AuthContext] No stored session found');
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[AuthContext] Error checking stored session:', error);
      }
    }
  };

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      try {
        if (__DEV__) {
          console.log('[AuthContext] Attempting login');
        }
        const response = await authService.login({ email, password });
        if (__DEV__) {
          console.log('[AuthContext] Login response received:', {
            hasUser: !!response.user,
            userId: response.user?.id,
            userRole: response.user?.role,
          });
        }
        
        // Backend returns user directly, but authService wraps it in { user }
        const userData = response.user;
        
        if (!userData) {
          if (__DEV__) {
            console.error('[AuthContext] Login response missing user data');
          }
          throw new Error('Login failed. Please try again.');
        }
      
        // Check if user is a clerk (inspector)
        if (userData.role !== 'clerk') {
          if (__DEV__) {
            console.warn('[AuthContext] User is not a clerk, role:', userData.role);
          }
          // Clear any stored data
          await deleteStorageItem(USER_STORAGE_KEY);
          queryClient.clear();
          throw new Error('Access denied. This app is only for inspectors (clerks).');
        }
      
        if (__DEV__) {
          console.log('[AuthContext] Login successful, user is a clerk');
        }
        return userData;
      } catch (error: any) {
        if (__DEV__) {
          console.error('[AuthContext] Login error:', {
            message: error?.message,
            status: error?.status,
            name: error?.name,
            error: error,
          });
        }
        
        // Preserve the original error structure, especially status code
        // Create a new error object that preserves all properties
        const preservedError: any = new Error(error?.message || 'Login failed. Please try again.');
        
        // Copy all properties from original error
        if (error?.status) {
          preservedError.status = error.status;
        }
        if (error?.name) {
          preservedError.name = error.name;
        }
        
        // Transform authentication errors to user-friendly messages
        if (error?.status === 401 || error?.status === 403) {
          preservedError.message = 'Wrong credentials. Please try again.';
          preservedError.status = error.status;
        }
        
        // Re-throw with preserved structure
        throw preservedError;
      }
    },
    onSuccess: async (userData) => {
      if (__DEV__) {
        console.log('[AuthContext] Login success');
      }
      setUser(userData);
      await setStorageItem(USER_STORAGE_KEY, JSON.stringify(userData));
      queryClient.setQueryData(['/api/auth/user'], userData);
      
      // Store last login email for auto-fill
      const email = (loginMutation.variables as any)?.email;
      if (email) {
        await setStorageItem(LAST_LOGIN_EMAIL_KEY, email);
      }
      
      // If user has biometricEnabled in profile, store credentials
      // Note: We'll check this from the profile API in LoginScreen after login
      // This is just a placeholder - actual storage happens in LoginScreen
      
      // No local database - all data is stored on server only
      if (__DEV__) {
        console.log('[AuthContext] User state set, isAuthenticated should now be:', !!userData);
      }
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
      
      // Note: We don't clear biometric credentials on logout
      // They should only be cleared when user disables biometric in profile
      // This allows user to use biometric login after logout
      
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

  // Biometric credential storage functions
  const storeBiometricCredentials = async (email: string, password: string, skipAuth: boolean = false) => {
    try {
      // Store email (readable without biometric for auto-fill)
      await setStorageItem(BIOMETRIC_EMAIL_KEY, email);
      // Store last login email (for auto-fill even if biometric disabled)
      await setStorageItem(LAST_LOGIN_EMAIL_KEY, email);
      
      // Store password with biometric protection (requires authentication to read)
      // On native platforms, SecureStore can use biometric protection
      if (Platform.OS !== 'web') {
        // In production builds, requireAuthentication might prompt during WRITE operations too
        // When skipAuth is true, user already authenticated, so don't require auth during storage
        // We'll still require auth when reading (which is what matters for security)
        if (skipAuth) {
          // Store without requireAuthentication to avoid double prompt during enable flow
          // The password is still stored securely, and reading will require biometric
          await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, password);
        } else {
          // Normal storage - use requireAuthentication for extra security
          await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, password, {
            requireAuthentication: true,
            authenticationPrompt: 'Authenticate to access stored password',
          });
        }
      } else {
        // Web fallback - still use secure storage but without biometric
        await setStorageItem(BIOMETRIC_PASSWORD_KEY, password);
      }
      
      if (__DEV__) {
        console.log('[AuthContext] Biometric credentials stored', skipAuth ? '(skipAuth=true)' : '');
      }
    } catch (error) {
      console.error('[AuthContext] Error storing biometric credentials:', error);
      throw error;
    }
  };

  const getBiometricCredentials = async (): Promise<{ email: string; password: string } | null> => {
    try {
      // Get email (doesn't require biometric)
      const email = await getStorageItem(BIOMETRIC_EMAIL_KEY);
      if (!email) {
        return null;
      }

      // Get password (requires biometric on native)
      let password: string | null = null;
      if (Platform.OS !== 'web') {
        try {
          password = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY, {
            requireAuthentication: true,
            authenticationPrompt: 'Authenticate to login',
          });
        } catch (error: any) {
          // If biometric authentication fails, return null
          if (error?.message?.includes('cancel') || error?.message?.includes('User canceled')) {
            if (__DEV__) {
              console.log('[AuthContext] Biometric authentication cancelled');
            }
            return null;
          }
          throw error;
        }
      } else {
        password = await getStorageItem(BIOMETRIC_PASSWORD_KEY);
      }

      if (!password) {
        return null;
      }

      return { email, password };
    } catch (error) {
      console.error('[AuthContext] Error getting biometric credentials:', error);
      return null;
    }
  };

  const clearBiometricCredentials = async () => {
    try {
      await deleteStorageItem(BIOMETRIC_EMAIL_KEY);
      await deleteStorageItem(BIOMETRIC_PASSWORD_KEY);
      // Keep last_login_email for convenience (auto-fill even if biometric disabled)
      if (__DEV__) {
        console.log('[AuthContext] Biometric credentials cleared');
      }
    } catch (error) {
      console.error('[AuthContext] Error clearing biometric credentials:', error);
    }
  };

  const getStoredEmail = async (): Promise<string | null> => {
    try {
      // First try biometric email, then fall back to last login email
      const biometricEmail = await getStorageItem(BIOMETRIC_EMAIL_KEY);
      if (biometricEmail) {
        return biometricEmail;
      }
      return await getStorageItem(LAST_LOGIN_EMAIL_KEY);
    } catch (error) {
      console.error('[AuthContext] Error getting stored email:', error);
      return null;
    }
  };

  const hasBiometricCredentials = async (): Promise<boolean> => {
    try {
      // Only check email - don't try to read password as it requires biometric
      // This prevents any prompts when just checking if credentials exist
      const email = await getStorageItem(BIOMETRIC_EMAIL_KEY);
      if (!email) {
        return false;
      }
      
      // On native, we can't check if password exists without triggering biometric prompt
      // So we assume if email exists, password is stored (we can't verify without prompting)
      // The actual password retrieval will happen in getBiometricCredentials() with proper auth
      if (Platform.OS !== 'web') {
        // If email exists, assume password is stored (we can't check without prompting)
        return true;
      } else {
        // Web: check if password exists (doesn't require biometric)
        const password = await getStorageItem(BIOMETRIC_PASSWORD_KEY);
        return !!password;
      }
    } catch (error) {
      return false;
    }
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
        storeBiometricCredentials,
        getBiometricCredentials,
        clearBiometricCredentials,
        getStoredEmail,
        hasBiometricCredentials,
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

