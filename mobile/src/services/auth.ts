import { apiRequestJson } from './api';
import type { User } from '../types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  message?: string;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      if (__DEV__) {
        console.log('[authService] Calling login API');
      }
      // Backend returns user directly, not wrapped in { user: ... }
      const user = await apiRequestJson<User>('POST', '/api/login', credentials);
      if (__DEV__) {
        console.log('[authService] Login API returned user:', {
          id: user?.id,
          role: user?.role,
        });
      }
      
      if (!user || !user.id) {
        if (__DEV__) {
          console.error('[authService] Login response missing user data');
        }
        throw new Error('Login failed. Invalid response from server.');
      }
      
      return { user };
    } catch (error: any) {
      if (__DEV__) {
        console.error('[authService] Login error:', {
          message: error?.message,
          status: error?.status,
          name: error?.name,
        });
      }
      throw error;
    }
  },

  async logout(): Promise<void> {
    await apiRequestJson('POST', '/api/logout');
  },

  async getCurrentUser(): Promise<User> {
    // Try /api/auth/user first (from routes.ts), fallback to /api/user (from auth.ts)
    try {
      return await apiRequestJson<User>('GET', '/api/auth/user');
    } catch (error) {
      // Fallback to /api/user if /api/auth/user doesn't work
      return await apiRequestJson<User>('GET', '/api/user');
    }
  },

  async getProfile(): Promise<User> {
    return apiRequestJson<User>('GET', '/api/auth/profile');
  },

  async getUser(userId: string): Promise<User> {
    return apiRequestJson<User>('GET', `/api/users/${userId}`);
  },
};

